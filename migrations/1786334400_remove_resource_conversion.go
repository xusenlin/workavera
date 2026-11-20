package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(removeResourceConversion, restoreResourceConversion)
}

// removeResourceConversion drops server-side Markdown conversion fields from
// user_resources. Resources now store only original files and metadata;
// document conversion and inspection happen on demand inside the sandbox.
func removeResourceConversion(app core.App) error {
	resources, err := app.FindCollectionByNameOrId(userResourcesCollection)
	if err != nil {
		return err
	}
	for _, field := range []string{"converted_markdown", "converted_size", "no_text_reason"} {
		resources.Fields.RemoveByName(field)
	}
	return app.Save(resources)
}

func restoreResourceConversion(app core.App) error {
	resources, err := app.FindCollectionByNameOrId(userResourcesCollection)
	if err != nil {
		return err
	}
	if resources.Fields.GetByName("converted_markdown") == nil {
		resources.Fields.Add(&core.TextField{Name: "converted_markdown", Max: userResourceMaxMarkdownSize})
	}
	if resources.Fields.GetByName("converted_size") == nil {
		resources.Fields.Add(&core.NumberField{Name: "converted_size", OnlyInt: true, Min: types.Pointer(0.0), Max: types.Pointer(float64(userResourceMaxMarkdownSize))})
	}
	if resources.Fields.GetByName("no_text_reason") == nil {
		resources.Fields.Add(&core.SelectField{
			Name:      "no_text_reason",
			MaxSelect: 1,
			Values:    []string{"binary", "needs_ocr", "encrypted", "empty", "too_complex"},
		})
	}
	return app.Save(resources)
}
