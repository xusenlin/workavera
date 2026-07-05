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

	state, err := event.App.FindRecordById(boardProjectStatesCollection, stateID)
	if err != nil || state.GetString("project") != projectID {
		return event.BadRequestError("The selected state does not belong to this project.", err)
	}

	if event.Record.IsNew() && event.Auth != nil {
		event.Record.Set("created_by", event.Auth.Id)
	}

	for _, labelID := range event.Record.GetStringSlice("labels") {
		label, err := event.App.FindRecordById(boardProjectLabelsCollection, labelID)
		if err != nil || label.GetString("project") != projectID {
			return event.BadRequestError("A selected label does not belong to this project.", err)
		}
	}
	for _, userID := range event.Record.GetStringSlice("assignees") {
		_, err := event.App.FindFirstRecordByFilter(
			boardProjectMembersCollection,
			"project = {:project} && user = {:user}",
			dbx.Params{"project": projectID, "user": userID},
		)
		if err != nil {
			return event.BadRequestError("Every assignee must be a project member.", err)
		}
	}

	if event.Auth != nil {
		project, err := event.App.FindRecordById(boardProjectsCollection, projectID)
		if err != nil {
			return event.BadRequestError("Project not found.", err)
		}
		if project.GetString("owner") != event.Auth.Id {
			member, err := event.App.FindFirstRecordByFilter(
				boardProjectMembersCollection,
				"project = {:project} && user = {:user}",
				dbx.Params{"project": projectID, "user": event.Auth.Id},
			)
			if err != nil || member.GetString("role") == "viewer" {
				return event.ForbiddenError("You cannot edit tasks in this project.", err)
			}
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
