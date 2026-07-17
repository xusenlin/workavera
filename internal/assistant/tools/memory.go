package tools

import (
	"context"
	"encoding/json"
	"strings"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"

	workagent "github.com/xusenlin/workavera/internal/agent"
	workmemory "github.com/xusenlin/workavera/internal/memory"
)

type memoryUpsertInput struct {
	ID       string `json:"id,omitempty" description:"Existing memory ID to update; omit to create a new memory"`
	Category string `json:"category" description:"Memory category: preference, personal, work, goal, or constraint"`
	Content  string `json:"content" description:"One concise durable fact explicitly stated by the user, maximum 500 characters"`
	Origin   string `json:"origin" description:"explicit when the user asked to remember it; automatic only for proactive capture"`
}

type memoryForgetInput struct {
	ID string `json:"id" description:"Exact saved memory ID to permanently forget"`
}

func newMemoryUpsertTool(app core.App, scope workagent.ToolScope, autoCapture bool) fantasy.AgentTool {
	description := "Create or update one long-term Chat memory. Use origin=explicit only when the user explicitly asks to remember something. Store one concise, durable fact; never store secrets, inferred facts, transient state, full content, or data already managed by another Workavera module. Update a conflicting memory by its existing ID instead of creating a duplicate."
	if autoCapture {
		description += " Automatic capture is enabled, so origin=automatic may be used for an explicitly stated durable fact that is likely to improve future conversations."
	} else {
		description += " Automatic capture is disabled; never call this tool unless the user explicitly asks to remember the information, and always use origin=explicit."
	}
	return fantasy.NewAgentTool(
		"system_memory_upsert",
		description,
		func(_ context.Context, input memoryUpsertInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := workmemory.Upsert(app, scope.ActorID, scope.ConversationID, scope.UserMessageID, workmemory.UpsertInput{
				ID:       strings.TrimSpace(input.ID),
				Category: input.Category,
				Content:  input.Content,
				Origin:   input.Origin,
			})
			if err != nil {
				app.Logger().Error("assistant memory upsert failed", "actorId", scope.ActorID, "error", err)
				return fantasy.NewTextErrorResponse(err.Error()), nil
			}
			data, err := json.Marshal(result)
			if err != nil {
				return fantasy.NewTextErrorResponse("Failed to serialize the saved memory"), nil
			}
			return fantasy.NewTextResponse(string(data)), nil
		},
	)
}

func newMemoryForgetTool(app core.App, scope workagent.ToolScope) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"system_memory_forget",
		"Permanently forget one saved Chat memory only when the user explicitly asks to forget it. Use the exact memory ID from the saved-memory context; never infer permission to delete.",
		func(_ context.Context, input memoryForgetInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			forgotten, err := workmemory.Forget(app, scope.ActorID, strings.TrimSpace(input.ID))
			if err != nil {
				app.Logger().Error("assistant memory forget failed", "actorId", scope.ActorID, "error", err)
				return fantasy.NewTextErrorResponse(err.Error()), nil
			}
			data, err := json.Marshal(map[string]any{"action": "forgotten", "memory": forgotten})
			if err != nil {
				return fantasy.NewTextErrorResponse("Failed to serialize the forgotten memory"), nil
			}
			return fantasy.NewTextResponse(string(data)), nil
		},
	)
}
