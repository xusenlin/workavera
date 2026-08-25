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
		event.Router.POST("/api/board/projects/{id}/archive", archiveBoardProjectRequest).
			Bind(apis.RequireAuth("users"))
		event.Router.POST("/api/board/projects/{id}/unarchive", unarchiveBoardProjectRequest).
			Bind(apis.RequireAuth("users"))
		event.Router.PATCH("/api/board/projects/{id}/owner", transferBoardProjectOwnerRequest).
			Bind(apis.RequireAuth("users"))
		event.Router.GET("/api/board/projects/{id}/share", getBoardProjectShareRequest).
			Bind(apis.RequireAuth("users"))
		event.Router.POST("/api/board/projects/{id}/share", publishBoardProjectRequest).
			Bind(apis.RequireAuth("users"))
		event.Router.DELETE("/api/board/projects/{id}/share", unpublishBoardProjectRequest).
			Bind(apis.RequireAuth("users"))

		// The only routes an anonymous visitor can reach.
		event.Router.GET("/api/public/board/{slug}", publicBoardRequest)
		event.Router.GET("/api/public/board/{slug}/avatars/{index}", publicBoardAvatarRequest)
		return event.Next()
	})

	app.OnRecordUpdateRequest(boardProjectsCollection).BindFunc(logBoardProjectUpdate)
	app.OnRecordAfterCreateSuccess(boardProjectsCollection).BindFunc(maintainBoardProjectPreferenceAfterProjectCreate)

	app.OnRecordCreateRequest(boardProjectMembersCollection).BindFunc(validateBoardProjectMemberRequest)
	app.OnRecordUpdateRequest(boardProjectMembersCollection).BindFunc(validateBoardProjectMemberRequest)
	app.OnRecordCreateRequest(boardProjectMembersCollection).BindFunc(logBoardProjectMemberCreate)
	app.OnRecordUpdateRequest(boardProjectMembersCollection).BindFunc(logBoardProjectMemberUpdate)
	app.OnRecordDeleteRequest(boardProjectMembersCollection).BindFunc(logBoardProjectMemberDelete)
	app.OnRecordAfterCreateSuccess(boardProjectMembersCollection).BindFunc(maintainBoardProjectPreferenceAfterMemberCreate)
	app.OnRecordAfterDeleteSuccess(boardProjectMembersCollection).BindFunc(maintainBoardProjectPreferenceAfterMemberDelete)

	app.OnRecordCreateRequest(boardProjectStatesCollection).BindFunc(logBoardProjectStateCreate)
	app.OnRecordUpdateRequest(boardProjectStatesCollection).BindFunc(logBoardProjectStateUpdate)
	app.OnRecordDeleteRequest(boardProjectStatesCollection).BindFunc(preventDeletingUsedBoardState)
	app.OnRecordDeleteRequest(boardProjectStatesCollection).BindFunc(logBoardProjectStateDelete)

	app.OnRecordCreateRequest(boardProjectLabelsCollection).BindFunc(logBoardProjectLabelCreate)
	app.OnRecordUpdateRequest(boardProjectLabelsCollection).BindFunc(logBoardProjectLabelUpdate)
	app.OnRecordDeleteRequest(boardProjectLabelsCollection).BindFunc(logBoardProjectLabelDelete)

	app.OnRecordCreateRequest(boardTasksCollection).BindFunc(validateBoardTaskRequest)
	app.OnRecordUpdateRequest(boardTasksCollection).BindFunc(validateBoardTaskRequest)
	app.OnRecordDeleteRequest(boardTasksCollection).BindFunc(logBoardTaskDelete)
}
