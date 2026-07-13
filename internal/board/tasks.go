package board

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func validateBoardTaskRequest(event *core.RecordRequestEvent) error {
	var before *core.Record
	if !event.Record.IsNew() {
		before = event.Record.Original()
	}

	projectID := event.Record.GetString("project")
	stateID := event.Record.GetString("state")
	if projectID == "" || stateID == "" {
		return event.BadRequestError("Project and state are required.", nil)
	}
	project, err := event.App.FindRecordById(boardProjectsCollection, projectID)
	if err != nil {
		return event.BadRequestError("Project not found.", err)
	}

	if event.Record.IsNew() && event.Auth != nil {
		event.Record.Set("created_by", event.Auth.Id)
	}
	if err := validateTaskRelations(
		event.App,
		project,
		stateID,
		event.Record.GetStringSlice("labels"),
		event.Record.GetStringSlice("assignees"),
		event.Record.GetStringSlice("documents"),
	); err != nil {
		return event.BadRequestError(err.Error(), err)
	}

	if event.Auth != nil {
		if _, err := requireTaskWriter(event.App, event.Auth.Id, projectID); err != nil {
			return event.ForbiddenError("You cannot edit tasks in this project.", err)
		}
	}

	if err := event.Next(); err != nil {
		return err
	}

	action := "create"
	changes := map[string]any{}
	if before != nil {
		changes = buildBoardTaskChanges(event.App, before, event.Record)
		if len(changes) == 0 {
			return nil
		}
		action = "update"
		if _, moved := changes["state"]; moved {
			action = "move"
		}
	}

	return saveBoardTaskOperationLog(event.App, event.Auth, event.Record, action, changes)
}

func preventDeletingUsedBoardState(event *core.RecordRequestEvent) error {
	tasks, err := event.App.FindRecordsByFilter(
		boardTasksCollection,
		"state = {:state}",
		"",
		1,
		0,
		dbx.Params{"state": event.Record.Id},
	)
	if err != nil {
		return event.BadRequestError("Could not check state usage.", err)
	}
	if len(tasks) > 0 {
		return event.BadRequestError("Move or delete the tasks in this state before deleting it.", nil)
	}
	return event.Next()
}
