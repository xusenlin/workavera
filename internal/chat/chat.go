package chat

import (
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
	workagent "github.com/xusenlin/workavera/internal/agent"
	assistanttools "github.com/xusenlin/workavera/internal/assistant/tools"
)

const maxPinnedConversations = 6

func Register(app core.App) {
	toolFactory := assistanttools.NewFactory(app)
	service := newService(app, workagent.NewFantasyRunner(toolFactory.ForChat))
	register(app, service)
}

func register(app core.App, service *service) {
	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		if err := recoverInterruptedRuns(event.App); err != nil {
			return err
		}
		group := event.Router.Group("/api/chat").Bind(apis.RequireAuth("users"))
		group.GET("/conversations/{id}/messages", service.listMessages)
		group.POST("/messages/{messageId}/memory-actions/{toolCallId}/undo", service.undoMemoryAction)
		group.POST("/stream", service.stream)
		group.GET("/runs/{id}/stream", service.resumeRun)
		group.POST("/runs/{id}/approvals/{approvalId}", service.respondApproval)
		group.POST("/runs/{id}/stop", service.stopRun)
		return event.Next()
	})

	app.OnRecordCreateRequest(conversationsCollection).BindFunc(func(event *core.RecordRequestEvent) error {
		if event.Auth != nil {
			event.Record.Set("owner", event.Auth.Id)
		}
		event.Record.Set("status", "active")
		if strings.TrimSpace(event.Record.GetString("title")) == "" {
			event.Record.Set("title", "New conversation")
		}
		// Conversation lists sort by "-pinned,-last_message_at,-updated", where
		// an empty last_message_at sorts below every dated conversation. Seeding
		// it at creation keeps a brand-new conversation at the top of the list
		// until its first message updates the value.
		event.Record.Set("last_message_at", types.NowDateTime())
		return event.Next()
	})

	app.OnRecordUpdateRequest(conversationsCollection).BindFunc(func(event *core.RecordRequestEvent) error {
		if event.Record.GetBool("pinned") && !event.Record.Original().GetBool("pinned") {
			owner := event.Record.GetString("owner")
			if owner == "" && event.Auth != nil {
				owner = event.Auth.Id
			}
			count, err := event.App.CountRecords(conversationsCollection, dbx.HashExp{
				"owner":  owner,
				"pinned": true,
			})
			if err != nil {
				return event.BadRequestError("Could not verify pinned conversation limit.", err)
			}
			if count >= maxPinnedConversations {
				return event.BadRequestError("You can pin at most "+strconv.Itoa(maxPinnedConversations)+" conversations.", nil)
			}
		}
		return event.Next()
	})

	app.OnRecordUpdate(conversationsCollection).BindFunc(func(event *core.RecordEvent) error {
		if err := keepConversationActivity(event.App, event.Record); err != nil {
			return err
		}
		return event.Next()
	})

	app.OnTerminate().BindFunc(func(event *core.TerminateEvent) error {
		service.cancelAll()
		return event.Next()
	})
}

// Fields a chat run owns: only the run that produced them writes them.
var conversationActivityFields = []string{
	"last_message_at",
	"message_count",
	"model_config",
	"tool_call_count",
	"input_tokens",
	"output_tokens",
	"total_tokens",
	"context_tokens",
	"context_summary",
	"summary_until_sequence",
}

// keepConversationActivity stops a save from carrying an activity field back to
// the value it held when its record was loaded. PocketBase writes the whole
// record, so a title, pin, or archive request that loaded the conversation
// before a run persisted an exchange would otherwise revert that exchange's
// message count, activity date, and model — which is how a conversation that
// had just been used ended up undated, and last in the list.
//
// A save that means to change one of these fields still changes it: only a
// field the save left at its own stale value is restored, and the read happens
// inside the save transaction, so it sees whatever a competing run committed.
func keepConversationActivity(app core.App, record *core.Record) error {
	original := record.Original()
	if original == nil {
		return nil
	}
	var stored *core.Record
	for _, field := range conversationActivityFields {
		if record.GetString(field) != original.GetString(field) {
			continue
		}
		if stored == nil {
			found, err := app.FindRecordById(conversationsCollection, record.Id)
			if err != nil {
				return err
			}
			stored = found
		}
		record.Set(field, stored.Get(field))
	}
	return nil
}
