package board

import (
	"errors"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	boardProjectPreferencesCollection = "board_project_preferences"
	projectPreferenceStep             = 1024
	projectPreferenceBase             = 1024 * 1024 * 1024
)

func ensureBoardProjectPreference(app core.App, userID, projectID string) error {
	if userID == "" || projectID == "" {
		return errors.New("project order requires a user and project")
	}
	existing, err := app.FindRecordsByFilter(
		boardProjectPreferencesCollection,
		"user = {:user} && project = {:project}",
		"",
		1,
		0,
		dbx.Params{"user": userID, "project": projectID},
	)
	if err != nil {
		return err
	}
	if len(existing) > 0 {
		return nil
	}

	first, err := app.FindRecordsByFilter(
		boardProjectPreferencesCollection,
		"user = {:user}",
		"sort_order",
		1,
		0,
		dbx.Params{"user": userID},
	)
	if err != nil {
		return err
	}
	sortOrder := float64(projectPreferenceBase + projectPreferenceStep)
	if len(first) > 0 {
		sortOrder = first[0].GetFloat("sort_order") - projectPreferenceStep
		if sortOrder == 0 {
			sortOrder = -projectPreferenceStep
		}
	}
	collection, err := app.FindCollectionByNameOrId(boardProjectPreferencesCollection)
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("project", projectID)
	record.Set("sort_order", sortOrder)
	if err := app.Save(record); err != nil {
		// The unique user/project index makes concurrent repair attempts safe.
		if found, findErr := app.FindRecordsByFilter(
			boardProjectPreferencesCollection,
			"user = {:user} && project = {:project}",
			"",
			1,
			0,
			dbx.Params{"user": userID, "project": projectID},
		); findErr == nil && len(found) > 0 {
			return nil
		}
		return err
	}
	return nil
}

func removeBoardProjectPreferenceIfInvisible(app core.App, userID, projectID string) error {
	project, err := app.FindRecordById(boardProjectsCollection, projectID)
	if err != nil {
		// Project deletion cascades to its order records.
		return nil
	}
	if project.GetString("owner") == userID {
		return nil
	}
	memberships, err := app.FindRecordsByFilter(
		boardProjectMembersCollection,
		"project = {:project} && user = {:user}",
		"",
		1,
		0,
		dbx.Params{"project": projectID, "user": userID},
	)
	if err != nil || len(memberships) > 0 {
		return err
	}
	orders, err := app.FindRecordsByFilter(
		boardProjectPreferencesCollection,
		"user = {:user} && project = {:project}",
		"",
		0,
		0,
		dbx.Params{"user": userID, "project": projectID},
	)
	if err != nil {
		return err
	}
	for _, order := range orders {
		if err := app.Delete(order); err != nil {
			return err
		}
	}
	return nil
}

func maintainBoardProjectPreferenceAfterProjectCreate(event *core.RecordEvent) error {
	if err := ensureBoardProjectPreference(event.App, event.Record.GetString("owner"), event.Record.Id); err != nil {
		event.App.Logger().Error("failed to create project preference", "projectId", event.Record.Id, "error", err)
	}
	return event.Next()
}

func maintainBoardProjectPreferenceAfterMemberCreate(event *core.RecordEvent) error {
	if err := ensureBoardProjectPreference(event.App, event.Record.GetString("user"), event.Record.GetString("project")); err != nil {
		event.App.Logger().Error("failed to create member project preference", "membershipId", event.Record.Id, "error", err)
	}
	return event.Next()
}

func maintainBoardProjectPreferenceAfterMemberDelete(event *core.RecordEvent) error {
	if err := removeBoardProjectPreferenceIfInvisible(event.App, event.Record.GetString("user"), event.Record.GetString("project")); err != nil {
		event.App.Logger().Error("failed to remove member project preference", "membershipId", event.Record.Id, "error", err)
	}
	return event.Next()
}
