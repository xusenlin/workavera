package tools

import (
	"context"
	"encoding/json"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	workdocs "github.com/xusenlin/workavera/internal/docs"
)

type docsSearchInput struct {
	Query string `json:"query,omitempty" description:"Optional text matched against document titles and Markdown content"`
	Limit int    `json:"limit,omitempty" description:"Maximum results, default 20, max 50"`
}

type docsGetInput struct {
	ID string `json:"id" description:"Document ID returned by docs_search or docs_upsert"`
}

type docsUpsertInput struct {
	ID           string `json:"id,omitempty" description:"Existing document ID. Omit to create a new document; provide to update an existing one."`
	Title        string `json:"title" description:"Complete document title"`
	Content      string `json:"content,omitempty" description:"Complete Markdown document content"`
	ProjectID    string `json:"projectId,omitempty" description:"Optional Board project ID; omit for a private document. Only used when creating."`
	BaseRevision int    `json:"baseRevision,omitempty" description:"Revision returned by docs_get; required when updating. The save fails if it is stale."`
}

type docsReplaceInput struct {
	ID           string `json:"id" description:"Existing document ID"`
	Find         string `json:"find" description:"Exact text to find in the document Markdown"`
	Replace      string `json:"replace" description:"Replacement text; can be empty to delete the matched text"`
	ReplaceAll   bool   `json:"replaceAll,omitempty" description:"Replace all matches instead of only the first one"`
	BaseRevision int    `json:"baseRevision" description:"Revision returned by docs_get; the save fails if it is stale"`
}

func newDocsSearchTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool("docs_search", "Search documents visible to the current user. Returns metadata and a short Markdown excerpt.", func(ctx context.Context, input docsSearchInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
		result, err := workdocs.Search(ctx, app, actorID, workdocs.SearchOptions{Query: input.Query, Limit: input.Limit})
		return docsToolResponse(result, err)
	})
}

func newDocsGetTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool("docs_get", "Read the current complete Markdown and revision of a visible document. Always call this before updating an existing document.", func(ctx context.Context, input docsGetInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
		result, err := workdocs.Get(ctx, app, actorID, input.ID)
		return docsToolResponse(result, err)
	})
}

func newDocsUpsertTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool("docs_upsert", "Create or update a Markdown document only when explicitly requested. Omit id to create; provide id to update. Before updating, call docs_get and pass its revision as baseRevision. Prefer one call for multiple edits. Never mutate the same document in parallel or overwrite a revision conflict.", func(ctx context.Context, input docsUpsertInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
		if input.ID == "" {
			result, err := workdocs.Create(ctx, app, actorID, workdocs.CreateInput{Title: input.Title, Content: input.Content, ProjectID: input.ProjectID, Source: "ai"})
			return docsToolResponse(result, err)
		}
		result, changed, err := workdocs.Update(ctx, app, actorID, input.ID, workdocs.UpdateInput{Title: input.Title, Content: input.Content, BaseRevision: input.BaseRevision, Source: "ai"})
		if err != nil {
			return fantasy.NewTextErrorResponse("Document save failed: " + err.Error()), nil
		}
		return docsToolResponse(map[string]any{"document": result, "changed": changed}, nil)
	})
}

func newDocsReplaceTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool("docs_replace", "Replace exact Markdown text only when explicitly requested. First call docs_get and pass its revision as baseRevision. Use for one small edit; prefer one docs_upsert for multiple edits. Never mutate the same document in parallel. A later mutation must use the revision returned by this call; never overwrite a conflict.", func(ctx context.Context, input docsReplaceInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
		result, matches, changed, err := workdocs.Replace(ctx, app, actorID, input.ID, workdocs.ReplaceInput{Find: input.Find, Replace: input.Replace, ReplaceAll: input.ReplaceAll, BaseRevision: input.BaseRevision, Source: "ai"})
		if err != nil {
			return fantasy.NewTextErrorResponse("Document replace failed: " + err.Error()), nil
		}
		return docsToolResponse(map[string]any{"document": result, "matches": matches, "changed": changed}, nil)
	})
}

func docsToolResponse(value any, err error) (fantasy.ToolResponse, error) {
	if err != nil {
		return fantasy.NewTextErrorResponse("Document operation failed: " + err.Error()), nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return fantasy.NewTextErrorResponse("Failed to serialize document result"), nil
	}
	return fantasy.NewTextResponse(string(data)), nil
}
