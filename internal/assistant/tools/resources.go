package tools

import (
	"context"
	"encoding/json"
	"errors"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"

	workagent "github.com/xusenlin/workavera/internal/agent"
	"github.com/xusenlin/workavera/internal/resources"
)

type resourcesListInput struct {
	Query string `json:"query,omitempty" description:"Optional literal text, 1-200 characters, matched case-insensitively against resource names"`
	Limit int    `json:"limit,omitempty" description:"Maximum results, default 20, max 50"`
}

type resourcesRenameItem struct {
	ResourceID string `json:"resourceId" description:"Resource ID from an attached-file block or resources_list"`
	Name       string `json:"name" description:"New display name, 1-255 characters; keep the file extension unless the user asks otherwise"`
}

type resourcesRenameInput struct {
	Items []resourcesRenameItem `json:"items" description:"One to 50 resource renames"`
}

type resourcesCreateDownloadURLInput struct {
	ResourceID string `json:"resourceId" description:"Resource ID from an attached-file block or resources_list"`
	Purpose    string `json:"purpose" description:"Concrete use and recipient of the file, 10-200 characters, shown to the user for approval, e.g. 'Send the contract to the e-signature MCP tool for signing'"`
}

type resourcesRevokeDownloadURLInput struct {
	LeaseID string `json:"leaseId" description:"leaseId returned by resources_create_download_url"`
}

func newResourcesListTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"resources_list",
		"List or find the user's uploaded files (resources) by name to get a resourceId. Files attached to a chat message already carry their resourceId, so use this only for files the user mentions without attaching. Returns metadata only; use sandbox_import to inspect or process a file in the sandbox.",
		func(ctx context.Context, input resourcesListInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := resources.List(ctx, app, actorID, input.Query, input.Limit)
			return resourcesToolResponse(app, actorID, "list", result, err)
		},
	)
}

func newResourcesRenameTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"resources_rename",
		"Rename the user's resources only when the user explicitly asks. Changes only the display name shown in Resources and Chat; the original file, its content, and its type stay the same. Results are reported per item, so one failure does not stop the others.",
		func(_ context.Context, input resourcesRenameInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := executeBatch(input.Items, func(_ int, item resourcesRenameItem) (any, error) {
				resource, err := resources.Rename(app, actorID, item.ResourceID, item.Name)
				if err != nil {
					var resourceErr *resources.Error
					if errors.As(err, &resourceErr) {
						return nil, errors.New(resourceErr.Code + ": " + resourceErr.Message)
					}
					app.Logger().Error("assistant resources rename failed", "actorId", actorID, "error", err)
					return nil, errors.New("The resource could not be renamed.")
				}
				return map[string]any{"id": resource.ID, "name": resource.DisplayName}, nil
			})
			return batchToolResponse(result, err)
		},
	)
}

func newResourcesCreateDownloadURLTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"resources_create_download_url",
		"Create a public download URL for a resource's original file, valid for 5 minutes. Call only when the user explicitly asks for a download link or to hand the file to an external service that needs a URL. Always pauses for user approval. Create a new link for each need instead of reusing a URL from earlier results, and do not repeat the URL in your reply; the UI shows it. Once an external service has fetched the file, revoke the link with resources_revoke_download_url unless the user still needs it.",
		func(ctx context.Context, input resourcesCreateDownloadURLInput, call fantasy.ToolCall) (fantasy.ToolResponse, error) {
			target, err := resources.PrepareLease(app, actorID, input.ResourceID, input.Purpose)
			if err != nil {
				return resourcesToolResponse(app, actorID, "prepare download url", nil, err)
			}
			approved, err := workagent.RequireApproval(ctx, workagent.ApprovalRequest{
				ToolCallID: call.ID,
				ToolName:   call.Name,
				Title:      "Create download link?",
				Summary:    "Anyone with the link can download “" + target.Name + "” without signing in until it expires.",
				Target: map[string]any{
					"type": "resource",
					"id":   target.ResourceID,
					"name": target.Name,
				},
				Details: []workagent.ApprovalDetail{
					{Label: "Valid for", Value: "5 minutes"},
					{Label: "Purpose", Value: target.Purpose},
				},
				Presentation: workagent.ApprovalPresentation{
					ConfirmLabel:   "Create link",
					PendingMessage: "Creating download link…",
					SuccessMessage: "Download link created.",
					DeniedMessage:  "Download link not created.",
					FailureMessage: "The download link could not be created.",
				},
			})
			if err != nil {
				return fantasy.ToolResponse{}, err
			}
			if !approved {
				return resourcesToolResponse(app, actorID, "create download url", map[string]any{
					"ok": false, "action": "denied", "resourceId": target.ResourceID, "reason": "user_denied",
				}, nil)
			}
			result, err := resources.CreateLease(app, actorID, target.ResourceID, target.Purpose, "chat")
			return resourcesToolResponse(app, actorID, "create download url", result, err)
		},
	)
}

func newResourcesRevokeDownloadURLTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"resources_revoke_download_url",
		"Revoke a download URL created by resources_create_download_url, so it stops working immediately. Needs no approval. Succeeds even when the link already expired or was revoked.",
		func(ctx context.Context, input resourcesRevokeDownloadURLInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			err := resources.RevokeLease(app, actorID, input.LeaseID)
			return resourcesToolResponse(app, actorID, "revoke download url", map[string]any{"ok": true, "leaseId": input.LeaseID, "revoked": true}, err)
		},
	)
}

// resourcesToolResponse reports resource errors by their stable code and safe
// message only; underlying causes stay in the server log.
func resourcesToolResponse(app core.App, actorID, action string, value any, err error) (fantasy.ToolResponse, error) {
	if err != nil {
		var resourceErr *resources.Error
		if errors.As(err, &resourceErr) {
			return fantasy.NewTextErrorResponse(resourceErr.Code + ": " + resourceErr.Message), nil
		}
		app.Logger().Error("assistant resources tool failed", "actorId", actorID, "action", action, "error", err)
		return fantasy.NewTextErrorResponse("Resources are temporarily unavailable."), nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return fantasy.NewTextErrorResponse("Failed to serialize resources result"), nil
	}
	return fantasy.NewTextResponse(string(data)), nil
}
