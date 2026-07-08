package tools

import (
	"context"
	"encoding/json"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/htmlapps"
)

type createHTMLAppInput struct {
	Name        string `json:"name" description:"HTML app name (required)"`
	Description string `json:"description,omitempty" description:"Optional short description of what the app does"`
	HTML        string `json:"html" description:"Full self-contained HTML document (required)"`
}

type updateHTMLAppInput struct {
	ID          string  `json:"id" description:"Existing HTML app ID (required)"`
	Name        *string `json:"name,omitempty" description:"Optional replacement app name"`
	Description *string `json:"description,omitempty" description:"Optional replacement description; pass an empty string to clear it"`
	HTML        *string `json:"html,omitempty" description:"Optional full self-contained HTML document to replace the current file"`
	Status      *string `json:"status,omitempty" description:"Optional app status: draft, published, or archived"`
}

type getHTMLAppInput struct {
	ID          string `json:"id" description:"Existing HTML app ID (required)"`
	IncludeHTML bool   `json:"includeHtml,omitempty" description:"Whether to include the full HTML source; default false"`
}

type listHTMLAppsInput struct {
	Query   string `json:"query,omitempty" description:"Optional search text matched against app name/title and description"`
	Page    int    `json:"page,omitempty" description:"Page number, default 1"`
	PerPage int    `json:"perPage,omitempty" description:"Items per page, default 10, max 20"`
}

type searchHTMLAppInput struct {
	ID           string `json:"id" description:"Existing HTML app ID (required)"`
	Query        string `json:"query" description:"Exact text to search in the app HTML (required)"`
	ContextChars int    `json:"contextChars,omitempty" description:"Characters of context before and after each match; default 300, max 2000"`
	MaxMatches   int    `json:"maxMatches,omitempty" description:"Maximum matches to return; default 5, max 20"`
}

type replaceInHTMLAppInput struct {
	ID         string `json:"id" description:"Existing HTML app ID (required)"`
	Find       string `json:"find" description:"Exact text to find in the app HTML (required)"`
	Replace    string `json:"replace" description:"Replacement text; can be empty to delete the matched text"`
	ReplaceAll bool   `json:"replaceAll,omitempty" description:"Replace all matches instead of only the first one"`
}

func newCreateHTMLAppTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"create_html_app",
		"Create a new self-contained HTML app. The html must include all CSS and JavaScript inline in the document and must not reference Vite dev server assets, localhost URLs, /src/main.tsx, /@vite/client, or /@react-refresh. Match Workavera's shadcn/ui visual style: neutral surfaces, rounded cards, subtle borders, restrained shadows, accessible controls, and no flashy gradients unless specifically requested. Use this when the user asks to generate a new HTML app. Returns JSON with ok, id, result, previewUrl and error. Do not handle thumbnails with this tool.",
		func(ctx context.Context, input createHTMLAppInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return htmlAppToolResponse(htmlapps.Create(ctx, app, actorID, htmlapps.CreateInput(input)))
		},
	)
}

func newUpdateHTMLAppTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"update_html_app",
		"Update an existing HTML app. Only provided fields are updated; html is optional and replaces the entire HTML file only when supplied. When html is supplied it must be self-contained with inline CSS and JavaScript and must not reference Vite dev server assets, localhost URLs, /src/main.tsx, /@vite/client, or /@react-refresh. Keep or move the app toward Workavera's shadcn/ui visual style: neutral surfaces, rounded cards, subtle borders, restrained shadows, accessible controls, and no flashy gradients unless specifically requested. Use replace_in_html_app for small source edits. Returns JSON with ok, id, result, previewUrl and error. Do not handle thumbnails with this tool.",
		func(ctx context.Context, input updateHTMLAppInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return htmlAppToolResponse(htmlapps.Update(ctx, app, actorID, htmlapps.UpdateInput(input)))
		},
	)
}

func newGetHTMLAppTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"get_html_app",
		"Get metadata for an existing HTML app and optionally include the full HTML source. Prefer includeHtml=false unless source is needed. Returns JSON with ok, id, result, previewUrl, name, description, appStatus, html and error.",
		func(ctx context.Context, input getHTMLAppInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return htmlAppToolResponse(htmlapps.Get(ctx, app, actorID, htmlapps.GetInput(input)))
		},
	)
}

func newListHTMLAppsTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"list_html_apps",
		"List HTML apps owned by the current user, optionally searching app name/title and description. Use this first when the user refers to an existing HTML app by name or wants to find one to edit. Returns JSON with ok, result, items, page, perPage, hasMore and error. Items include id, name, description, appStatus, previewUrl and updated.",
		func(ctx context.Context, input listHTMLAppsInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return htmlAppToolResponse(htmlapps.List(ctx, app, actorID, htmlapps.ListInput(input)))
		},
	)
}

func newSearchHTMLAppTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"search_html_app",
		"Search exact text in an existing HTML app and return short source snippets around matches. Use this before replace_in_html_app when you need a precise find string without loading the full HTML. Returns JSON with ok, id, result, previewUrl, matches and error.",
		func(ctx context.Context, input searchHTMLAppInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return htmlAppToolResponse(htmlapps.Search(ctx, app, actorID, htmlapps.SearchInput(input)))
		},
	)
}

func newReplaceInHTMLAppTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"replace_in_html_app",
		"Find and replace exact text in an existing HTML app source. Use this for small edits to avoid rewriting the whole HTML. Returns JSON with ok, id, result, previewUrl, replacements and error.",
		func(ctx context.Context, input replaceInHTMLAppInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return htmlAppToolResponse(htmlapps.Replace(ctx, app, actorID, htmlapps.ReplaceInput(input)))
		},
	)
}

func htmlAppToolResponse(result htmlapps.Result) (fantasy.ToolResponse, error) {
	data, err := json.Marshal(result)
	if err != nil {
		return fantasy.NewTextErrorResponse("Failed to serialize HTML app result"), nil
	}
	return fantasy.NewTextResponse(string(data)), nil
}
