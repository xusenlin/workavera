package docs

import (
	"context"
	"errors"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	CollectionName         = "docs"
	VersionsCollectionName = "doc_versions"
	PinsCollectionName     = "doc_pins"
	maxPinnedDocuments     = 6
)

var (
	ErrNotFound     = errors.New("document not found")
	ErrForbidden    = errors.New("document access denied")
	ErrConflict     = errors.New("document has a newer revision")
	ErrInvalidInput = errors.New("invalid document input")
	ErrPinLimit     = errors.New("you can pin at most 6 documents")
)

type Document struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Content      string `json:"content"`
	OwnerID      string `json:"ownerId"`
	ProjectID    string `json:"projectId,omitempty"`
	ProjectName  string `json:"projectName,omitempty"`
	Status       string `json:"status"`
	Revision     int    `json:"revision"`
	LastEditedBy string `json:"lastEditedBy"`
	Created      string `json:"created"`
	Updated      string `json:"updated"`
}

type Version struct {
	ID        string `json:"id"`
	Revision  int    `json:"revision"`
	Title     string `json:"title"`
	Content   string `json:"content,omitempty"`
	CreatedBy string `json:"createdBy"`
	Source    string `json:"source"`
	Created   string `json:"created"`
}

type CreateInput struct {
	Title     string `json:"title"`
	Content   string `json:"content"`
	ProjectID string `json:"projectId"`
	Source    string `json:"-"`
}

type UpdateInput struct {
	Title        string `json:"title"`
	Content      string `json:"content"`
	BaseRevision int    `json:"baseRevision"`
	Source       string `json:"-"`
}

type SearchOptions struct {
	Query string
	Limit int
}

func Create(ctx context.Context, app core.App, actorID string, input CreateInput) (Document, error) {
	if err := requireActor(ctx, app, actorID); err != nil {
		return Document{}, err
	}
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" || len(input.Title) > 240 {
		return Document{}, ErrInvalidInput
	}
	if input.ProjectID != "" {
		canEdit, err := canEditProject(app, actorID, input.ProjectID)
		if err != nil || !canEdit {
			return Document{}, ErrForbidden
		}
	}
	if input.Source != "ai" {
		input.Source = "user"
	}

	var id string
	err := app.RunInTransaction(func(tx core.App) error {
		collection, err := tx.FindCollectionByNameOrId(CollectionName)
		if err != nil {
			return err
		}
		record := core.NewRecord(collection)
		record.Set("title", input.Title)
		record.Set("content", input.Content)
		record.Set("owner", actorID)
		record.Set("project", input.ProjectID)
		record.Set("status", "draft")
		record.Set("revision", 1)
		record.Set("last_edited_by", actorID)
		if err := tx.Save(record); err != nil {
			return err
		}
		id = record.Id
		return saveVersion(tx, record, actorID, input.Source)
	})
	if err != nil {
		return Document{}, err
	}
	return Get(ctx, app, actorID, id)
}

func Get(ctx context.Context, app core.App, actorID, id string) (Document, error) {
	if err := ctx.Err(); err != nil {
		return Document{}, err
	}
	record, err := accessibleRecord(app, actorID, id)
	if err != nil {
		return Document{}, err
	}
	return documentForRecord(app, record), nil
}

func Update(ctx context.Context, app core.App, actorID, id string, input UpdateInput) (Document, bool, error) {
	if err := ctx.Err(); err != nil {
		return Document{}, false, err
	}
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" || len(input.Title) > 240 || input.BaseRevision < 1 {
		return Document{}, false, ErrInvalidInput
	}
	if input.Source != "ai" && input.Source != "restore" {
		input.Source = "user"
	}

	changed := false
	err := app.RunInTransaction(func(tx core.App) error {
		record, err := editableRecord(tx, actorID, id)
		if err != nil {
			return err
		}
		if record.GetInt("revision") != input.BaseRevision {
			return ErrConflict
		}
		if record.GetString("title") == input.Title && record.GetString("content") == input.Content {
			return nil
		}
		record.Set("title", input.Title)
		record.Set("content", input.Content)
		record.Set("revision", input.BaseRevision+1)
		record.Set("last_edited_by", actorID)
		if err := tx.Save(record); err != nil {
			return err
		}
		changed = true
		return saveVersion(tx, record, actorID, input.Source)
	})
	if err != nil {
		return Document{}, false, err
	}
	doc, err := Get(ctx, app, actorID, id)
	return doc, changed, err
}

func Search(ctx context.Context, app core.App, actorID string, options SearchOptions) ([]Document, error) {
	if err := requireActor(ctx, app, actorID); err != nil {
		return nil, err
	}
	limit := options.Limit
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	access := `((project = "" && owner = {:actor}) || project.owner = {:actor} || project.board_project_members_via_project.user ?= {:actor})`
	filter := access + ` && status = "draft"`
	params := dbx.Params{"actor": actorID}
	if query := strings.TrimSpace(options.Query); query != "" {
		filter += ` && (title ~ {:query} || content ~ {:query})`
		params["query"] = query
	}
	records, err := app.FindRecordsByFilter(CollectionName, filter, "-updated", limit, 0, params)
	if err != nil {
		return nil, err
	}
	result := make([]Document, 0, len(records))
	for _, record := range records {
		doc := documentForRecord(app, record)
		if len(doc.Content) > 500 {
			doc.Content = doc.Content[:500]
		}
		result = append(result, doc)
	}
	return result, nil
}

func ListVersions(ctx context.Context, app core.App, actorID, id string) ([]Version, error) {
	if _, err := accessibleRecord(app, actorID, id); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	records, err := app.FindRecordsByFilter(VersionsCollectionName, "doc = {:doc}", "-revision", 100, 0, dbx.Params{"doc": id})
	if err != nil {
		return nil, err
	}
	versions := make([]Version, 0, len(records))
	for _, record := range records {
		versions = append(versions, versionForRecord(record, false))
	}
	return versions, nil
}

func GetVersion(ctx context.Context, app core.App, actorID, id string, revision int) (Version, error) {
	if _, err := accessibleRecord(app, actorID, id); err != nil {
		return Version{}, err
	}
	if err := ctx.Err(); err != nil {
		return Version{}, err
	}
	record, err := app.FindFirstRecordByFilter(VersionsCollectionName, "doc = {:doc} && revision = {:revision}", dbx.Params{"doc": id, "revision": revision})
	if err != nil {
		return Version{}, ErrNotFound
	}
	return versionForRecord(record, true), nil
}

func Restore(ctx context.Context, app core.App, actorID, id string, revision, baseRevision int) (Document, error) {
	version, err := GetVersion(ctx, app, actorID, id, revision)
	if err != nil {
		return Document{}, err
	}
	doc, _, err := Update(ctx, app, actorID, id, UpdateInput{Title: version.Title, Content: version.Content, BaseRevision: baseRevision, Source: "restore"})
	return doc, err
}

func MoveToProject(ctx context.Context, app core.App, actorID, id, projectID string) (Document, error) {
	if err := ctx.Err(); err != nil {
		return Document{}, err
	}
	if projectID == "" {
		return Document{}, ErrInvalidInput
	}
	canEdit, err := canEditProject(app, actorID, projectID)
	if err != nil || !canEdit {
		return Document{}, ErrForbidden
	}
	err = app.RunInTransaction(func(tx core.App) error {
		record, err := tx.FindRecordById(CollectionName, id)
		if err != nil {
			return ErrNotFound
		}
		if record.GetString("owner") != actorID || record.GetString("project") != "" {
			return ErrForbidden
		}
		record.Set("project", projectID)
		return tx.Save(record)
	})
	if err != nil {
		return Document{}, err
	}
	return Get(ctx, app, actorID, id)
}

func ListPinned(ctx context.Context, app core.App, actorID string) ([]Document, error) {
	if err := requireActor(ctx, app, actorID); err != nil {
		return nil, err
	}
	pins, err := app.FindRecordsByFilter(PinsCollectionName, "user = {:user}", "-created", maxPinnedDocuments, 0, dbx.Params{"user": actorID})
	if err != nil {
		return nil, err
	}
	result := make([]Document, 0, len(pins))
	for _, pin := range pins {
		record, err := accessibleRecord(app, actorID, pin.GetString("doc"))
		if err == nil && record.GetString("status") == "draft" {
			result = append(result, documentForRecord(app, record))
		}
	}
	return result, nil
}

func SetPinned(ctx context.Context, app core.App, actorID, id string, pinned bool) error {
	if _, err := accessibleRecord(app, actorID, id); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	return app.RunInTransaction(func(tx core.App) error {
		existing, err := tx.FindRecordsByFilter(PinsCollectionName, "user = {:user} && doc = {:doc}", "", 1, 0, dbx.Params{"user": actorID, "doc": id})
		if err != nil {
			return err
		}
		if !pinned {
			if len(existing) > 0 {
				return tx.Delete(existing[0])
			}
			return nil
		}
		if len(existing) > 0 {
			return nil
		}
		count, err := tx.CountRecords(PinsCollectionName, dbx.HashExp{"user": actorID})
		if err != nil {
			return err
		}
		if count >= maxPinnedDocuments {
			return ErrPinLimit
		}
		collection, err := tx.FindCollectionByNameOrId(PinsCollectionName)
		if err != nil {
			return err
		}
		pin := core.NewRecord(collection)
		pin.Set("user", actorID)
		pin.Set("doc", id)
		return tx.Save(pin)
	})
}

func SetArchived(ctx context.Context, app core.App, actorID, id string, archived bool) (Document, error) {
	if err := ctx.Err(); err != nil {
		return Document{}, err
	}
	record, err := manageableRecord(app, actorID, id)
	if err != nil {
		return Document{}, err
	}
	status := "draft"
	if archived {
		status = "archived"
	}
	record.Set("status", status)
	if err := app.Save(record); err != nil {
		return Document{}, err
	}
	return documentForRecord(app, record), nil
}

func Delete(ctx context.Context, app core.App, actorID, id string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	record, err := manageableRecord(app, actorID, id)
	if err != nil {
		return err
	}
	return app.Delete(record)
}

func saveVersion(app core.App, doc *core.Record, actorID, source string) error {
	collection, err := app.FindCollectionByNameOrId(VersionsCollectionName)
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("doc", doc.Id)
	record.Set("revision", doc.GetInt("revision"))
	record.Set("title", doc.GetString("title"))
	record.Set("content", doc.GetString("content"))
	record.Set("created_by", actorID)
	record.Set("source", source)
	return app.Save(record)
}

func accessibleRecord(app core.App, actorID, id string) (*core.Record, error) {
	record, err := app.FindRecordById(CollectionName, id)
	if err != nil {
		return nil, ErrNotFound
	}
	projectID := record.GetString("project")
	if projectID == "" {
		if record.GetString("owner") == actorID {
			return record, nil
		}
		return nil, ErrNotFound
	}
	role, err := projectRole(app, actorID, projectID)
	if err != nil || role == "" {
		return nil, ErrNotFound
	}
	return record, nil
}

func editableRecord(app core.App, actorID, id string) (*core.Record, error) {
	record, err := accessibleRecord(app, actorID, id)
	if err != nil {
		return nil, err
	}
	if record.GetString("status") == "archived" {
		return nil, ErrForbidden
	}
	projectID := record.GetString("project")
	if projectID == "" {
		if record.GetString("owner") != actorID {
			return nil, ErrForbidden
		}
		return record, nil
	}
	role, _ := projectRole(app, actorID, projectID)
	if role == "viewer" || role == "" {
		return nil, ErrForbidden
	}
	return record, nil
}

func manageableRecord(app core.App, actorID, id string) (*core.Record, error) {
	record, err := accessibleRecord(app, actorID, id)
	if err != nil {
		return nil, err
	}
	if record.GetString("owner") != actorID {
		return nil, ErrForbidden
	}
	return record, nil
}

func canEditProject(app core.App, actorID, projectID string) (bool, error) {
	role, err := projectRole(app, actorID, projectID)
	return role == "owner" || role == "admin" || role == "member", err
}

func projectRole(app core.App, actorID, projectID string) (string, error) {
	project, err := app.FindRecordById("board_projects", projectID)
	if err != nil {
		return "", err
	}
	if project.GetString("owner") == actorID {
		return "owner", nil
	}
	membership, err := app.FindFirstRecordByFilter("board_project_members", "project = {:project} && user = {:user}", dbx.Params{"project": projectID, "user": actorID})
	if err != nil {
		return "", nil
	}
	return membership.GetString("role"), nil
}

func requireActor(ctx context.Context, app core.App, actorID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if actorID == "" {
		return ErrForbidden
	}
	if _, err := app.FindRecordById("users", actorID); err != nil {
		return ErrForbidden
	}
	return nil
}

func documentForRecord(app core.App, record *core.Record) Document {
	projectID := record.GetString("project")
	projectName := ""
	if projectID != "" {
		if project, err := app.FindRecordById("board_projects", projectID); err == nil {
			projectName = project.GetString("name")
		}
	}
	return Document{ID: record.Id, Title: record.GetString("title"), Content: record.GetString("content"), OwnerID: record.GetString("owner"), ProjectID: projectID, ProjectName: projectName, Status: record.GetString("status"), Revision: record.GetInt("revision"), LastEditedBy: record.GetString("last_edited_by"), Created: record.GetString("created"), Updated: record.GetString("updated")}
}

func versionForRecord(record *core.Record, includeContent bool) Version {
	version := Version{ID: record.Id, Revision: record.GetInt("revision"), Title: record.GetString("title"), CreatedBy: record.GetString("created_by"), Source: record.GetString("source"), Created: record.GetString("created")}
	if includeContent {
		version.Content = record.GetString("content")
	}
	return version
}
