package tools

import (
	"context"
	"encoding/json"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	workdocs "github.com/xusenlin/workavera/internal/docs"
)

type docsSearchInput struct {
	Query     string `json:"query,omitempty" description:"Optional text matched against document titles and content"`
	Limit     int    `json:"limit,omitempty" description:"Maximum results, default 20, max 50"`
	FolderID  string `json:"folderId,omitempty" description:"Optional personal folder ID returned by docs_list_folders"`
	ProjectID string `json:"projectId,omitempty" description:"Optional Board project ID"`
	RootOnly  bool   `json:"rootOnly,omitempty" description:"Only search documents directly in My documents. Mutually exclusive with folderId and projectId."`
}

type docsGetInput struct {
	ID string `json:"id" description:"Document ID returned by docs_search or docs_upsert"`
}

type docsUpsertInput struct {
	ID           string `json:"id,omitempty" description:"Existing document ID. Omit to create a new document; provide to update an existing one."`
	Title        string `json:"title" description:"Complete document title"`
	Kind         string `json:"kind" enum:"markdown,html" description:"Document kind: markdown for simple, easily editable content; html for rich, interactive content. Before creating, ask the user to choose if they have not specified a kind. When updating, use the existing kind returned by docs_get."`
	Content      string `json:"content,omitempty" description:"Complete document content: Markdown for markdown documents, a full self-contained HTML file for html documents. For HTML too large for one call, create with a short placeholder and continue with docs_write_chunk."`
	ProjectID    string `json:"projectId,omitempty" description:"Optional Board project ID; omit for a private document. Only used when creating."`
	FolderID     string `json:"folderId,omitempty" description:"Optional personal folder ID returned by docs_list_folders. Mutually exclusive with projectId and only used when creating."`
	BaseRevision int    `json:"baseRevision,omitempty" description:"Revision returned by docs_get; required when updating. The save fails if it is stale."`
}

type docsMoveItem struct {
	ID            string `json:"id" description:"Document ID returned by docs_search or docs_get"`
	Destination   string `json:"destination" enum:"my_documents,folder,project" description:"Target location type"`
	DestinationID string `json:"destinationId,omitempty" description:"Folder or project ID. Omit only when destination is my_documents."`
}

type docsMoveInput struct {
	Items []docsMoveItem `json:"items" description:"One to 50 document moves"`
}

type docsWriteChunkInput struct {
	ID           string `json:"id" description:"Existing document ID"`
	Content      string `json:"content" description:"The next chunk of document content"`
	Mode         string `json:"mode,omitempty" description:"replace starts new content and bumps the revision; append (default) extends the previous chunk without a new revision"`
	BaseRevision int    `json:"baseRevision" description:"Revision returned by the previous docs call; each response returns the revision to pass next"`
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
		result, err := workdocs.Search(ctx, app, actorID, workdocs.SearchOptions{Query: input.Query, Limit: input.Limit, FolderID: input.FolderID, ProjectID: input.ProjectID, RootOnly: input.RootOnly})
		return docsToolResponse(result, err)
	})
}

func newDocsGetTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool("docs_get", "Read the current complete content, kind, and revision of a visible document. Always call this before updating an existing document.", func(ctx context.Context, input docsGetInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
		result, err := workdocs.Get(ctx, app, actorID, input.ID)
		return docsToolResponse(result, err)
	})
}

func newDocsUpsertTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool("docs_upsert", "Create or update a document only when explicitly requested. Before creating, if the user has not chosen a kind, briefly ask them to choose simple, easily editable Markdown or rich, interactive HTML. Before updating, call docs_get and use its kind and revision. Prefer one call for multiple edits. Never mutate the same document in parallel or overwrite a revision conflict.", func(ctx context.Context, input docsUpsertInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
		if input.ID == "" {
			result, err := workdocs.Create(ctx, app, actorID, workdocs.CreateInput{Title: input.Title, Kind: input.Kind, Content: input.Content, ProjectID: input.ProjectID, FolderID: input.FolderID, Source: "ai"})
			return docsToolResponse(result, err)
		}
		result, changed, err := workdocs.Update(ctx, app, actorID, input.ID, workdocs.UpdateInput{Title: input.Title, Content: input.Content, BaseRevision: input.BaseRevision, Source: "ai"})
		if err != nil {
			return fantasy.NewTextErrorResponse("Document save failed: " + err.Error()), nil
		}
		return docsToolResponse(map[string]any{"document": result, "changed": changed}, nil)
	})
}

func newDocsListFoldersTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool("docs_list_folders", "List the current user's personal document folders. Use this to resolve a folder name to its ID before creating or moving a document.", func(ctx context.Context, _ struct{}, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
		result, err := workdocs.ListFolders(ctx, app, actorID)
		return docsToolResponse(result, err)
	})
}

func newDocsMoveTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool("docs_move", "Move a document only when the user explicitly asks to organize or move it. A document's creator can move it to My documents, an existing personal folder, or an editable project. Moving a document out of a project automatically unlinks it from that project's tasks.", func(ctx context.Context, input docsMoveInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
		result, err := executeBatch(input.Items, func(_ int, item docsMoveItem) (any, error) {
			return workdocs.Move(ctx, app, actorID, item.ID, workdocs.MoveInput{Destination: item.Destination, DestinationID: item.DestinationID})
		})
		return batchToolResponse(result, err)
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

func newDocsWriteChunkTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool("docs_write_chunk", "Write long document content in pieces when it does not fit one docs_upsert call. Start with mode=replace (bumps the revision), then continue with mode=append passing the revision each response returns. A chunked session records a single version.", func(ctx context.Context, input docsWriteChunkInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
		result, err := workdocs.WriteChunk(ctx, app, actorID, workdocs.WriteChunkInput{ID: input.ID, Content: input.Content, Mode: input.Mode, BaseRevision: input.BaseRevision, Source: "ai"})
		if err != nil {
			return fantasy.NewTextErrorResponse("Document chunk write failed: " + err.Error()), nil
		}
		return docsToolResponse(map[string]any{"id": result.ID, "kind": result.Kind, "revision": result.Revision, "contentLength": len(result.Content)}, nil)
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
