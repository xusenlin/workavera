package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(addContextTracking, dropContextTracking)
}

// addContextTracking introduces context-window awareness:
//   - llm_models.max_context_tokens: the model's context window size, filled
//     by the user. Existing models are backfilled to 256k so every model has
//     a usable limit once the fixed history window is removed.
//   - chat_conversations.context_summary / summary_until_sequence: the active
//     compaction summary and the last message sequence it covers. Messages
//     themselves are never modified.
//   - chat_conversations.context_tokens: snapshot of the latest run's
//     input+output tokens, i.e. the current context size shown in the UI and
//     compared against the 75% compaction threshold.
func addContextTracking(app core.App) error {
	models, err := app.FindCollectionByNameOrId(llmModelsCollection)
	if err != nil {
		return err
	}
	models.Fields.Add(&core.NumberField{Name: "max_context_tokens", OnlyInt: true})
	if err := app.Save(models); err != nil {
		return err
	}
	if _, err := app.DB().NewQuery("UPDATE {{llm_models}} SET max_context_tokens = 256000").Execute(); err != nil {
		return err
	}

	conversations, err := app.FindCollectionByNameOrId(chatConversationsCollection)
	if err != nil {
		return err
	}
	conversations.Fields.Add(
		&core.TextField{Name: "context_summary", Max: 100000},
		&core.NumberField{Name: "summary_until_sequence", OnlyInt: true},
		&core.NumberField{Name: "context_tokens", OnlyInt: true},
	)
	return app.Save(conversations)
}

func dropContextTracking(app core.App) error {
	models, err := app.FindCollectionByNameOrId(llmModelsCollection)
	if err != nil {
		return err
	}
	models.Fields.RemoveByName("max_context_tokens")
	if err := app.Save(models); err != nil {
		return err
	}

	conversations, err := app.FindCollectionByNameOrId(chatConversationsCollection)
	if err != nil {
		return err
	}
	conversations.Fields.RemoveByName("context_summary")
	conversations.Fields.RemoveByName("summary_until_sequence")
	conversations.Fields.RemoveByName("context_tokens")
	return app.Save(conversations)
}
