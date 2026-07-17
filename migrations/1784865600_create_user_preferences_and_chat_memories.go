package migrations

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	userPreferencesCollection = "user_preferences"
	chatMemoriesCollection    = "chat_memories"
)

func init() {
	m.Register(createUserPreferencesAndChatMemories, dropUserPreferencesAndChatMemories)
}

func createUserPreferencesAndChatMemories(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}
	conversations, err := app.FindCollectionByNameOrId(chatConversationsCollection)
	if err != nil {
		return err
	}
	messages, err := app.FindCollectionByNameOrId(chatMessagesCollection)
	if err != nil {
		return err
	}

	preferences := core.NewBaseCollection(userPreferencesCollection)
	preferenceRead := `@request.auth.id != "" && owner = @request.auth.id`
	preferences.ListRule = types.Pointer(preferenceRead)
	preferences.ViewRule = preferences.ListRule
	preferences.CreateRule = nil
	preferences.UpdateRule = types.Pointer(preferenceRead + ` && @request.body.owner:changed = false`)
	preferences.DeleteRule = nil
	preferences.Fields.Add(
		&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.SelectField{Name: "theme", Required: true, MaxSelect: 1, Values: []string{"system", "light", "dark"}},
		&core.BoolField{Name: "memory_enabled"},
		&core.BoolField{Name: "memory_auto_capture"},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	preferences.AddIndex("idx_user_preferences_owner", true, "owner", "")
	if err := app.Save(preferences); err != nil {
		return err
	}

	userRecords, err := app.FindRecordsByFilter(usersCollectionName, "", "id", 0, 0)
	if err != nil {
		return err
	}
	for _, user := range userRecords {
		theme := user.GetString("theme")
		if theme == "" {
			theme = "system"
		}
		record := core.NewRecord(preferences)
		record.Set("owner", user.Id)
		record.Set("theme", theme)
		record.Set("memory_enabled", false)
		record.Set("memory_auto_capture", false)
		if err := app.Save(record); err != nil {
			return err
		}
	}
	users.Fields.RemoveByName("theme")
	if err := app.Save(users); err != nil {
		return err
	}

	memories := core.NewBaseCollection(chatMemoriesCollection)
	memoryRead := `@request.auth.id != "" && owner = @request.auth.id`
	memories.ListRule = types.Pointer(memoryRead)
	memories.ViewRule = memories.ListRule
	memories.CreateRule = types.Pointer(`@request.auth.id != ""`)
	memories.UpdateRule = types.Pointer(memoryRead + ` && @request.body.owner:changed = false && @request.body.origin:changed = false && @request.body.source_conversation:changed = false && @request.body.source_message:changed = false`)
	memories.DeleteRule = types.Pointer(memoryRead)
	memories.Fields.Add(
		&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.SelectField{Name: "category", Required: true, MaxSelect: 1, Values: []string{"preference", "personal", "work", "goal", "constraint"}},
		&core.TextField{Name: "content", Required: true, Max: 500, Presentable: true},
		&core.BoolField{Name: "active"},
		&core.SelectField{Name: "origin", Required: true, MaxSelect: 1, Values: []string{"manual", "explicit", "automatic"}},
		&core.RelationField{Name: "source_conversation", CollectionId: conversations.Id, MaxSelect: 1},
		&core.RelationField{Name: "source_message", CollectionId: messages.Id, MaxSelect: 1},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	memories.AddIndex("idx_chat_memories_owner_active_updated", false, "owner, active, updated", "")
	return app.Save(memories)
}

func dropUserPreferencesAndChatMemories(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}
	users.Fields.Add(&core.SelectField{
		Name:      "theme",
		MaxSelect: 1,
		Values:    []string{"system", "light", "dark"},
	})
	if err := app.Save(users); err != nil {
		return err
	}

	if preferences, err := app.FindCollectionByNameOrId(userPreferencesCollection); err == nil {
		records, err := app.FindRecordsByFilter(userPreferencesCollection, "", "", 0, 0)
		if err != nil {
			return err
		}
		for _, preference := range records {
			theme := preference.GetString("theme")
			if theme == "" {
				theme = "system"
			}
			if _, err := app.DB().NewQuery("UPDATE {{users}} SET theme = {:theme} WHERE id = {:id}").Bind(dbx.Params{
				"theme": theme,
				"id":    preference.GetString("owner"),
			}).Execute(); err != nil {
				return err
			}
		}
		if memories, err := app.FindCollectionByNameOrId(chatMemoriesCollection); err == nil {
			if err := app.Delete(memories); err != nil {
				return err
			}
		}
		return app.Delete(preferences)
	}
	return nil
}
