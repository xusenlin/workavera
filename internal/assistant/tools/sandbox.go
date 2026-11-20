package tools

import (
	"context"
	"encoding/json"
	"errors"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"

	workagent "github.com/xusenlin/workavera/internal/agent"
	workdocs "github.com/xusenlin/workavera/internal/docs"
	"github.com/xusenlin/workavera/internal/resources"
	"github.com/xusenlin/workavera/internal/sandbox"
)

type sandboxBashInput struct {
	Command string `json:"command" description:"Shell command run with bash -l in /workspace"`
}

type sandboxReadFileInput struct {
	Path   string `json:"path" description:"File path, relative to /workspace or absolute in the container"`
	Offset int    `json:"offset,omitempty" description:"First line to read, starting at 1 (default 1)"`
	Limit  int    `json:"limit,omitempty" description:"Number of lines to read, default and max 2000"`
}

type sandboxWriteFileInput struct {
	Path    string `json:"path" description:"File path, relative to /workspace or absolute in the container"`
	Content string `json:"content" description:"Complete file content, at most 1 MiB"`
}

type sandboxEditFileInput struct {
	Path       string `json:"path" description:"File path, relative to /workspace or absolute in the container"`
	OldText    string `json:"oldText" description:"Exact text to replace, including whitespace; it must match exactly once unless replaceAll is set"`
	NewText    string `json:"newText" description:"Replacement text; empty deletes the matched text"`
	ReplaceAll bool   `json:"replaceAll,omitempty" description:"Replace every match instead of exactly one"`
}

type sandboxImportInput struct {
	Source string `json:"source" enum:"resource,doc" description:"resource for an uploaded file, doc for a document"`
	ID     string `json:"id" description:"Resource ID or document ID"`
}

type sandboxExportInput struct {
	Path      string `json:"path" description:"File path, relative to /workspace or absolute in the container"`
	Target    string `json:"target" enum:"resource,doc" description:"resource saves the file to Resources; doc creates a new document from a .md, .markdown, .html, or .htm file"`
	Name      string `json:"name,omitempty" description:"Resource display name or document title; defaults to the file name"`
	FolderID  string `json:"folderId,omitempty" description:"For target=doc: personal folder ID returned by docs_list_folders. Mutually exclusive with projectId."`
	ProjectID string `json:"projectId,omitempty" description:"For target=doc: Board project ID for a project document"`
}

// sandboxTools are the Chat-only tools of the user's sandbox. None of them
// is in ForActor, so MCP and API keys never reach a sandbox.
func sandboxTools(app core.App, manager *sandbox.Manager, scope workagent.ToolScope) []fantasy.AgentTool {
	actorID, conversationID := scope.ActorID, scope.ConversationID
	return []fantasy.AgentTool{
		fantasy.NewAgentTool(
			"sandbox_bash",
			"Run a shell command in the user's sandbox with bash -l in /workspace. Returns exitCode, stdout, and stderr; each keeps only its last 50 KB and 2000 lines, and omitted bytes are counted. A non-zero exit code is a normal result. A command still running after 30 seconds keeps running in the background and returns status=running with its pid and outputDir; follow it with tail and cat in later commands and stop it with kill -- -<pid>.",
			func(ctx context.Context, input sandboxBashInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
				result, err := manager.Bash(ctx, actorID, conversationID, input.Command)
				return sandboxToolResponse(app, actorID, "sandbox_bash", result, err)
			},
		),
		fantasy.NewAgentTool(
			"sandbox_read_file",
			"Read a text file in the user's sandbox as numbered lines, at most 50 KB per call. When truncated is true, continue from nextOffset. Binary files fail with sandbox_file_not_text; inspect them with sandbox_bash instead.",
			func(ctx context.Context, input sandboxReadFileInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
				result, err := manager.ReadFile(ctx, actorID, conversationID, input.Path, input.Offset, input.Limit)
				return sandboxToolResponse(app, actorID, "sandbox_read_file", result, err)
			},
		),
		fantasy.NewAgentTool(
			"sandbox_write_file",
			"Create or overwrite a text file in the user's sandbox, creating parent directories. Read an existing file before overwriting it. Content is at most 1 MiB; generate larger files with a script.",
			func(ctx context.Context, input sandboxWriteFileInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
				result, err := manager.WriteFile(ctx, actorID, conversationID, input.Path, input.Content)
				return sandboxToolResponse(app, actorID, "sandbox_write_file", result, err)
			},
		),
		fantasy.NewAgentTool(
			"sandbox_edit_file",
			"Replace exact text in a text file in the user's sandbox. oldText must match exactly once, or set replaceAll; on sandbox_edit_no_match or sandbox_edit_ambiguous, read the file again and give more surrounding text.",
			func(ctx context.Context, input sandboxEditFileInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
				result, err := manager.EditFile(ctx, actorID, conversationID, input.Path, input.OldText, input.NewText, input.ReplaceAll)
				return sandboxToolResponse(app, actorID, "sandbox_edit_file", result, err)
			},
		),
		fantasy.NewAgentTool(
			"sandbox_import",
			"Copy one of the user's resources or a document they can see into the sandbox on the server, without passing its content through the conversation. Resources go to the conversation's resources/ folder as the original file. Documents go to the conversation's docs/ folder as .md or .html. Existing files are never overwritten; a numbered name is used instead.",
			func(ctx context.Context, input sandboxImportInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
				result, err := manager.Import(ctx, actorID, conversationID, input.Source, input.ID)
				return sandboxToolResponse(app, actorID, "sandbox_import", result, err)
			},
		),
		fantasy.NewAgentTool(
			"sandbox_export",
			"Save a file from the user's sandbox to Workavera: target=resource adds it to Resources under the rules of an upload (the size limit the administrator sets, 10 MB by default, and the supported document, text, code, SQLite, image, and archive types); target=doc creates a new document from a .md, .markdown, .html, or .htm file. Never overwrites existing resources or documents; update documents with docs_replace or docs_upsert.",
			func(ctx context.Context, input sandboxExportInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
				result, err := manager.Export(ctx, actorID, conversationID, sandbox.ExportInput{
					Path:      input.Path,
					Target:    input.Target,
					Name:      input.Name,
					FolderID:  input.FolderID,
					ProjectID: input.ProjectID,
				})
				return sandboxToolResponse(app, actorID, "sandbox_export", result, err)
			},
		),
	}
}

// sandboxToolResponse reports sandbox, resource, and document errors by
// their stable code and safe message; other causes, which may carry Docker
// output, stay in the server log.
func sandboxToolResponse(app core.App, actorID, tool string, value any, err error) (fantasy.ToolResponse, error) {
	if err != nil {
		var sandboxErr *sandbox.Error
		var resourceErr *resources.Error
		switch {
		case errors.As(err, &sandboxErr):
			return fantasy.NewTextErrorResponse(sandboxErr.Code + ": " + sandboxErr.Message), nil
		case errors.As(err, &resourceErr):
			return fantasy.NewTextErrorResponse(resourceErr.Code + ": " + resourceErr.Message), nil
		case errors.Is(err, workdocs.ErrNotFound), errors.Is(err, workdocs.ErrForbidden), errors.Is(err, workdocs.ErrInvalidInput):
			return fantasy.NewTextErrorResponse("Document operation failed: " + err.Error()), nil
		case errors.Is(err, context.Canceled):
			return fantasy.NewTextErrorResponse("The sandbox operation was cancelled."), nil
		}
		app.Logger().Error("assistant sandbox tool failed", "actorId", actorID, "tool", tool, "error", err)
		return fantasy.NewTextErrorResponse("The sandbox operation failed. The user can check the sandbox in Settings."), nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return fantasy.NewTextErrorResponse("Failed to serialize the sandbox result"), nil
	}
	return fantasy.NewTextResponse(string(data)), nil
}
