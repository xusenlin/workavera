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
)

type summarizeResponse struct {
	ContentText string   `json:"contentText"`
	Summary     string   `json:"summary"`
	KeyPoints   []string `json:"keyPoints"`
}

type summaryPayload struct {
	Summary   string   `json:"summary"`
	KeyPoints []string `json:"key_points"`
}

func Register(app core.App) {
	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		event.Router.POST("/api/reading/items/{id}/summarize", summarizeItem).Bind(apis.RequireAuth("users"))
		return event.Next()
	})
}

func summarizeItem(event *core.RequestEvent) error {
	item, err := event.App.FindFirstRecordByFilter(
		itemsCollection,
		"id = {:id} && owner = {:owner}",
		dbx.Params{"id": event.Request.PathValue("id"), "owner": event.Auth.Id},
	)
	if err != nil {
		return event.NotFoundError("Reading item not found.", err)
	}

	ctx, cancel := context.WithTimeout(event.Request.Context(), 90*time.Second)
	defer cancel()

	content, err := fetchReadableText(ctx, item.GetString("url"))
	if err != nil {
		return event.BadRequestError("Could not fetch the article content.", err)
	}
	item.Set("content_text", content)
	if err := event.App.Save(item); err != nil {
		return event.InternalServerError("Article was fetched but could not be saved.", err)
	}

	model, err := findDefaultModel(event.App, event.Auth.Id)
	if err != nil {
		return event.BadRequestError("Article was fetched, but no default model is configured.", err)
	}
	if strings.TrimSpace(model.APIKey) == "" {
		return event.BadRequestError("Article was fetched, but the default model has no API key.", nil)
	}

	payload, err := summarizeContent(ctx, model, item.GetString("title"), item.GetString("url"), content)
	if err != nil {
		return event.BadRequestError("Article was fetched, but summarization failed.", err)
	}
	item.Set("summary", payload.Summary)
	item.Set("key_points", payload.KeyPoints)
	if err := event.App.Save(item); err != nil {
		return event.InternalServerError("Summary was generated but could not be saved.", err)
	}

	return event.JSON(http.StatusOK, summarizeResponse{ContentText: content, Summary: payload.Summary, KeyPoints: payload.KeyPoints})
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
		ID:       record.Id,
		Name:     record.GetString("name"),
		ModelID:  record.GetString("model_id"),
		BaseURL:  record.GetString("base_url"),
		APIKey:   record.GetString("api_key"),
		Protocol: record.GetString("protocol"),
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

func summarizeContent(ctx context.Context, model workagent.ModelConfig, title, sourceURL, content string) (summaryPayload, error) {
	if len(content) > 50000 {
		content = content[:50000]
	}
	prompt := fmt.Sprintf(`请阅读下面的资料并用中文总结。

要求：
- 只输出 JSON，不要输出 Markdown 或解释文字。
- JSON 字段必须是 summary 和 key_points。
- summary 是 2 到 4 句中文摘要。
- key_points 是 3 到 8 条中文要点数组。

标题：%s
链接：%s
正文：
%s`, title, sourceURL, content)

	text, err := workagent.GenerateText(ctx, model, "你是 Workavera 的阅读资料整理助手，负责把外部资料压缩成准确、可行动的中文摘要。", prompt)
	if err != nil {
		return summaryPayload{}, err
	}
	return parseSummaryPayload(text)
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
