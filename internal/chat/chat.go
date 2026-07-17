package chat

import (
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	workagent "github.com/xusenlin/workavera/internal/agent"
	assistanttools "github.com/xusenlin/workavera/internal/assistant/tools"
)

const maxPinnedConversations = 6

func Register(app core.App) {
	toolFactory := assistanttools.NewFactory(app)
	service := newService(app, workagent.NewFantasyRunner(toolFactory.ForActor))
	register(app, service)
}

func register(app core.App, service *service) {
	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		if err := recoverInterruptedRuns(event.App); err != nil {
			return err
		}
		group := event.Router.Group("/api/chat").Bind(apis.RequireAuth("users"))
		group.GET("/conversations/{id}/messages", service.listMessages)
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

	app.OnTerminate().BindFunc(func(event *core.TerminateEvent) error {
		service.cancelAll()
		return event.Next()
	})
}
