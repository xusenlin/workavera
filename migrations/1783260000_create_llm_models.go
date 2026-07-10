package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const llmModelsCollection = "llm_models"

func init() {
	m.Register(createLLMModelsCollection, dropLLMModelsCollection)
}

func createLLMModelsCollection(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	models := core.NewBaseCollection(llmModelsCollection)
	models.Fields.Add(
		&core.RelationField{
			Name:          "owner",
			CollectionId:  users.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: true,
		},
		&core.TextField{Name: "name", Required: true, Max: 120, Presentable: true},
		&core.TextField{Name: "model_id", Required: true, Max: 255},
		&core.TextField{Name: "base_url", Required: true, Max: 2048},
		&core.TextField{Name: "api_key", Max: 4096, Hidden: true},
		&core.SelectField{
			Name:      "protocol",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"openai", "openai-compatible", "anthropic", "google"},
		},
		&core.NumberField{Name: "max_output_tokens", OnlyInt: true},
		&core.BoolField{Name: "is_default"},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	models.AddIndex("idx_llm_models_owner_created", false, "owner, created", "")

	// Model credentials are only accessible through the authenticated custom API.
	models.ListRule = nil
	models.ViewRule = nil
	models.CreateRule = nil
	models.UpdateRule = nil
	models.DeleteRule = nil

	return app.Save(models)
}

func dropLLMModelsCollection(app core.App) error {
	models, err := app.FindCollectionByNameOrId(llmModelsCollection)
	if err != nil {
		return err
	}
	return app.Delete(models)
}
