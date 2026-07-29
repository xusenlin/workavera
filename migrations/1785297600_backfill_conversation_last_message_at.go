package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	// The backfill has no meaningful down: once applied, the conversations it
	// touched are indistinguishable from conversations that always carried a
	// last_message_at.
	m.Register(backfillConversationLastMessageAt, nil)
}

// backfillConversationLastMessageAt dates conversations that never received a
// message. Conversation lists sort by "-pinned,-last_message_at,-updated", and
// an empty last_message_at sorts below every dated conversation, so these
// conversations appeared at the end of the list instead of at the top.
func backfillConversationLastMessageAt(app core.App) error {
	_, err := app.DB().NewQuery(
		"UPDATE {{" + chatConversationsCollection + "}} SET last_message_at = created " +
			"WHERE last_message_at = '' OR last_message_at IS NULL",
	).Execute()
	return err
}
