package reading

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"golang.org/x/net/html"

	workagent "github.com/xusenlin/workavera/internal/agent"
)

const (
	itemsCollection  = "reading_items"
	modelsCollection = "llm_models"
	maxFetchBytes    = 1024 * 1024
	maxPinnedItems   = 6
)

var ErrPinLimit = errors.New("you can pin at most 6 reading items")

type summarizeResponse struct {
	ContentText string   `json:"contentText"`
	Summary     string   `json:"summary"`
	KeyPoints   []string `json:"keyPoints"`
}

type summaryPayload struct {
	Summary   string   `json:"summary"`
	KeyPoints []string `json:"key_points"`
}

// CreateInput holds the fields for creating a reading item.
type CreateInput struct {
	URL             string
	Title           string
	Description     string
	Tags            []string
	Status          string
	ProjectID       string
	SummaryLanguage string
}

// UpdateInput holds the optional fields for updating a reading item. Only
// non-nil fields are applied.
type UpdateInput struct {
	Title           *string
	Description     *string
	Tags            *[]string
	Status          *string
	ProjectID       *string
	SummaryLanguage *string
}

// Item is the full reading item projection returned by Create and Get.
type Item struct {
	ID              string   `json:"id"`
	Title           string   `json:"title"`
	URL             string   `json:"url"`
	Description     string   `json:"description,omitempty"`
	ProjectID       string   `json:"projectId,omitempty"`
	Status          string   `json:"status"`
	Tags            []string `json:"tags,omitempty"`
	Summary         string   `json:"summary,omitempty"`
	KeyPoints       []string `json:"keyPoints,omitempty"`
	ContentText     string   `json:"contentText,omitempty"`
	SummaryLanguage string   `json:"summaryLanguage,omitempty"`
}

// SummarizeResult is the outcome of fetching and summarizing an article.
type SummarizeResult struct {
	ContentText string   `json:"contentText"`
	Summary     string   `json:"summary"`
	KeyPoints   []string `json:"keyPoints"`
}

func Register(app core.App) {
	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		event.Router.POST("/api/reading/items/{id}/summarize", summarizeItem).Bind(apis.RequireAuth("users"))
		event.Router.POST("/api/reading/items/{id}/pin", pinItem).Bind(apis.RequireAuth("users"))
		return event.Next()
	})
	app.OnRecordUpdateRequest(itemsCollection).BindFunc(validateItemUpdate)
}

func validateItemUpdate(event *core.RecordRequestEvent) error {
	if event.Record.GetString("status") == "archived" {
		event.Record.Set("pinned", false)
		return event.Next()
	}
	if !event.Record.GetBool("pinned") || event.Record.Original().GetBool("pinned") {
		return event.Next()
	}

	ownerID := event.Record.GetString("owner")
	count, err := event.App.CountRecords(itemsCollection, dbx.And(
		dbx.HashExp{"owner": ownerID, "pinned": true},
		dbx.Not(dbx.HashExp{"status": "archived"}),
	))
	if err != nil {
		return event.BadRequestError("Could not verify pinned reading item limit.", err)
	}
	if int(count) >= maxPinnedItems {
		return event.BadRequestError(ErrPinLimit.Error(), nil)
	}
	return event.Next()
}

func summarizeItem(event *core.RequestEvent) error {
	ctx, cancel := context.WithTimeout(event.Request.Context(), 90*time.Second)
	defer cancel()

	result, err := Summarize(ctx, event.App, event.Auth.Id, event.Request.PathValue("id"))
	if err != nil {
		return event.BadRequestError(err.Error(), err)
	}
	return event.JSON(http.StatusOK, summarizeResponse{
		ContentText: result.ContentText,
		Summary:     result.Summary,
		KeyPoints:   result.KeyPoints,
	})
}

func pinItem(event *core.RequestEvent) error {
	var input struct {
		Pinned bool `json:"pinned"`
	}
	if err := event.BindBody(&input); err != nil {
		return event.BadRequestError("Invalid request body.", err)
	}
	if err := SetPinned(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id"), input.Pinned); err != nil {
		if errors.Is(err, ErrPinLimit) {
			return event.JSON(http.StatusBadRequest, map[string]string{"message": err.Error()})
		}
		return event.BadRequestError("Could not update pin status.", err)
	}
	return event.JSON(http.StatusOK, map[string]bool{"ok": true})
}

func SetPinned(ctx context.Context, app core.App, actorID, itemID string, pinned bool) error {
	_ = ctx
	record, err := app.FindRecordById(itemsCollection, itemID)
	if err != nil {
		return errors.New("reading item not found")
	}
	if record.GetString("owner") != actorID {
		return errors.New("you do not have access to this reading item")
	}
	if !pinned {
		record.Set("pinned", false)
		return app.Save(record)
	}
	if record.GetBool("pinned") {
		return nil
	}
	count, err := app.CountRecords(itemsCollection, dbx.And(
		dbx.HashExp{"owner": actorID, "pinned": true},
		dbx.Not(dbx.HashExp{"status": "archived"}),
	))
	if err != nil {
		return err
	}
	if int(count) >= maxPinnedItems {
		return ErrPinLimit
	}
	record.Set("pinned", true)
	return app.Save(record)
}

// Create creates a new reading item owned by the actor.
func Create(ctx context.Context, app core.App, actorID string, input CreateInput) (Item, error) {
	if actorID == "" {
		return Item{}, errors.New("missing actor")
	}
	if err := ctx.Err(); err != nil {
		return Item{}, err
	}
	if _, err := app.FindRecordById("users", actorID); err != nil {
		return Item{}, errors.New("actor is not an active user")
	}

	collection, err := app.FindCollectionByNameOrId(itemsCollection)
	if err != nil {
		return Item{}, err
	}

	record := core.NewRecord(collection)
	record.Set("owner", actorID)
	record.Set("url", input.URL)
	record.Set("title", input.Title)
	record.Set("description", input.Description)
	record.Set("tags", input.Tags)
	record.Set("status", input.Status)
	if record.GetString("status") == "" {
		record.Set("status", "unread")
	}
	if input.ProjectID != "" {
		record.Set("project", input.ProjectID)
	}
	if input.SummaryLanguage != "" {
		record.Set("summary_language", input.SummaryLanguage)
	}

	if err := app.Save(record); err != nil {
		return Item{}, err
	}
	return itemForRecord(record), nil
}

// Update applies non-nil fields of input to the reading item owned by the
// actor and returns the updated item.
func Update(ctx context.Context, app core.App, actorID, itemID string, input UpdateInput) (Item, error) {
	if actorID == "" {
		return Item{}, errors.New("missing actor")
	}
	if err := ctx.Err(); err != nil {
		return Item{}, err
	}

	record, err := app.FindFirstRecordByFilter(
		itemsCollection,
		"id = {:id} && owner = {:owner}",
		dbx.Params{"id": itemID, "owner": actorID},
	)
	if err != nil {
		return Item{}, errors.New("reading item not found")
	}

	if input.Title != nil {
		record.Set("title", *input.Title)
	}
	if input.Description != nil {
		record.Set("description", *input.Description)
	}
	if input.Tags != nil {
		record.Set("tags", *input.Tags)
	}
	if input.Status != nil {
		record.Set("status", *input.Status)
	}
	if input.ProjectID != nil {
		record.Set("project", *input.ProjectID)
	}
	if input.SummaryLanguage != nil {
		record.Set("summary_language", *input.SummaryLanguage)
	}

	if err := app.Save(record); err != nil {
		return Item{}, err
	}
	return itemForRecord(record), nil
}

// Get returns a single reading item by ID. When includeContent is true the
// full content_text is included; otherwise it is omitted to keep the payload
// small.
func Get(ctx context.Context, app core.App, actorID, itemID string, includeContent bool) (Item, error) {
	if actorID == "" {
		return Item{}, errors.New("missing actor")
	}
	if err := ctx.Err(); err != nil {
		return Item{}, err
	}

	record, err := app.FindFirstRecordByFilter(
		itemsCollection,
		"id = {:id} && owner = {:owner}",
		dbx.Params{"id": itemID, "owner": actorID},
	)
	if err != nil {
		return Item{}, errors.New("reading item not found")
	}

	item := itemForRecord(record)
	if includeContent {
		item.ContentText = record.GetString("content_text")
	}
	return item, nil
}

// Summarize fetches the article content from the item's URL, generates a
// summary using the actor's default model, and persists the results.
func Summarize(ctx context.Context, app core.App, actorID, itemID string) (SummarizeResult, error) {
	if actorID == "" {
		return SummarizeResult{}, errors.New("missing actor")
	}

	item, err := app.FindFirstRecordByFilter(
		itemsCollection,
		"id = {:id} && owner = {:owner}",
		dbx.Params{"id": itemID, "owner": actorID},
	)
	if err != nil {
		return SummarizeResult{}, errors.New("reading item not found")
	}

	content, err := fetchReadableText(ctx, item.GetString("url"))
	if err != nil {
		return SummarizeResult{}, fmt.Errorf("could not fetch the article content: %w", err)
	}
	item.Set("content_text", content)
	if err := app.Save(item); err != nil {
		return SummarizeResult{}, fmt.Errorf("article was fetched but could not be saved: %w", err)
	}

	model, err := findDefaultModel(app, actorID)
	if err != nil {
		return SummarizeResult{}, errors.New("article was fetched, but no default model is configured")
	}
	if strings.TrimSpace(model.APIKey) == "" {
		return SummarizeResult{}, errors.New("article was fetched, but the default model has no API key")
	}

	payload, err := summarizeContent(ctx, model, item.GetString("title"), item.GetString("url"), content, item.GetString("summary_language"))
	if err != nil {
		return SummarizeResult{}, fmt.Errorf("article was fetched, but summarization failed: %w", err)
	}
	item.Set("summary", payload.Summary)
	item.Set("key_points", payload.KeyPoints)
	if err := app.Save(item); err != nil {
		return SummarizeResult{}, fmt.Errorf("summary was generated but could not be saved: %w", err)
	}

	return SummarizeResult{ContentText: content, Summary: payload.Summary, KeyPoints: payload.KeyPoints}, nil
}

func itemForRecord(record *core.Record) Item {
	return Item{
		ID:              record.Id,
		Title:           record.GetString("title"),
		URL:             record.GetString("url"),
		Description:     record.GetString("description"),
		ProjectID:       record.GetString("project"),
		Status:          record.GetString("status"),
		Tags:            stringArray(record.Get("tags")),
		Summary:         record.GetString("summary"),
		KeyPoints:       stringArray(record.Get("key_points")),
		SummaryLanguage: record.GetString("summary_language"),
	}
}

func findDefaultModel(app core.App, ownerID string) (workagent.ModelConfig, error) {
	record, err := app.FindFirstRecordByFilter(
		modelsCollection,
		"owner = {:owner} && is_default = true",
		dbx.Params{"owner": ownerID},
	)
	if err != nil {
		return workagent.ModelConfig{}, err
	}
	return workagent.ModelConfig{
		ID:              record.Id,
		Name:            record.GetString("name"),
		ModelID:         record.GetString("model_id"),
		BaseURL:         record.GetString("base_url"),
		APIKey:          record.GetString("api_key"),
		Protocol:        record.GetString("protocol"),
		MaxOutputTokens: int(record.GetInt("max_output_tokens")),
	}, nil
}

func fetchReadableText(ctx context.Context, rawURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("invalid URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("only HTTP and HTTPS URLs are supported")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Workavera/1.0 (+https://github.com/xusenlin/workavera)")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxFetchBytes))
	if err != nil {
		return "", err
	}
	if len(data) == 0 {
		return "", errors.New("empty response")
	}
	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	if strings.Contains(contentType, "html") || strings.Contains(strings.ToLower(string(data[:min(len(data), 200)])), "<html") {
		text := htmlText(string(data))
		if text != "" {
			return text, nil
		}
	}
	return normalizeWhitespace(string(data)), nil
}

func htmlText(source string) string {
	doc, err := html.Parse(strings.NewReader(source))
	if err != nil {
		return ""
	}
	var builder strings.Builder
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode {
			switch node.Data {
			case "script", "style", "noscript", "svg", "nav", "footer":
				return
			}
		}
		if node.Type == html.TextNode {
			text := strings.TrimSpace(node.Data)
			if text != "" {
				builder.WriteString(text)
				builder.WriteByte('\n')
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(doc)
	return normalizeWhitespace(builder.String())
}

func normalizeWhitespace(value string) string {
	return strings.Join(strings.Fields(value), " ")
}

func summarizeContent(ctx context.Context, model workagent.ModelConfig, title, sourceURL, content, language string) (summaryPayload, error) {
	if len(content) > 50000 {
		content = content[:50000]
	}

	systemPrompt, userPrompt := buildSummaryPrompt(title, sourceURL, content, language)

	text, err := workagent.GenerateText(ctx, model, systemPrompt, userPrompt)
	if err != nil {
		return summaryPayload{}, err
	}
	return parseSummaryPayload(text)
}

func buildSummaryPrompt(title, sourceURL, content, language string) (systemPrompt, userPrompt string) {
	lang := strings.TrimSpace(language)
	if lang == "" {
		lang = "English"
	}

	systemPrompt = fmt.Sprintf("You are Workavera's reading assistant, responsible for compressing external materials into accurate, actionable summaries in %s.", lang)

	userPrompt = fmt.Sprintf(`Read the following material and summarize it in %s.

Requirements:
- Output only JSON, no Markdown or explanatory text.
- The JSON fields must be summary and key_points.
- summary is a 2 to 4 sentence summary in %s.
- key_points is an array of 3 to 8 key points in %s.

Title: %s
Link: %s
Body:
%s`, lang, lang, lang, title, sourceURL, content)

	return systemPrompt, userPrompt
}

func parseSummaryPayload(text string) (summaryPayload, error) {
	text = strings.TrimSpace(text)
	start := strings.IndexByte(text, '{')
	end := strings.LastIndexByte(text, '}')
	if start < 0 || end <= start {
		return summaryPayload{}, errors.New("model did not return a JSON object")
	}
	var payload summaryPayload
	if err := json.Unmarshal([]byte(text[start:end+1]), &payload); err != nil {
		return summaryPayload{}, err
	}
	payload.Summary = strings.TrimSpace(payload.Summary)
	cleanPoints := make([]string, 0, len(payload.KeyPoints))
	for _, point := range payload.KeyPoints {
		if point = strings.TrimSpace(point); point != "" {
			cleanPoints = append(cleanPoints, point)
		}
	}
	payload.KeyPoints = cleanPoints
	if payload.Summary == "" || len(payload.KeyPoints) == 0 {
		return summaryPayload{}, errors.New("summary or key_points is empty")
	}
	return payload, nil
}
