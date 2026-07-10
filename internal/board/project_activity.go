package board

import "github.com/pocketbase/pocketbase/core"

func logBoardProjectUpdate(event *core.RecordRequestEvent) error {
	before := event.Record.Original()
	if err := event.Next(); err != nil {
		return err
	}

	changes := map[string]any{}
	addTextChange(changes, "name", before.GetString("name"), event.Record.GetString("name"))
	if before.GetString("description") != event.Record.GetString("description") {
		changes["description"] = map[string]any{"changed": true}
	}
	if len(changes) == 0 {
		return nil
	}
	return saveBoardProjectOperationLog(event.App, event.Auth, event.Record.Id, "update_project", changes)
}

func logBoardProjectStateCreate(event *core.RecordRequestEvent) error {
	if err := event.Next(); err != nil {
		return err
	}
	return saveBoardProjectOperationLog(
		event.App,
		event.Auth,
		event.Record.GetString("project"),
		"create_state",
		map[string]any{"state": boardProjectStateSnapshot(event.Record)},
	)
}

func logBoardProjectStateUpdate(event *core.RecordRequestEvent) error {
	before := event.Record.Original()
	if err := event.Next(); err != nil {
		return err
	}
	changes := map[string]any{"state": boardProjectStateSnapshot(event.Record)}
	addTextChange(changes, "name", before.GetString("name"), event.Record.GetString("name"))
	addTextChange(changes, "color", before.GetString("color"), event.Record.GetString("color"))
	addTextChange(changes, "category", before.GetString("category"), event.Record.GetString("category"))
	if before.GetFloat("sort_order") != event.Record.GetFloat("sort_order") {
		changes["sort_order"] = map[string]any{
			"from": before.GetFloat("sort_order"),
			"to":   event.Record.GetFloat("sort_order"),
		}
	}
	if len(changes) == 1 {
		return nil
	}
	return saveBoardProjectOperationLog(
		event.App,
		event.Auth,
		event.Record.GetString("project"),
		"update_state",
		changes,
	)
}

func logBoardProjectStateDelete(event *core.RecordRequestEvent) error {
	record := event.Record.Fresh()
	if err := event.Next(); err != nil {
		return err
	}
	return saveBoardProjectOperationLog(
		event.App,
		event.Auth,
		record.GetString("project"),
		"delete_state",
		map[string]any{"state": boardProjectStateSnapshot(record)},
	)
}

func logBoardProjectLabelCreate(event *core.RecordRequestEvent) error {
	if err := event.Next(); err != nil {
		return err
	}
	return saveBoardProjectOperationLog(
		event.App,
		event.Auth,
		event.Record.GetString("project"),
		"create_label",
		map[string]any{"label": boardProjectLabelSnapshot(event.Record)},
	)
}

func logBoardProjectLabelUpdate(event *core.RecordRequestEvent) error {
	before := event.Record.Original()
	if err := event.Next(); err != nil {
		return err
	}
	changes := map[string]any{"label": boardProjectLabelSnapshot(event.Record)}
	addTextChange(changes, "name", before.GetString("name"), event.Record.GetString("name"))
	addTextChange(changes, "color", before.GetString("color"), event.Record.GetString("color"))
	if len(changes) == 1 {
		return nil
	}
	return saveBoardProjectOperationLog(
		event.App,
		event.Auth,
		event.Record.GetString("project"),
		"update_label",
		changes,
	)
}

func logBoardProjectLabelDelete(event *core.RecordRequestEvent) error {
	record := event.Record.Fresh()
	if err := event.Next(); err != nil {
		return err
	}
	return saveBoardProjectOperationLog(
		event.App,
		event.Auth,
		record.GetString("project"),
		"delete_label",
		map[string]any{"label": boardProjectLabelSnapshot(record)},
	)
}

func logBoardProjectMemberCreate(event *core.RecordRequestEvent) error {
	if err := event.Next(); err != nil {
		return err
	}
	return saveBoardProjectOperationLog(
		event.App,
		event.Auth,
		event.Record.GetString("project"),
		"add_member",
		map[string]any{"member": boardProjectMemberSnapshot(event.App, event.Record)},
	)
}

func logBoardProjectMemberUpdate(event *core.RecordRequestEvent) error {
	before := event.Record.Original()
	if err := event.Next(); err != nil {
		return err
	}
	if before.GetString("role") == event.Record.GetString("role") {
		return nil
	}
	return saveBoardProjectOperationLog(
		event.App,
		event.Auth,
		event.Record.GetString("project"),
		"update_member",
		map[string]any{
			"member": boardProjectMemberSnapshot(event.App, event.Record),
			"role": map[string]any{
				"from": before.GetString("role"),
				"to":   event.Record.GetString("role"),
			},
		},
	)
}

func logBoardProjectMemberDelete(event *core.RecordRequestEvent) error {
	record := event.Record.Fresh()
	member := boardProjectMemberSnapshot(event.App, record)
	if err := event.Next(); err != nil {
		return err
	}
	return saveBoardProjectOperationLog(
		event.App,
		event.Auth,
		record.GetString("project"),
		"remove_member",
		map[string]any{"member": member},
	)
}

func saveBoardProjectOperationLog(
	app core.App,
	actor *core.Record,
	projectID string,
	action string,
	changes map[string]any,
) error {
	collection, err := app.FindCollectionByNameOrId(boardProjectOperationLogs)
	if err != nil {
		return err
	}
	actorID, actorName := boardActorSnapshot(actor)

	log := core.NewRecord(collection)
	log.Set("project", projectID)
	log.Set("actor", actorID)
	log.Set("actor_name", actorName)
	log.Set("action", action)
	log.Set("changes", changes)
	return app.Save(log)
}

func boardActorSnapshot(actor *core.Record) (string, string) {
	if actor == nil {
		return "", "System"
	}
	name := actor.GetString("name")
	if name == "" {
		name = actor.GetString("email")
	}
	if name == "" {
		name = "System"
	}
	if actor.Collection().Name != "users" {
		return "", name
	}
	return actor.Id, name
}

func boardProjectStateSnapshot(record *core.Record) map[string]any {
	return map[string]any{
		"id":       record.Id,
		"name":     record.GetString("name"),
		"color":    record.GetString("color"),
		"category": record.GetString("category"),
	}
}

func boardProjectLabelSnapshot(record *core.Record) map[string]any {
	return map[string]any{
		"id":    record.Id,
		"name":  record.GetString("name"),
		"color": record.GetString("color"),
	}
}

func boardProjectMemberSnapshot(app core.App, record *core.Record) map[string]any {
	userID := record.GetString("user")
	return map[string]any{
		"id":     userID,
		"name":   boardRecordName(app, "users", userID),
		"role":   record.GetString("role"),
		"record": record.Id,
	}
}
