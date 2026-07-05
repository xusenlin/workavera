package board

import (
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// Register attaches the Board routes and record hooks to the application.
func Register(app *pocketbase.PocketBase) {
	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		event.Router.POST("/api/board/projects", createBoardProject).
			Bind(apis.RequireAuth("users"))
		return event.Next()
	})

	app.OnRecordCreateRequest(boardTasksCollection).BindFunc(validateBoardTaskRequest)
	app.OnRecordUpdateRequest(boardTasksCollection).BindFunc(validateBoardTaskRequest)
	app.OnRecordDeleteRequest(boardTasksCollection).BindFunc(logBoardTaskDelete)
	app.OnRecordDeleteRequest(boardProjectStatesCollection).BindFunc(preventDeletingUsedBoardState)
}
