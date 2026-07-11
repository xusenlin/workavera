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
	ID string `json:"id" description:"Document ID returned by docs_search or docs_create"`
}

type docsCreateInput struct {
	Title     string `json:"title" description:"Document title"`
	Content   string `json:"content,omitempty" description:"Complete Markdown document content"`
	ProjectID string `json:"projectId,omitempty" description:"Optional Board project ID; omit for a private document"`
}

type docsUpdateInput struct {
	ID           string `json:"id" description:"Document ID"`
	Title        string `json:"title" description:"Complete replacement title"`
	Content      string `json:"content" description:"Complete replacement Markdown content"`
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

func newDocsCreateTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool("docs_create", "Create and explicitly save a private or project Markdown document. This creates revision 1. Only call when the user clearly asks to save or create a document.", func(ctx context.Context, input docsCreateInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
		result, err := workdocs.Create(ctx, app, actorID, workdocs.CreateInput{Title: input.Title, Content: input.Content, ProjectID: input.ProjectID, Source: "ai"})
		return docsToolResponse(result, err)
	})
}

func newDocsUpdateTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool("docs_update", "Explicitly save a complete replacement title and Markdown body for an existing document. Call docs_get first and pass its revision. A concurrent save causes a conflict and must never be overwritten automatically.", func(ctx context.Context, input docsUpdateInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
		result, changed, err := workdocs.Update(ctx, app, actorID, input.ID, workdocs.UpdateInput{Title: input.Title, Content: input.Content, BaseRevision: input.BaseRevision, Source: "ai"})
		if err != nil {
			return fantasy.NewTextErrorResponse("Document save failed: " + err.Error()), nil
		}
		return docsToolResponse(map[string]any{"document": result, "changed": changed}, nil)
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
