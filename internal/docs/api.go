package docs

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func Register(app core.App) {
	app.OnRecordCreateRequest(FoldersCollectionName).BindFunc(validateFolderRequest)
	app.OnRecordUpdateRequest(FoldersCollectionName).BindFunc(validateFolderRequest)
	app.OnRecordUpdateRequest(CollectionName).BindFunc(validateDocumentFolderRequest)
	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		router := event.Router
		router.POST("/api/docs", createRequest).Bind(apis.RequireAuth("users"))
		router.PUT("/api/docs/{id}", updateRequest).Bind(apis.RequireAuth("users"))
		router.POST("/api/docs/{id}/move-to-project", moveRequest).Bind(apis.RequireAuth("users"))
		router.POST("/api/docs/{id}/assets", uploadAssetRequest).Bind(apis.RequireAuth("users"))
		router.GET("/api/docs-pinned", pinnedRequest).Bind(apis.RequireAuth("users"))
		router.POST("/api/docs/{id}/pin", pinRequest).Bind(apis.RequireAuth("users"))
		router.POST("/api/docs/{id}/archive", archiveRequest).Bind(apis.RequireAuth("users"))
		router.POST("/api/docs/{id}/unarchive", unarchiveRequest).Bind(apis.RequireAuth("users"))
		router.DELETE("/api/docs/{id}", deleteRequest).Bind(apis.RequireAuth("users"))
		router.GET("/api/docs/{id}/versions", versionsRequest).Bind(apis.RequireAuth("users"))
		router.GET("/api/docs/{id}/versions/{revision}", versionRequest).Bind(apis.RequireAuth("users"))
		router.POST("/api/docs/{id}/restore/{revision}", restoreRequest).Bind(apis.RequireAuth("users"))
		return event.Next()
	})
}

func validateFolderRequest(event *core.RecordRequestEvent) error {
	name := strings.TrimSpace(event.Record.GetString("name"))
	if name == "" {
		return event.BadRequestError("Folder name is required.", nil)
	}
	if event.Record.IsNew() && event.Auth != nil {
		event.Record.Set("owner", event.Auth.Id)
	}
	event.Record.Set("name", name)
	return event.Next()
}

func validateDocumentFolderRequest(event *core.RecordRequestEvent) error {
	if event.Auth == nil || event.Record.GetString("owner") != event.Auth.Id || event.Record.GetString("project") != "" {
		return event.ForbiddenError("Only private documents can be moved between personal folders.", nil)
	}
	folderID := event.Record.GetString("folder")
	if folderID == "" {
		return event.Next()
	}
	folder, err := event.App.FindRecordById(FoldersCollectionName, folderID)
	if err != nil || folder.GetString("owner") != event.Auth.Id {
		return event.ForbiddenError("Folder access denied.", err)
	}
	return event.Next()
}

func uploadAssetRequest(event *core.RequestEvent) error {
	files, err := event.FindUploadedFiles("file")
	if err != nil || len(files) != 1 {
		return event.BadRequestError("Exactly one file is required.", err)
	}
	asset, err := UploadAsset(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id"), files[0])
	if err != nil {
		return requestError(event, err)
	}
	return event.JSON(http.StatusCreated, asset)
}

func pinnedRequest(event *core.RequestEvent) error {
	documents, err := ListPinned(event.Request.Context(), event.App, event.Auth.Id, event.Request.URL.Query().Get("query"))
	if err != nil {
		return requestError(event, err)
	}
	return event.JSON(http.StatusOK, documents)
}

func pinRequest(event *core.RequestEvent) error {
	var input struct {
		Pinned bool `json:"pinned"`
	}
	if err := event.BindBody(&input); err != nil {
		return event.BadRequestError("Invalid pin data.", err)
	}
	if err := SetPinned(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id"), input.Pinned); err != nil {
		return requestError(event, err)
	}
	return event.JSON(http.StatusOK, map[string]bool{"pinned": input.Pinned})
}

func archiveRequest(event *core.RequestEvent) error {
	doc, err := SetArchived(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id"), true)
	if err != nil {
		return requestError(event, err)
	}
	return event.JSON(http.StatusOK, doc)
}

func unarchiveRequest(event *core.RequestEvent) error {
	doc, err := SetArchived(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id"), false)
	if err != nil {
		return requestError(event, err)
	}
	return event.JSON(http.StatusOK, doc)
}

func deleteRequest(event *core.RequestEvent) error {
	if err := Delete(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id")); err != nil {
		return requestError(event, err)
	}
	return event.NoContent(http.StatusNoContent)
}

func createRequest(event *core.RequestEvent) error {
	var input CreateInput
	if err := event.BindBody(&input); err != nil {
		return event.BadRequestError("Invalid document data.", err)
	}
	doc, err := Create(event.Request.Context(), event.App, event.Auth.Id, input)
	if err != nil {
		return requestError(event, err)
	}
	return event.JSON(http.StatusCreated, doc)
}

func updateRequest(event *core.RequestEvent) error {
	var input UpdateInput
	if err := event.BindBody(&input); err != nil {
		return event.BadRequestError("Invalid document data.", err)
	}
	doc, changed, err := Update(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id"), input)
	if err != nil {
		if errors.Is(err, ErrConflict) {
			latest, _ := Get(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id"))
			return event.JSON(http.StatusConflict, map[string]any{"message": err.Error(), "latest": latest})
		}
		return requestError(event, err)
	}
	return event.JSON(http.StatusOK, map[string]any{"document": doc, "changed": changed})
}

func moveRequest(event *core.RequestEvent) error {
	var input struct {
		ProjectID string `json:"projectId"`
	}
	if err := event.BindBody(&input); err != nil {
		return event.BadRequestError("Invalid project data.", err)
	}
	doc, err := MoveToProject(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id"), input.ProjectID)
	if err != nil {
		return requestError(event, err)
	}
	return event.JSON(http.StatusOK, doc)
}

func versionsRequest(event *core.RequestEvent) error {
	versions, err := ListVersions(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id"))
	if err != nil {
		return requestError(event, err)
	}
	return event.JSON(http.StatusOK, versions)
}

func versionRequest(event *core.RequestEvent) error {
	revision, err := strconv.Atoi(event.Request.PathValue("revision"))
	if err != nil {
		return event.BadRequestError("Invalid revision.", err)
	}
	version, err := GetVersion(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id"), revision)
	if err != nil {
		return requestError(event, err)
	}
	return event.JSON(http.StatusOK, version)
}

func restoreRequest(event *core.RequestEvent) error {
	var input struct {
		BaseRevision int `json:"baseRevision"`
	}
	if err := event.BindBody(&input); err != nil {
		return event.BadRequestError("Invalid restore data.", err)
	}
	revision, err := strconv.Atoi(event.Request.PathValue("revision"))
	if err != nil {
		return event.BadRequestError("Invalid revision.", err)
	}
	doc, err := Restore(event.Request.Context(), event.App, event.Auth.Id, event.Request.PathValue("id"), revision, input.BaseRevision)
	if err != nil {
		return requestError(event, err)
	}
	return event.JSON(http.StatusOK, doc)
}

func requestError(event *core.RequestEvent, err error) error {
	switch {
	case errors.Is(err, ErrNotFound):
		return event.NotFoundError("Document not found.", err)
	case errors.Is(err, ErrForbidden):
		return event.ForbiddenError("Document access denied.", err)
	case errors.Is(err, ErrInvalidInput):
		return event.BadRequestError("Invalid document data.", err)
	case errors.Is(err, ErrPinLimit):
		return event.BadRequestError(err.Error(), err)
	case errors.Is(err, ErrConflict):
		return event.Error(http.StatusConflict, err.Error(), err)
	default:
		return event.InternalServerError("Document operation failed.", err)
	}
}
