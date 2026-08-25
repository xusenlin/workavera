package board

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	boardProjectSharesCollection = "board_project_shares"
	shareSlugLength              = 22
	// Lowercase alphanumerics keep a shared link readable over the phone and
	// safe to paste anywhere without escaping.
	shareSlugAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
	// A public preview loads in one request, so it needs a ceiling that keeps
	// an unusually large project from turning into an unbounded response.
	maxPublicTasks = 2000
)

// ErrShareNotFound covers every reason a public link cannot be served: unknown
// slug, expired share, archived or deleted project. Public responses must not
// tell these apart.
var ErrShareNotFound = errors.New("shared project not found")

// ErrInvalidShareExpiry reports an expiry that is unparsable or already past.
var ErrInvalidShareExpiry = errors.New("share expiry must be a future date")

type Share struct {
	ProjectID string `json:"projectId"`
	Slug      string `json:"slug"`
	Expires   string `json:"expires,omitempty"`
	Created   string `json:"created"`
	Updated   string `json:"updated"`
}

type ShareInput struct {
	Expires string `json:"expires"`
}

// PublicProject is the project itself as an anonymous reader receives it.
type PublicProject struct {
	Name           string `json:"name"`
	Description    string `json:"description,omitempty"`
	Start          string `json:"start,omitempty"`
	End            string `json:"end,omitempty"`
	TaskCount      int    `json:"taskCount"`
	CompletedCount int    `json:"completedCount"`
}

type PublicState struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Color     string  `json:"color"`
	Category  string  `json:"category"`
	SortOrder float64 `json:"sortOrder"`
	TaskCount int     `json:"taskCount"`
}

// PublicMember carries a display name and an avatar index, never a user id,
// role, or email. The index addresses the avatar proxy route.
type PublicMember struct {
	Name   string `json:"name"`
	Avatar int    `json:"avatar,omitempty"`
	Owner  bool   `json:"owner,omitempty"`
}

type PublicLabel struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// PublicDocument is a linked document. Slug is present only while that
// document has a public link of its own that currently resolves; otherwise the
// visitor learns the title and nothing that could open it.
type PublicDocument struct {
	Title string `json:"title"`
	Slug  string `json:"slug,omitempty"`
}

// PublicTask deliberately omits assignees, the creator, and every user id: the
// team is shown as a whole in the members section instead.
type PublicTask struct {
	ID          string           `json:"id"`
	Title       string           `json:"title"`
	Description string           `json:"description,omitempty"`
	StateID     string           `json:"stateId"`
	Priority    string           `json:"priority"`
	StartDate   string           `json:"startDate,omitempty"`
	DueDate     string           `json:"dueDate,omitempty"`
	Labels      []PublicLabel    `json:"labels"`
	Documents   []PublicDocument `json:"documents"`
}

type PublicPreview struct {
	Project PublicProject  `json:"project"`
	States  []PublicState  `json:"states"`
	Members []PublicMember `json:"members"`
	Tasks   []PublicTask   `json:"tasks"`
}

// Publish exposes the project under a public slug, and on an existing share
// updates its expiry. Only the owner can publish, matching archive and delete.
// Unlike a shared document, a shared project pins nothing: the preview always
// reports the project as it stands, which is the point of sharing progress.
func Publish(ctx context.Context, app core.App, actorID, projectID string, input ShareInput) (Share, error) {
	if err := requireActiveActor(ctx, app, actorID); err != nil {
		return Share{}, err
	}
	project, err := requireProjectOwner(app, actorID, projectID)
	if err != nil {
		return Share{}, err
	}
	expires, err := parseShareExpiry(input.Expires)
	if err != nil {
		return Share{}, err
	}

	share, err := findShareByProject(app, project.Id)
	if err != nil {
		return Share{}, err
	}
	if share == nil {
		collection, err := app.FindCollectionByNameOrId(boardProjectSharesCollection)
		if err != nil {
			return Share{}, err
		}
		share = core.NewRecord(collection)
		share.Set("project", project.Id)
		share.Set("slug", security.RandomStringWithAlphabet(shareSlugLength, shareSlugAlphabet))
		share.Set("created_by", actorID)
	}
	share.Set("expires", expires)
	if err := app.Save(share); err != nil {
		return Share{}, err
	}
	return shareForRecord(share), nil
}

// Unpublish revokes the link by deleting the record, so publishing again
// issues a new slug instead of reviving the old one. It works on archived
// projects too, so an owner can always take a link down.
func Unpublish(ctx context.Context, app core.App, actorID, projectID string) error {
	if err := requireActiveActor(ctx, app, actorID); err != nil {
		return err
	}
	project, err := requireProjectOwnerAnyState(app, actorID, projectID)
	if err != nil {
		return err
	}
	share, err := findShareByProject(app, project.Id)
	if err != nil || share == nil {
		return err
	}
	return app.Delete(share)
}

// GetShare reports the current share of a project, or ErrShareNotFound when it
// is not shared.
func GetShare(ctx context.Context, app core.App, actorID, projectID string) (Share, error) {
	if err := requireActiveActor(ctx, app, actorID); err != nil {
		return Share{}, err
	}
	project, err := requireProjectOwnerAnyState(app, actorID, projectID)
	if err != nil {
		return Share{}, err
	}
	share, err := findShareByProject(app, project.Id)
	if err != nil {
		return Share{}, err
	}
	if share == nil {
		return Share{}, ErrShareNotFound
	}
	return shareForRecord(share), nil
}

// PublicPreviewBySlug serves a shared project to an anonymous reader: the
// project, its workflow, its team by display name, and every active task with
// the dates that place it on the timeline.
func PublicPreviewBySlug(ctx context.Context, app core.App, slug string) (PublicPreview, error) {
	_, project, err := resolveShare(ctx, app, slug)
	if err != nil {
		return PublicPreview{}, err
	}

	states, err := app.FindRecordsByFilter(boardProjectStatesCollection, "project = {:project}", "sort_order", 0, 0, dbx.Params{"project": project.Id})
	if err != nil {
		return PublicPreview{}, err
	}
	tasks, err := app.FindRecordsByFilter(
		boardTasksCollection,
		"project = {:project} && archived = false",
		"start_date,due_date,rank",
		maxPublicTasks,
		0,
		dbx.Params{"project": project.Id},
	)
	if err != nil {
		return PublicPreview{}, err
	}
	if err := ctx.Err(); err != nil {
		return PublicPreview{}, err
	}

	labels, err := publicLabelsByID(app, project.Id)
	if err != nil {
		return PublicPreview{}, err
	}
	documents, err := publicDocumentsByID(app, project.Id)
	if err != nil {
		return PublicPreview{}, err
	}

	completedStates := make(map[string]bool, len(states))
	counts := make(map[string]int, len(states))
	for _, state := range states {
		if state.GetString("category") == "completed" {
			completedStates[state.Id] = true
		}
	}

	preview := PublicPreview{
		Tasks:  make([]PublicTask, 0, len(tasks)),
		States: make([]PublicState, 0, len(states)),
	}
	start, end := "", ""
	completed := 0
	for _, task := range tasks {
		counts[task.GetString("state")]++
		if completedStates[task.GetString("state")] {
			completed++
		}
		startDate := publicDate(task, "start_date")
		dueDate := publicDate(task, "due_date")
		for _, date := range []string{startDate, dueDate} {
			if date == "" {
				continue
			}
			if start == "" || date < start {
				start = date
			}
			if end == "" || date > end {
				end = date
			}
		}
		preview.Tasks = append(preview.Tasks, PublicTask{
			ID:          task.Id,
			Title:       task.GetString("title"),
			Description: task.GetString("description"),
			StateID:     task.GetString("state"),
			Priority:    task.GetString("priority"),
			StartDate:   startDate,
			DueDate:     dueDate,
			Labels:      publicTaskLabels(task, labels),
			Documents:   publicTaskDocuments(task, documents),
		})
	}
	for _, state := range states {
		preview.States = append(preview.States, PublicState{
			ID:        state.Id,
			Name:      state.GetString("name"),
			Color:     state.GetString("color"),
			Category:  state.GetString("category"),
			SortOrder: state.GetFloat("sort_order"),
			TaskCount: counts[state.Id],
		})
	}

	members, err := publicMembers(app, project)
	if err != nil {
		return PublicPreview{}, err
	}
	preview.Members = members
	preview.Project = PublicProject{
		Name:           project.GetString("name"),
		Description:    project.GetString("description"),
		Start:          start,
		End:            end,
		TaskCount:      len(preview.Tasks),
		CompletedCount: completed,
	}
	return preview, nil
}

// PublicAvatar resolves the avatar of the member at the given position in the
// public member list, which is how a visitor can see a face without the
// response ever carrying a user id.
func PublicAvatar(ctx context.Context, app core.App, slug string, index int) (*core.Record, string, error) {
	_, project, err := resolveShare(ctx, app, slug)
	if err != nil {
		return nil, "", err
	}
	users, err := publicMemberRecords(app, project)
	if err != nil {
		return nil, "", err
	}
	if index < 1 || index > len(users) {
		return nil, "", ErrShareNotFound
	}
	user := users[index-1]
	filename := user.GetString("avatar")
	if filename == "" {
		return nil, "", ErrShareNotFound
	}
	return user, filename, nil
}

// resolveShare turns a public slug into its share and project, applying every
// reason the link may have stopped working.
func resolveShare(ctx context.Context, app core.App, slug string) (*core.Record, *core.Record, error) {
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return nil, nil, ErrShareNotFound
	}
	share, err := app.FindFirstRecordByFilter(boardProjectSharesCollection, "slug = {:slug}", dbx.Params{"slug": slug})
	if err != nil {
		return nil, nil, ErrShareNotFound
	}
	if expires := share.GetDateTime("expires"); !expires.IsZero() && expires.Time().Before(time.Now()) {
		return nil, nil, ErrShareNotFound
	}
	project, err := app.FindRecordById(boardProjectsCollection, share.GetString("project"))
	if err != nil || project.GetBool("archived") {
		return nil, nil, ErrShareNotFound
	}
	return share, project, nil
}

// publicMemberRecords lists the owner first, then members in the order they
// joined. PublicAvatar and publicMembers walk the same list, so an avatar
// index always addresses the member the visitor sees.
func publicMemberRecords(app core.App, project *core.Record) ([]*core.Record, error) {
	users := make([]*core.Record, 0, 8)
	if owner, err := app.FindRecordById("users", project.GetString("owner")); err == nil {
		users = append(users, owner)
	}
	memberships, err := app.FindRecordsByFilter(
		boardProjectMembersCollection,
		"project = {:project}",
		"created",
		0,
		0,
		dbx.Params{"project": project.Id},
	)
	if err != nil {
		return nil, err
	}
	for _, membership := range memberships {
		user, err := app.FindRecordById("users", membership.GetString("user"))
		if err != nil {
			continue
		}
		users = append(users, user)
	}
	return users, nil
}

func publicMembers(app core.App, project *core.Record) ([]PublicMember, error) {
	users, err := publicMemberRecords(app, project)
	if err != nil {
		return nil, err
	}
	members := make([]PublicMember, 0, len(users))
	for index, user := range users {
		name := user.GetString("name")
		if name == "" {
			// Falling back to the email would publish an address, so an
			// unnamed member stays anonymous instead.
			name = "Member"
		}
		member := PublicMember{Name: name, Owner: index == 0}
		if user.GetString("avatar") != "" {
			member.Avatar = index + 1
		}
		members = append(members, member)
	}
	return members, nil
}

func publicLabelsByID(app core.App, projectID string) (map[string]PublicLabel, error) {
	records, err := app.FindRecordsByFilter(boardProjectLabelsCollection, "project = {:project}", "name", 0, 0, dbx.Params{"project": projectID})
	if err != nil {
		return nil, err
	}
	labels := make(map[string]PublicLabel, len(records))
	for _, record := range records {
		labels[record.Id] = PublicLabel{Name: record.GetString("name"), Color: record.GetString("color")}
	}
	return labels, nil
}

// publicDocumentsByID resolves the project's documents to their titles, and to
// their own public slug when they have a link that currently resolves. A
// document the author never shared, or archived, or whose link expired, is
// reported by title alone.
func publicDocumentsByID(app core.App, projectID string) (map[string]PublicDocument, error) {
	records, err := app.FindRecordsByFilter(docsCollection, "project = {:project}", "", 0, 0, dbx.Params{"project": projectID})
	if err != nil {
		return nil, err
	}
	documents := make(map[string]PublicDocument, len(records))
	for _, record := range records {
		document := PublicDocument{Title: record.GetString("title")}
		if record.GetString("status") != "archived" {
			if share, err := app.FindFirstRecordByFilter(docSharesCollection, "doc = {:doc}", dbx.Params{"doc": record.Id}); err == nil {
				expires := share.GetDateTime("expires")
				if expires.IsZero() || expires.Time().After(time.Now()) {
					document.Slug = share.GetString("slug")
				}
			}
		}
		documents[record.Id] = document
	}
	return documents, nil
}

func publicTaskLabels(task *core.Record, labels map[string]PublicLabel) []PublicLabel {
	ids := task.GetStringSlice("labels")
	result := make([]PublicLabel, 0, len(ids))
	for _, id := range ids {
		if label, ok := labels[id]; ok {
			result = append(result, label)
		}
	}
	return result
}

func publicTaskDocuments(task *core.Record, documents map[string]PublicDocument) []PublicDocument {
	ids := task.GetStringSlice("documents")
	result := make([]PublicDocument, 0, len(ids))
	for _, id := range ids {
		if document, ok := documents[id]; ok {
			result = append(result, document)
		}
	}
	return result
}

// publicDate reduces a stored datetime to the calendar day the timeline places
// it on, and leaves an unset date empty.
func publicDate(record *core.Record, field string) string {
	value := record.GetDateTime(field)
	if value.IsZero() {
		return ""
	}
	return value.Time().Format("2006-01-02")
}

func findShareByProject(app core.App, projectID string) (*core.Record, error) {
	records, err := app.FindRecordsByFilter(boardProjectSharesCollection, "project = {:project}", "", 1, 0, dbx.Params{"project": projectID})
	if err != nil || len(records) == 0 {
		return nil, err
	}
	return records[0], nil
}

func parseShareExpiry(value string) (types.DateTime, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return types.DateTime{}, nil
	}
	expires, err := types.ParseDateTime(value)
	if err != nil || expires.IsZero() || expires.Time().Before(time.Now()) {
		return types.DateTime{}, ErrInvalidShareExpiry
	}
	return expires, nil
}

func shareForRecord(record *core.Record) Share {
	expires := ""
	if value := record.GetDateTime("expires"); !value.IsZero() {
		expires = value.String()
	}
	return Share{
		ProjectID: record.GetString("project"),
		Slug:      record.GetString("slug"),
		Expires:   expires,
		Created:   record.GetString("created"),
		Updated:   record.GetString("updated"),
	}
}

func getBoardProjectShareRequest(event *core.RequestEvent) error {
	share, err := GetShare(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id"))
	if err != nil {
		if errors.Is(err, ErrShareNotFound) {
			return event.JSON(http.StatusOK, nil)
		}
		return shareRequestError(event, err)
	}
	return event.JSON(http.StatusOK, share)
}

func publishBoardProjectRequest(event *core.RequestEvent) error {
	var input ShareInput
	if err := event.BindBody(&input); err != nil {
		return event.BadRequestError("Invalid share data.", err)
	}
	share, err := Publish(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id"), input)
	if err != nil {
		return shareRequestError(event, err)
	}
	return event.JSON(http.StatusOK, share)
}

func unpublishBoardProjectRequest(event *core.RequestEvent) error {
	if err := Unpublish(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id")); err != nil {
		return shareRequestError(event, err)
	}
	return event.NoContent(http.StatusNoContent)
}

func publicBoardRequest(event *core.RequestEvent) error {
	preview, err := PublicPreviewBySlug(event.Request.Context(), event.App, event.Request.PathValue("slug"))
	if err != nil {
		return shareRequestError(event, err)
	}
	return event.JSON(http.StatusOK, preview)
}

func publicBoardAvatarRequest(event *core.RequestEvent) error {
	index, err := strconv.Atoi(event.Request.PathValue("index"))
	if err != nil {
		return event.NotFoundError("Avatar not found.", err)
	}
	user, filename, err := PublicAvatar(event.Request.Context(), event.App, event.Request.PathValue("slug"), index)
	if err != nil {
		return shareRequestError(event, err)
	}
	fsys, err := event.App.NewFilesystem()
	if err != nil {
		return event.InternalServerError("Filesystem initialization failure.", err)
	}
	defer fsys.Close()
	if err := fsys.Serve(event.Response, event.Request, user.BaseFilesPath()+"/"+filename, filename); err != nil {
		return event.NotFoundError("Avatar not found.", err)
	}
	return nil
}

func shareRequestError(event *core.RequestEvent, err error) error {
	switch {
	case errors.Is(err, ErrShareNotFound):
		return event.NotFoundError("This link is no longer available.", err)
	case errors.Is(err, ErrProjectNotFound):
		return event.NotFoundError("Project not found.", err)
	case errors.Is(err, ErrOwnerOnly):
		return event.ForbiddenError("Only the project owner can share it.", err)
	case errors.Is(err, ErrProjectArchived):
		return event.BadRequestError("Restore the project before sharing it.", err)
	case errors.Is(err, ErrInvalidShareExpiry):
		return event.BadRequestError("Share expiry must be a future date.", err)
	default:
		return event.InternalServerError("Could not update project sharing.", err)
	}
}
