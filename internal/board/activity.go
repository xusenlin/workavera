package board

import (
	"reflect"
	"slices"

	"github.com/pocketbase/pocketbase/core"
)

func logBoardTaskDelete(event *core.RecordRequestEvent) error {
	task := event.Record.Fresh()
	if err := event.Next(); err != nil {
		return err
	}
	return saveBoardTaskOperationLog(event.App, event.Auth, task, "delete", map[string]any{})
}

func saveBoardTaskOperationLog(app core.App, actor, task *core.Record, action string, changes map[string]any) error {
	collection, err := app.FindCollectionByNameOrId(boardTaskOperationLogs)
	if err != nil {
		return err
	}

	actorName := "System"
	actorID := ""
	if actor != nil {
		actorName = actor.GetString("name")
		if actorName == "" {
			actorName = actor.GetString("email")
		}
		if actorName == "" {
			actorName = "System"
		}
		if actor.Collection().Name == "users" {
			actorID = actor.Id
		}
	}

	log := core.NewRecord(collection)
	log.Set("project", task.GetString("project"))
	log.Set("task_id", task.Id)
	log.Set("task_title", task.GetString("title"))
	log.Set("actor", actorID)
	log.Set("actor_name", actorName)
	log.Set("action", action)
	log.Set("changes", changes)
	return app.Save(log)
}

func buildBoardTaskChanges(app core.App, before, after *core.Record) map[string]any {
	changes := map[string]any{}
	addTextChange(changes, "title", before.GetString("title"), after.GetString("title"))
	addTextChange(changes, "priority", before.GetString("priority"), after.GetString("priority"))
	addTextChange(changes, "due_date", before.GetString("due_date"), after.GetString("due_date"))

	if before.GetString("description") != after.GetString("description") {
		changes["description"] = map[string]any{"changed": true}
	}

	beforeState := before.GetString("state")
	afterState := after.GetString("state")
	if beforeState != afterState {
		changes["state"] = map[string]any{
			"from": boardRecordName(app, boardProjectStatesCollection, beforeState),
			"to":   boardRecordName(app, boardProjectStatesCollection, afterState),
		}
	}

	beforeLabels := boardRecordNames(app, boardProjectLabelsCollection, before.GetStringSlice("labels"))
	afterLabels := boardRecordNames(app, boardProjectLabelsCollection, after.GetStringSlice("labels"))
	if !reflect.DeepEqual(beforeLabels, afterLabels) {
		changes["labels"] = map[string]any{"from": beforeLabels, "to": afterLabels}
	}

	beforeAssignees := boardRecordNames(app, "users", before.GetStringSlice("assignees"))
	afterAssignees := boardRecordNames(app, "users", after.GetStringSlice("assignees"))
	if !reflect.DeepEqual(beforeAssignees, afterAssignees) {
		changes["assignees"] = map[string]any{"from": beforeAssignees, "to": afterAssignees}
	}

	return changes
}

func addTextChange(changes map[string]any, field, before, after string) {
	if before != after {
		changes[field] = map[string]any{"from": before, "to": after}
	}
}

func boardRecordName(app core.App, collection, id string) string {
	if id == "" {
		return ""
	}
	record, err := app.FindRecordById(collection, id)
	if err != nil {
		return id
	}
	name := record.GetString("name")
	if name == "" {
		name = record.GetString("email")
	}
	return name
}

// boardAssigneeSummary resolves a user id into a TaskAssigneeSummary with the
// display name, avatar file name and collection id. The avatar fields let the
// frontend build the image URL without an extra request.
func boardAssigneeSummary(app core.App, userID string) TaskAssigneeSummary {
	if userID == "" {
		return TaskAssigneeSummary{}
	}
	record, err := app.FindRecordById("users", userID)
	if err != nil {
		return TaskAssigneeSummary{ID: userID, Name: userID}
	}
	name := record.GetString("name")
	if name == "" {
		name = record.GetString("email")
	}
	return TaskAssigneeSummary{
		ID:           record.Id,
		Name:         name,
		Avatar:       record.GetString("avatar"),
		CollectionID: record.Collection().Id,
	}
}

func boardRecordNames(app core.App, collection string, ids []string) []string {
	names := make([]string, 0, len(ids))
	for _, id := range ids {
		names = append(names, boardRecordName(app, collection, id))
	}
	slices.Sort(names)
	return names
}
