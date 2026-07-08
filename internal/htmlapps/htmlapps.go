package htmlapps

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

const (
	CollectionName = "html_apps"
	previewPrefix  = "/api/html-apps/"
	previewSuffix  = "/preview"
)

type CreateInput struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	HTML        string `json:"html"`
}

type UpdateInput struct {
	ID          string  `json:"id"`
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	HTML        *string `json:"html,omitempty"`
	Status      *string `json:"status,omitempty"`
}

type GetInput struct {
	ID          string `json:"id"`
	IncludeHTML bool   `json:"includeHtml,omitempty"`
}

type ListInput struct {
	Query   string `json:"query,omitempty"`
	Page    int    `json:"page,omitempty"`
	PerPage int    `json:"perPage,omitempty"`
}

type SearchInput struct {
	ID           string `json:"id"`
	Query        string `json:"query"`
	ContextChars int    `json:"contextChars,omitempty"`
	MaxMatches   int    `json:"maxMatches,omitempty"`
}

type ReplaceInput struct {
	ID         string `json:"id"`
	Find       string `json:"find"`
	Replace    string `json:"replace"`
	ReplaceAll bool   `json:"replaceAll,omitempty"`
}

type Result struct {
	OK           bool          `json:"ok"`
	ID           string        `json:"id"`
	Result       string        `json:"result"`
	PreviewURL   string        `json:"previewUrl"`
	Name         string        `json:"name,omitempty"`
	Description  string        `json:"description,omitempty"`
	AppStatus    string        `json:"appStatus,omitempty"`
	HTML         string        `json:"html,omitempty"`
	Matches      []SearchMatch `json:"matches,omitempty"`
	Items        []Summary     `json:"items,omitempty"`
	Page         int           `json:"page,omitempty"`
	PerPage      int           `json:"perPage,omitempty"`
	HasMore      bool          `json:"hasMore,omitempty"`
	Replacements int           `json:"replacements,omitempty"`
	Error        string        `json:"error"`
}

type Summary struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	AppStatus   string `json:"appStatus"`
	PreviewURL  string `json:"previewUrl"`
	Updated     string `json:"updated,omitempty"`
}

type SearchMatch struct {
	Index  int    `json:"index"`
	Before string `json:"before"`
	Match  string `json:"match"`
	After  string `json:"after"`
}

func Register(app core.App) {
	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		event.Router.GET("/api/html-apps/{id}/preview", preview)
		return event.Next()
	})

	app.OnRecordCreateRequest(CollectionName).BindFunc(func(event *core.RecordRequestEvent) error {
		if event.Auth != nil {
			event.Record.Set("owner", event.Auth.Id)
		}
		if event.Record.GetString("status") == "" {
			event.Record.Set("status", "published")
		}
		return event.Next()
	})
}

func Create(ctx context.Context, app core.App, actorID string, input CreateInput) Result {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return errorResult("", "invalid_input", "Name is required.")
	}
	file, err := htmlFile(input.HTML)
	if err != nil {
		return errorResult("", "invalid_input", err.Error())
	}
	collection, err := app.FindCollectionByNameOrId(CollectionName)
	if err != nil {
		return errorResult("", "error", "HTML apps collection is unavailable.")
	}
	record := core.NewRecord(collection)
	record.Set("name", name)
	record.Set("description", input.Description)
	record.Set("owner", actorID)
	record.Set("status", "published")
	record.Set("html_file", file)
	if err := app.Save(record); err != nil {
		return errorResult("", "error", "Could not create HTML app.")
	}
	_ = ctx
	return resultForRecord(record, "created")
}

func Update(ctx context.Context, app core.App, actorID string, input UpdateInput) Result {
	record, res := findOwned(app, actorID, input.ID)
	if !res.OK {
		return res
	}
	changed := false
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return errorResult(input.ID, "invalid_input", "Name cannot be empty.")
		}
		record.Set("name", name)
		changed = true
	}
	if input.Description != nil {
		record.Set("description", *input.Description)
		changed = true
	}
	if input.Status != nil {
		status := strings.TrimSpace(*input.Status)
		if status != "draft" && status != "published" && status != "archived" {
			return errorResult(input.ID, "invalid_input", "Status must be draft, published, or archived.")
		}
		record.Set("status", status)
		changed = true
	}
	if input.HTML != nil {
		file, err := htmlFile(*input.HTML)
		if err != nil {
			return errorResult(input.ID, "invalid_input", err.Error())
		}
		record.Set("html_file", file)
		changed = true
	}
	if !changed {
		return resultForRecord(record, "unchanged")
	}
	if err := app.Save(record); err != nil {
		return errorResult(input.ID, "error", "Could not update HTML app.")
	}
	_ = ctx
	return resultForRecord(record, "updated")
}

func Get(ctx context.Context, app core.App, actorID string, input GetInput) Result {
	record, res := findOwned(app, actorID, input.ID)
	if !res.OK {
		return res
	}
	res = resultForRecord(record, "found")
	if input.IncludeHTML {
		html, err := readHTML(ctx, app, record)
		if err != nil {
			return errorResult(input.ID, "error", "Could not read HTML app source.")
		}
		res.HTML = html
	}
	return res
}

func List(ctx context.Context, app core.App, actorID string, input ListInput) Result {
	if actorID == "" {
		return errorResult("", "invalid_input", "Actor is required.")
	}
	if err := ctx.Err(); err != nil {
		return errorResult("", "error", "Request was cancelled.")
	}
	page := input.Page
	if page <= 0 {
		page = 1
	}
	perPage := input.PerPage
	if perPage <= 0 {
		perPage = 10
	}
	if perPage > 20 {
		perPage = 20
	}
	query := strings.TrimSpace(input.Query)
	filter := "owner = {:owner}"
	params := dbx.Params{"owner": actorID}
	if query != "" {
		filter += " && (name ~ {:query} || description ~ {:query})"
		params["query"] = query
	}
	records, err := app.FindRecordsByFilter(CollectionName, filter, "-updated", perPage+1, (page-1)*perPage, params)
	if err != nil {
		return errorResult("", "error", "Could not list HTML apps.")
	}
	if err := ctx.Err(); err != nil {
		return errorResult("", "error", "Request was cancelled.")
	}
	hasMore := len(records) > perPage
	if hasMore {
		records = records[:perPage]
	}
	items := make([]Summary, 0, len(records))
	for _, record := range records {
		items = append(items, summaryForRecord(record))
	}
	return Result{OK: true, Result: "found", Items: items, Page: page, PerPage: perPage, HasMore: hasMore, Error: ""}
}

func Search(ctx context.Context, app core.App, actorID string, input SearchInput) Result {
	query := input.Query
	if query == "" {
		return errorResult(input.ID, "invalid_input", "Query is required.")
	}
	record, res := findOwned(app, actorID, input.ID)
	if !res.OK {
		return res
	}
	html, err := readHTML(ctx, app, record)
	if err != nil {
		return errorResult(input.ID, "error", "Could not read HTML app source.")
	}
	contextChars := input.ContextChars
	if contextChars <= 0 {
		contextChars = 300
	}
	if contextChars > 2000 {
		contextChars = 2000
	}
	maxMatches := input.MaxMatches
	if maxMatches <= 0 {
		maxMatches = 5
	}
	if maxMatches > 20 {
		maxMatches = 20
	}
	matches := searchMatches(html, query, contextChars, maxMatches)
	if len(matches) == 0 {
		res = resultForRecord(record, "not_found")
		res.OK = false
		res.Error = "No matches found."
		res.Matches = []SearchMatch{}
		return res
	}
	res = resultForRecord(record, "found")
	res.Matches = matches
	return res
}

func Replace(ctx context.Context, app core.App, actorID string, input ReplaceInput) Result {
	if input.Find == "" {
		return errorResult(input.ID, "invalid_input", "Find text is required.")
	}
	record, res := findOwned(app, actorID, input.ID)
	if !res.OK {
		return res
	}
	html, err := readHTML(ctx, app, record)
	if err != nil {
		return errorResult(input.ID, "error", "Could not read HTML app source.")
	}
	updated, replacements := replaceHTML(html, input.Find, input.Replace, input.ReplaceAll)
	if replacements == 0 {
		res = resultForRecord(record, "not_found")
		res.OK = false
		res.Error = "Find text was not found in the HTML app."
		return res
	}
	file, err := htmlFile(updated)
	if err != nil {
		return errorResult(input.ID, "invalid_input", err.Error())
	}
	record.Set("html_file", file)
	if err := app.Save(record); err != nil {
		return errorResult(input.ID, "error", "Could not update HTML app.")
	}
	res = resultForRecord(record, "updated")
	res.Replacements = replacements
	return res
}

func preview(event *core.RequestEvent) error {
	record, err := event.App.FindRecordById(CollectionName, event.Request.PathValue("id"))
	if err != nil || record.GetString("status") != "published" {
		return event.NotFoundError("HTML app not found.", nil)
	}
	html, err := readHTML(event.Request.Context(), event.App, record)
	if err != nil {
		return event.NotFoundError("HTML app not found.", err)
	}
	event.Response.Header().Del("X-Frame-Options")
	event.Response.Header().Set("Content-Security-Policy", "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'self'")
	event.Response.Header().Set("Referrer-Policy", "no-referrer")
	event.Response.Header().Set("X-Content-Type-Options", "nosniff")
	return event.HTML(http.StatusOK, html)
}

func findOwned(app core.App, actorID string, id string) (*core.Record, Result) {
	if strings.TrimSpace(id) == "" {
		return nil, errorResult(id, "invalid_input", "HTML app id is required.")
	}
	record, err := app.FindRecordById(CollectionName, id)
	if err != nil {
		return nil, errorResult(id, "not_found", "HTML app not found.")
	}
	if record.GetString("owner") != actorID {
		return nil, errorResult(id, "forbidden", "You do not have access to this HTML app.")
	}
	return record, Result{OK: true, ID: record.Id, PreviewURL: PreviewURL(record.Id), Error: ""}
}

func resultForRecord(record *core.Record, kind string) Result {
	return Result{
		OK:          true,
		ID:          record.Id,
		Result:      kind,
		PreviewURL:  PreviewURL(record.Id),
		Name:        record.GetString("name"),
		Description: record.GetString("description"),
		AppStatus:   record.GetString("status"),
		Error:       "",
	}
}

func summaryForRecord(record *core.Record) Summary {
	return Summary{
		ID:          record.Id,
		Name:        record.GetString("name"),
		Description: record.GetString("description"),
		AppStatus:   record.GetString("status"),
		PreviewURL:  PreviewURL(record.Id),
		Updated:     record.GetDateTime("updated").String(),
	}
}

func errorResult(id string, kind string, message string) Result {
	return Result{OK: false, ID: id, Result: kind, PreviewURL: previewURLIfID(id), Error: message}
}

func PreviewURL(id string) string {
	return previewPrefix + id + previewSuffix
}

func previewURLIfID(id string) string {
	if id == "" {
		return ""
	}
	return PreviewURL(id)
}

func htmlFile(html string) (*filesystem.File, error) {
	trimmed := strings.TrimSpace(html)
	if trimmed == "" {
		return nil, fmt.Errorf("HTML is required")
	}
	if err := validateSelfContainedHTML(trimmed); err != nil {
		return nil, err
	}
	return filesystem.NewFileFromBytes([]byte(html), "app.html")
}

func validateSelfContainedHTML(html string) error {
	lower := strings.ToLower(html)
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
			return fmt.Errorf("HTML must be self-contained and cannot reference dev server assets such as %s", marker)
		}
	}
	return nil
}

func readHTML(ctx context.Context, app core.App, record *core.Record) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	filename := record.GetString("html_file")
	if filename == "" {
		return "", fmt.Errorf("html file is missing")
	}
	fsys, err := app.NewFilesystem()
	if err != nil {
		return "", err
	}
	defer fsys.Close()
	reader, err := fsys.GetReader(record.BaseFilesPath() + "/" + filename)
	if err != nil {
		return "", err
	}
	defer reader.Close()
	data, err := io.ReadAll(reader)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func searchMatches(text string, query string, contextChars int, maxMatches int) []SearchMatch {
	matches := []SearchMatch{}
	start := 0
	for len(matches) < maxMatches {
		idx := strings.Index(text[start:], query)
		if idx < 0 {
			break
		}
		absolute := start + idx
		beforeStart := absolute - contextChars
		if beforeStart < 0 {
			beforeStart = 0
		}
		afterEnd := absolute + len(query) + contextChars
		if afterEnd > len(text) {
			afterEnd = len(text)
		}
		matches = append(matches, SearchMatch{
			Index:  absolute,
			Before: text[beforeStart:absolute],
			Match:  text[absolute : absolute+len(query)],
			After:  text[absolute+len(query) : afterEnd],
		})
		start = absolute + len(query)
	}
	return matches
}

func replaceHTML(text string, find string, replacement string, replaceAll bool) (string, int) {
	if replaceAll {
		count := strings.Count(text, find)
		return strings.ReplaceAll(text, find, replacement), count
	}
	if !strings.Contains(text, find) {
		return text, 0
	}
	return strings.Replace(text, find, replacement, 1), 1
}
