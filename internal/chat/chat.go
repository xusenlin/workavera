package chat

import (
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	workagent "github.com/xusenlin/workavera/internal/agent"
	assistanttools "github.com/xusenlin/workavera/internal/assistant/tools"
)

func Register(app core.App) {
	toolFactory := assistanttools.NewFactory(app)
	service := newService(app, workagent.NewFantasyRunner(toolFactory.ForActor))
	register(app, service)
}

func register(app core.App, service *service) {
	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		group := event.Router.Group("/api/chat").Bind(apis.RequireAuth("users"))
		group.GET("/conversations", service.listConversations)
		group.POST("/conversations", service.createConversation)
		group.PATCH("/conversations/{id}", service.updateConversation)
		group.DELETE("/conversations/{id}", service.deleteConversation)
		group.GET("/conversations/{id}/messages", service.listMessages)
		group.POST("/stream", service.stream)
		group.POST("/runs/{id}/stop", service.stopRun)
		return event.Next()
	})

	app.OnTerminate().BindFunc(func(event *core.TerminateEvent) error {
		service.cancelAll()
		return event.Next()
	})
}
