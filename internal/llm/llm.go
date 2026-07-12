package llm

import (
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const modelsCollection = "llm_models"

// Register attaches the authenticated LLM configuration management routes.
func Register(app core.App) {
	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		group := event.Router.Group("/api/llm").Bind(apis.RequireAuth("users"))
		group.GET("/models", listModels)
		group.POST("/models", createModel)
		group.PATCH("/models/{id}", updateModel)
		group.DELETE("/models/{id}", deleteModel)
		group.POST("/models/{id}/default", setDefaultModel)
		group.GET("/share-targets", listShareTargets)
		group.POST("/models/{id}/share", shareModel)
		group.POST("/shares/{id}/respond", respondToShare)
		return event.Next()
	})
}
