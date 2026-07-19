package docs

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	CollectionName         = "docs"
	VersionsCollectionName = "doc_versions"
	PinsCollectionName     = "doc_pins"
	FoldersCollectionName  = "doc_folders"
	maxPinnedDocuments     = 10

	// KindMarkdown documents use the BlockNote editing flow; KindHTML
	// documents hold a self-contained HTML artifact rendered in a sandboxed
	// preview. The kind is fixed at creation: content mutations validate
	// against the stored kind, never against caller input.
	KindMarkdown = "markdown"
	KindHTML     = "html"
)

var (
	ErrNotFound     = errors.New("document not found")
	ErrForbidden    = errors.New("document access denied")
	ErrConflict     = errors.New("document has a newer revision")
	ErrInvalidInput = errors.New("invalid document input")
	ErrPinLimit     = errors.New("you can pin at most 10 documents")
)

type Document struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Kind         string `json:"kind"`
	Content      string `json:"content"`
	OwnerID      string `json:"ownerId"`
	ProjectID    string `json:"projectId,omitempty"`
	ProjectName  string `json:"projectName,omitempty"`
	FolderID     string `json:"folderId,omitempty"`
	FolderName   string `json:"folderName,omitempty"`
	Status       string `json:"status"`
	Revision     int    `json:"revision"`
	LastEditedBy string `json:"lastEditedBy"`
	Created      string `json:"created"`
	Updated      string `json:"updated"`
}

type DocumentSummary struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Kind         string `json:"kind"`
	OwnerID      string `json:"ownerId"`
	ProjectID    string `json:"projectId,omitempty"`
	ProjectName  string `json:"projectName,omitempty"`
	FolderID     string `json:"folderId,omitempty"`
	FolderName   string `json:"folderName,omitempty"`
	Status       string `json:"status"`
	Revision     int    `json:"revision"`
	LastEditedBy string `json:"lastEditedBy"`
	Created      string `json:"created"`
	Updated      string `json:"updated"`
}

type Folder struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	OwnerID string `json:"ownerId"`
	Created string `json:"created"`
	Updated string `json:"updated"`
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
	Kind      string `json:"kind"`
	Content   string `json:"content"`
	ProjectID string `json:"projectId"`
	FolderID  string `json:"folderId"`
	Source    string `json:"-"`
}

type UpdateInput struct {
	Title        string `json:"title"`
	Content      string `json:"content"`
	BaseRevision int    `json:"baseRevision"`
	Source       string `json:"-"`
}

type SearchOptions struct {
	Query     string
	Limit     int
	FolderID  string
	ProjectID string
	RootOnly  bool
}

type MoveInput struct {
	Destination   string `json:"destination"`
	DestinationID string `json:"destinationId"`
}

type ReplaceInput struct {
	ID           string `json:"id"`
	Find         string `json:"find"`
	Replace      string `json:"replace"`
	ReplaceAll   bool   `json:"replaceAll"`
	BaseRevision int    `json:"baseRevision"`
	Source       string `json:"-"`
}

type WriteChunkInput struct {
	ID           string `json:"id"`
	Content      string `json:"content"`
	Mode         string `json:"mode"`
	BaseRevision int    `json:"baseRevision"`
	Source       string `json:"-"`
}

func Create(ctx context.Context, app core.App, actorID string, input CreateInput) (Document, error) {
	if err := requireActor(ctx, app, actorID); err != nil {
		return Document{}, err
	}
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" || len(input.Title) > 240 {
		return Document{}, ErrInvalidInput
	}
	if input.Kind == "" {
		input.Kind = KindMarkdown
	}
	if input.Kind != KindMarkdown && input.Kind != KindHTML {
		return Document{}, ErrInvalidInput
	}
	if err := validateContentForKind(input.Kind, input.Content); err != nil {
		return Document{}, err
	}
	if input.ProjectID != "" && input.FolderID != "" {
		return Document{}, ErrInvalidInput
	}
	if input.ProjectID != "" {
		canEdit, err := canEditProject(app, actorID, input.ProjectID)
		if err != nil || !canEdit {
			return Document{}, ErrForbidden
		}
	}
	if input.FolderID != "" {
		if _, err := ownedFolder(app, actorID, input.FolderID); err != nil {
			return Document{}, err
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
		record.Set("kind", input.Kind)
		record.Set("content", input.Content)
		record.Set("owner", actorID)
		record.Set("project", input.ProjectID)
		record.Set("folder", input.FolderID)
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
		if err := validateContentForKind(record.GetString("kind"), input.Content); err != nil {
			return err
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

func Replace(ctx context.Context, app core.App, actorID, id string, input ReplaceInput) (Document, int, bool, error) {
	if err := ctx.Err(); err != nil {
		return Document{}, 0, false, err
	}
	input.Find = strings.TrimSpace(input.Find)
	if id == "" || input.Find == "" || input.BaseRevision < 1 {
		return Document{}, 0, false, ErrInvalidInput
	}
	if input.Source != "ai" {
		input.Source = "user"
	}

	matches := 0
	changed := false
	err := app.RunInTransaction(func(tx core.App) error {
		record, err := editableRecord(tx, actorID, id)
		if err != nil {
			return err
		}
		if record.GetInt("revision") != input.BaseRevision {
			return ErrConflict
		}
		content := record.GetString("content")
		var newContent string
		if input.ReplaceAll {
			newContent = strings.ReplaceAll(content, input.Find, input.Replace)
			matches = strings.Count(content, input.Find)
		} else {
			newContent = strings.Replace(content, input.Find, input.Replace, 1)
			if strings.Contains(content, input.Find) {
				matches = 1
			}
		}
		if matches == 0 {
			return nil
		}
		if err := validateContentForKind(record.GetString("kind"), newContent); err != nil {
			return err
		}
		record.Set("content", newContent)
		record.Set("revision", input.BaseRevision+1)
		record.Set("last_edited_by", actorID)
		if err := tx.Save(record); err != nil {
			return err
		}
		changed = true
		return saveVersion(tx, record, actorID, input.Source)
	})
	if err != nil {
		return Document{}, 0, false, err
	}
	doc, err := Get(ctx, app, actorID, id)
	return doc, matches, changed, err
}

// WriteChunk writes long content in pieces, for callers (mainly AI tools)
// whose single-call output is limited. Mode "replace" starts a new chunked
// write: it bumps the revision and records one version. Mode "append" extends
// the same write: it keeps the revision and syncs that version's snapshot, so
// a whole chunked session leaves exactly one version entry. Both modes require
// the caller's baseRevision to match, and each call returns the revision to
// pass next.
func WriteChunk(ctx context.Context, app core.App, actorID string, input WriteChunkInput) (Document, error) {
	if err := ctx.Err(); err != nil {
		return Document{}, err
	}
	if input.Mode == "" {
		input.Mode = "append"
	}
	if input.ID == "" || input.Content == "" || input.BaseRevision < 1 || (input.Mode != "append" && input.Mode != "replace") {
		return Document{}, ErrInvalidInput
	}
	if input.Source != "ai" {
		input.Source = "user"
	}

	err := app.RunInTransaction(func(tx core.App) error {
		record, err := editableRecord(tx, actorID, input.ID)
		if err != nil {
			return err
		}
		if record.GetInt("revision") != input.BaseRevision {
			return ErrConflict
		}
		content := input.Content
		if input.Mode == "append" {
			content = record.GetString("content") + input.Content
		}
		if err := validateContentForKind(record.GetString("kind"), content); err != nil {
			return err
		}
		record.Set("content", content)
		record.Set("last_edited_by", actorID)
		if input.Mode == "replace" {
			record.Set("revision", input.BaseRevision+1)
			if err := tx.Save(record); err != nil {
				return err
			}
			return saveVersion(tx, record, actorID, input.Source)
		}
		if err := tx.Save(record); err != nil {
			return err
		}
		return syncVersionContent(tx, record)
	})
	if err != nil {
		return Document{}, err
	}
	return Get(ctx, app, actorID, input.ID)
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
	locationFilters := 0
	if options.FolderID != "" {
		locationFilters++
	}
	if options.ProjectID != "" {
		locationFilters++
	}
	if options.RootOnly {
		locationFilters++
	}
	if locationFilters > 1 {
		return nil, ErrInvalidInput
	}
	if options.FolderID != "" {
		if _, err := ownedFolder(app, actorID, options.FolderID); err != nil {
			return nil, err
		}
		filter += ` && project = "" && folder = {:folder}`
		params["folder"] = options.FolderID
	} else if options.ProjectID != "" {
		if role, _ := projectRole(app, actorID, options.ProjectID); role == "" {
			return nil, ErrNotFound
		}
		filter += ` && project = {:project}`
		params["project"] = options.ProjectID
	} else if options.RootOnly {
		filter += ` && project = "" && folder = ""`
	}
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
	return Move(ctx, app, actorID, id, MoveInput{Destination: "project", DestinationID: projectID})
}

func ListFolders(ctx context.Context, app core.App, actorID string) ([]Folder, error) {
	if err := requireActor(ctx, app, actorID); err != nil {
		return nil, err
	}
	records, err := app.FindRecordsByFilter(FoldersCollectionName, "owner = {:owner}", "name", 0, 0, dbx.Params{"owner": actorID})
	if err != nil {
		return nil, err
	}
	result := make([]Folder, 0, len(records))
	for _, record := range records {
		result = append(result, folderForRecord(record))
	}
	return result, nil
}

func Move(ctx context.Context, app core.App, actorID, id string, input MoveInput) (Document, error) {
	if input.Destination != "my_documents" && input.Destination != "folder" && input.Destination != "project" {
		return Document{}, ErrInvalidInput
	}
	if input.Destination == "my_documents" && input.DestinationID != "" {
		return Document{}, ErrInvalidInput
	}
	if input.Destination != "my_documents" && input.DestinationID == "" {
		return Document{}, ErrInvalidInput
	}
	if err := ctx.Err(); err != nil {
		return Document{}, err
	}

	projectID := ""
	folderID := ""
	if input.Destination == "folder" {
		folderID = input.DestinationID
	} else if input.Destination == "project" {
		projectID = input.DestinationID
	}

	err := app.RunInTransaction(func(tx core.App) error {
		if folderID != "" {
			if _, err := ownedFolder(tx, actorID, folderID); err != nil {
				return err
			}
		}
		if projectID != "" {
			canEdit, err := canEditProject(tx, actorID, projectID)
			if err != nil || !canEdit {
				return ErrForbidden
			}
		}
		record, err := tx.FindRecordById(CollectionName, id)
		if err != nil {
			return ErrNotFound
		}
		if record.GetString("owner") != actorID || record.GetString("status") != "draft" {
			return ErrForbidden
		}

		currentProjectID := record.GetString("project")
		if currentProjectID != "" {
			canEdit, err := canEditProject(tx, actorID, currentProjectID)
			if err != nil || !canEdit {
				return ErrForbidden
			}
		}
		if currentProjectID != "" && currentProjectID != projectID {
			if err := unlinkDocumentFromTasks(tx, currentProjectID, id); err != nil {
				return err
			}
		}

		record.Set("project", projectID)
		record.Set("folder", folderID)
		return tx.Save(record)
	})
	if err != nil {
		return Document{}, err
	}
	return Get(ctx, app, actorID, id)
}

// unlinkDocumentFromTasks prevents cross-project document relations when a
// document leaves its current project. The relation changes are committed in
// the same transaction as the location change.
func unlinkDocumentFromTasks(app core.App, projectID, documentID string) error {
	tasks, err := app.FindRecordsByFilter(
		"board_tasks",
		"project = {:project}",
		"",
		0,
		0,
		dbx.Params{"project": projectID},
	)
	if err != nil {
		return err
	}
	for _, task := range tasks {
		documentIDs := task.GetStringSlice("documents")
		remaining := make([]string, 0, len(documentIDs))
		changed := false
		for _, id := range documentIDs {
			if id == documentID {
				changed = true
				continue
			}
			remaining = append(remaining, id)
		}
		if !changed {
			continue
		}
		task.Set("documents", remaining)
		if err := app.Save(task); err != nil {
			return err
		}
	}
	return nil
}

func ListPinned(ctx context.Context, app core.App, actorID, query string) ([]DocumentSummary, error) {
	if err := requireActor(ctx, app, actorID); err != nil {
		return nil, err
	}
	pins, err := app.FindRecordsByFilter(PinsCollectionName, "user = {:user}", "-created", maxPinnedDocuments, 0, dbx.Params{"user": actorID})
	if err != nil {
		return nil, err
	}
	query = strings.ToLower(strings.TrimSpace(query))
	result := make([]DocumentSummary, 0, len(pins))
	for _, pin := range pins {
		record, err := accessibleRecord(app, actorID, pin.GetString("doc"))
		if err != nil || record.GetString("status") != "draft" {
			continue
		}
		if query != "" &&
			!strings.Contains(strings.ToLower(record.GetString("title")), query) &&
			!strings.Contains(strings.ToLower(record.GetString("content")), query) {
			continue
		}
		result = append(result, documentSummaryForRecord(app, record))
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

// syncVersionContent keeps the current revision's version snapshot equal to
// the document content while a chunked write appends to it.
func syncVersionContent(app core.App, doc *core.Record) error {
	version, err := app.FindFirstRecordByFilter(
		VersionsCollectionName,
		"doc = {:doc} && revision = {:revision}",
		dbx.Params{"doc": doc.Id, "revision": doc.GetInt("revision")},
	)
	if err != nil {
		return err
	}
	version.Set("content", doc.GetString("content"))
	return app.Save(version)
}

// validateContentForKind enforces kind-specific content rules. HTML documents
// must stay self-contained; the check is marker-based so partially written
// chunked content still passes. Markdown content is unrestricted.
func validateContentForKind(kind, content string) error {
	if kind != KindHTML {
		return nil
	}
	lower := strings.ToLower(content)
	blocked := []string{
		"/@vite/client",
		"/@react-refresh",
		"/src/main.tsx",
		"/src/main.jsx",
		"localhost:",
		"127.0.0.1:",
	}
	for _, marker := range blocked {
		if strings.Contains(lower, marker) {
			return fmt.Errorf("%w: HTML must be self-contained and cannot reference dev server assets such as %s", ErrInvalidInput, marker)
		}
	}
	return nil
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
	summary := documentSummaryForRecord(app, record)
	return Document{ID: summary.ID, Title: summary.Title, Kind: summary.Kind, Content: record.GetString("content"), OwnerID: summary.OwnerID, ProjectID: summary.ProjectID, ProjectName: summary.ProjectName, FolderID: summary.FolderID, FolderName: summary.FolderName, Status: summary.Status, Revision: summary.Revision, LastEditedBy: summary.LastEditedBy, Created: summary.Created, Updated: summary.Updated}
}

func documentSummaryForRecord(app core.App, record *core.Record) DocumentSummary {
	projectID := record.GetString("project")
	projectName := ""
	if projectID != "" {
		if project, err := app.FindRecordById("board_projects", projectID); err == nil {
			projectName = project.GetString("name")
		}
	}
	folderID := record.GetString("folder")
	folderName := ""
	if folderID != "" {
		if folder, err := app.FindRecordById(FoldersCollectionName, folderID); err == nil {
			folderName = folder.GetString("name")
		}
	}
	kind := record.GetString("kind")
	if kind == "" {
		kind = KindMarkdown
	}
	return DocumentSummary{ID: record.Id, Title: record.GetString("title"), Kind: kind, OwnerID: record.GetString("owner"), ProjectID: projectID, ProjectName: projectName, FolderID: folderID, FolderName: folderName, Status: record.GetString("status"), Revision: record.GetInt("revision"), LastEditedBy: record.GetString("last_edited_by"), Created: record.GetString("created"), Updated: record.GetString("updated")}
}

func ownedFolder(app core.App, actorID, id string) (*core.Record, error) {
	folder, err := app.FindRecordById(FoldersCollectionName, id)
	if err != nil {
		return nil, ErrNotFound
	}
	if folder.GetString("owner") != actorID {
		return nil, ErrForbidden
	}
	return folder, nil
}

func folderForRecord(record *core.Record) Folder {
	return Folder{ID: record.Id, Name: record.GetString("name"), OwnerID: record.GetString("owner"), Created: record.GetString("created"), Updated: record.GetString("updated")}
}

func versionForRecord(record *core.Record, includeContent bool) Version {
	version := Version{ID: record.Id, Revision: record.GetInt("revision"), Title: record.GetString("title"), CreatedBy: record.GetString("created_by"), Source: record.GetString("source"), Created: record.GetString("created")}
	if includeContent {
		version.Content = record.GetString("content")
	}
	return version
}
