package tools

import (
	"context"
	"encoding/json"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/microapps"
)

type createAIMicroAppInput struct {
	Name        string `json:"name" description:"AI micro app name (required)"`
	Description string `json:"description,omitempty" description:"Optional short description of what the app does"`
	HTML        string `json:"html" description:"Full self-contained HTML document (required)"`
}

type updateAIMicroAppInput struct {
	ID          string  `json:"id" description:"Existing AI micro app ID (required)"`
	Name        *string `json:"name,omitempty" description:"Optional replacement app name"`
	Description *string `json:"description,omitempty" description:"Optional replacement description; pass an empty string to clear it"`
	HTML        *string `json:"html,omitempty" description:"Optional full self-contained HTML document to replace the current file"`
	Status      *string `json:"status,omitempty" description:"Optional app status: draft, published, or archived"`
}

type getAIMicroAppInput struct {
	ID          string `json:"id" description:"Existing AI micro app ID (required)"`
	IncludeHTML bool   `json:"includeHtml,omitempty" description:"Whether to include the full HTML source; default false"`
}

type listAIMicroAppsInput struct {
	Query   string `json:"query,omitempty" description:"Optional search text matched against app name/title and description"`
	Page    int    `json:"page,omitempty" description:"Page number, default 1"`
	PerPage int    `json:"perPage,omitempty" description:"Items per page, default 10, max 20"`
}

type searchAIMicroAppInput struct {
	ID           string `json:"id" description:"Existing AI micro app ID (required)"`
	Query        string `json:"query" description:"Exact text to search in the app HTML (required)"`
	ContextChars int    `json:"contextChars,omitempty" description:"Characters of context before and after each match; default 300, max 2000"`
	MaxMatches   int    `json:"maxMatches,omitempty" description:"Maximum matches to return; default 5, max 20"`
}

type replaceInAIMicroAppInput struct {
	ID         string `json:"id" description:"Existing AI micro app ID (required)"`
	Find       string `json:"find" description:"Exact text to find in the app HTML (required)"`
	Replace    string `json:"replace" description:"Replacement text; can be empty to delete the matched text"`
	ReplaceAll bool   `json:"replaceAll,omitempty" description:"Replace all matches instead of only the first one"`
}

type writeAIMicroAppChunkInput struct {
	ID      string `json:"id" description:"Existing AI micro app ID (required)"`
	Content string `json:"content" description:"A chunk of HTML source to write. Keep chunks modest instead of sending a full large app in one tool call."`
	Mode    string `json:"mode,omitempty" description:"Write mode: replace for the first chunk, append for following chunks. Default append."`
}

func newCreateAIMicroAppTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"create_ai_micro_app",
		"Create a self-contained micro app, small tool, prototype, or casual mini game as HTML. For larger work, create first, then write chunks. Prefer a clean shadcn/ui-like style unless the user asks for something else. Returns ok, id, result, previewUrl, error.",
		func(ctx context.Context, input createAIMicroAppInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return aiMicroAppToolResponse(microapps.Create(ctx, app, actorID, microapps.CreateInput(input)))
		},
	)
}

func newUpdateAIMicroAppTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"update_ai_micro_app",
		"Update an existing micro app, small tool, prototype, or mini game. Only provided fields change. Use replace_in_ai_micro_app for small edits. Prefer a clean shadcn/ui-like style unless the user asks for something else. Returns ok, id, result, previewUrl, error.",
		func(ctx context.Context, input updateAIMicroAppInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return aiMicroAppToolResponse(microapps.Update(ctx, app, actorID, microapps.UpdateInput(input)))
		},
	)
}

func newGetAIMicroAppTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"get_ai_micro_app",
		"Get an existing micro app's metadata, optionally with full HTML source. Prefer includeHtml=false unless source is needed. Returns ok, id, result, previewUrl, name, description, appStatus, html, error.",
		func(ctx context.Context, input getAIMicroAppInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return aiMicroAppToolResponse(microapps.Get(ctx, app, actorID, microapps.GetInput(input)))
		},
	)
}

func newListAIMicroAppsTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"list_ai_micro_apps",
		"List the user's micro apps, optionally searching name/title and description. Use this first when the user refers to one by name. Returns ok, result, items, page, perPage, hasMore, error.",
		func(ctx context.Context, input listAIMicroAppsInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return aiMicroAppToolResponse(microapps.List(ctx, app, actorID, microapps.ListInput(input)))
		},
	)
}

func newSearchAIMicroAppTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"search_ai_micro_app",
		"Search exact text in a micro app's HTML and return short matching snippets. Use before replace_in_ai_micro_app to find precise text. Returns ok, id, result, previewUrl, matches, error.",
		func(ctx context.Context, input searchAIMicroAppInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return aiMicroAppToolResponse(microapps.Search(ctx, app, actorID, microapps.SearchInput(input)))
		},
	)
}

func newReplaceInAIMicroAppTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"replace_in_ai_micro_app",
		"Find and replace exact text in a micro app's HTML. Use for small edits. Returns ok, id, result, previewUrl, replacements, error.",
		func(ctx context.Context, input replaceInAIMicroAppInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return aiMicroAppToolResponse(microapps.Replace(ctx, app, actorID, microapps.ReplaceInput(input)))
		},
	)
}

func newWriteAIMicroAppChunkTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"write_ai_micro_app_chunk",
		"Write one HTML chunk to a micro app. Use mode=replace for the first chunk, then mode=append. Best for larger tools or mini games. Returns ok, id, result, previewUrl, sourceLength, error.",
		func(ctx context.Context, input writeAIMicroAppChunkInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return aiMicroAppToolResponse(microapps.WriteChunk(ctx, app, actorID, microapps.WriteChunkInput(input)))
		},
	)
}

func aiMicroAppToolResponse(result microapps.Result) (fantasy.ToolResponse, error) {
	data, err := json.Marshal(result)
	if err != nil {
		return fantasy.NewTextErrorResponse("Failed to serialize AI micro app result"), nil
	}
	return fantasy.NewTextResponse(string(data)), nil
}
