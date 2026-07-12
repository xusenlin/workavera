package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const configsCollection = "configs"

func init() {
	m.Register(createConfigsCollection, dropConfigsCollection)
}

func createConfigsCollection(app core.App) error {
	configs := core.NewBaseCollection(configsCollection)
	configs.Fields.Add(
		&core.TextField{Name: "key", Required: true, Max: 255, Presentable: true},
		&core.JSONField{Name: "value", MaxSize: 1024 * 1024},
		&core.TextField{Name: "description", Max: 2000},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	configs.AddIndex("idx_configs_key", true, "key", "")
	if err := app.Save(configs); err != nil {
		return err
	}

	defaults := []struct {
		key, value, description string
	}{
		{"system.timezone", "Asia/Shanghai", "IANA timezone used by system-wide scheduling and notifications."},
		{"system.theme", "system", "Application theme: system, light, or dark."},
	}
	for _, item := range defaults {
		record := core.NewRecord(configs)
		record.Set("key", item.key)
		record.Set("value", item.value)
		record.Set("description", item.description)
		if err := app.Save(record); err != nil {
			return err
		}
	}
	return nil
}

func dropConfigsCollection(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(configsCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}
