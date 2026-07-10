package tools

import (
	"context"
	"encoding/json"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/microapps"
)

type microappsCreateInput struct {
	Name        string `json:"name" description:"AI micro app name (required)"`
	Description string `json:"description,omitempty" description:"Optional short description of what the app does"`
	HTML        string `json:"html" description:"Full self-contained HTML document (required)"`
}

type microappsUpdateInput struct {
	ID          string  `json:"id" description:"Existing AI micro app ID (required)"`
	Name        *string `json:"name,omitempty" description:"Optional replacement app name"`
	Description *string `json:"description,omitempty" description:"Optional replacement description; pass an empty string to clear it"`
	HTML        *string `json:"html,omitempty" description:"Optional full self-contained HTML document to replace the current file"`
	Status      *string `json:"status,omitempty" description:"Optional app status: draft, published, or archived"`
}

type microappsGetInput struct {
	ID          string `json:"id" description:"Existing AI micro app ID (required)"`
	IncludeHTML bool   `json:"includeHtml,omitempty" description:"Whether to include the full HTML source; default false"`
}

type microappsListInput struct {
	Query   string `json:"query,omitempty" description:"Optional search text matched against app name/title and description"`
	Page    int    `json:"page,omitempty" description:"Page number, default 1"`
	PerPage int    `json:"perPage,omitempty" description:"Items per page, default 10, max 20"`
}

type microappsSearchInput struct {
	ID           string `json:"id" description:"Existing AI micro app ID (required)"`
	Query        string `json:"query" description:"Exact text to search in the app HTML (required)"`
	ContextChars int    `json:"contextChars,omitempty" description:"Characters of context before and after each match; default 300, max 2000"`
	MaxMatches   int    `json:"maxMatches,omitempty" description:"Maximum matches to return; default 5, max 20"`
}

type microappsReplaceInput struct {
	ID         string `json:"id" description:"Existing AI micro app ID (required)"`
	Find       string `json:"find" description:"Exact text to find in the app HTML (required)"`
	Replace    string `json:"replace" description:"Replacement text; can be empty to delete the matched text"`
	ReplaceAll bool   `json:"replaceAll,omitempty" description:"Replace all matches instead of only the first one"`
}

type microappsWriteChunkInput struct {
	ID      string `json:"id" description:"Existing AI micro app ID (required)"`
	Content string `json:"content" description:"A chunk of HTML source to write. Keep chunks modest instead of sending a full large app in one tool call."`
	Mode    string `json:"mode,omitempty" description:"Write mode: replace for the first chunk, append for following chunks. Default append."`
}

func newMicroappsCreateTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"microapps_create",
		"Create a self-contained micro app, small tool, prototype, or casual mini game as HTML. For larger work, create first, then write chunks.",
		func(ctx context.Context, input microappsCreateInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return microappToolResponse(microapps.Create(ctx, app, actorID, microapps.CreateInput(input)))
		},
	)
}

func newMicroappsUpdateTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"microapps_update",
		"Update an existing micro app. Only provided fields change. Use microapps_replace for small edits.",
		func(ctx context.Context, input microappsUpdateInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return microappToolResponse(microapps.Update(ctx, app, actorID, microapps.UpdateInput(input)))
		},
	)
}

func newMicroappsGetTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"microapps_get",
		"Get an existing micro app's metadata, optionally with full HTML source. Prefer includeHtml=false unless source is needed.",
		func(ctx context.Context, input microappsGetInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return microappToolResponse(microapps.Get(ctx, app, actorID, microapps.GetInput(input)))
		},
	)
}

func newMicroappsListTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"microapps_list",
		"List the user's micro apps, optionally searching name/title and description. Use this first when the user refers to one by name.",
		func(ctx context.Context, input microappsListInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return microappToolResponse(microapps.List(ctx, app, actorID, microapps.ListInput(input)))
		},
	)
}

func newMicroappsSearchTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"microapps_search",
		"Search exact text in a micro app's HTML and return short matching snippets. Use before microapps_replace to find precise text.",
		func(ctx context.Context, input microappsSearchInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return microappToolResponse(microapps.Search(ctx, app, actorID, microapps.SearchInput(input)))
		},
	)
}

func newMicroappsReplaceTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"microapps_replace",
		"Find and replace exact text in a micro app's HTML. Use for small edits.",
		func(ctx context.Context, input microappsReplaceInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return microappToolResponse(microapps.Replace(ctx, app, actorID, microapps.ReplaceInput(input)))
		},
	)
}

func newMicroappsWriteChunkTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"microapps_write_chunk",
		"Write one HTML chunk to a micro app. Use mode=replace for the first chunk, then mode=append.",
		func(ctx context.Context, input microappsWriteChunkInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			return microappToolResponse(microapps.WriteChunk(ctx, app, actorID, microapps.WriteChunkInput(input)))
		},
	)
}

func microappToolResponse(result microapps.Result) (fantasy.ToolResponse, error) {
	data, err := json.Marshal(result)
	if err != nil {
		return fantasy.NewTextErrorResponse("Failed to serialize AI micro app result"), nil
	}
	return fantasy.NewTextResponse(string(data)), nil
}
