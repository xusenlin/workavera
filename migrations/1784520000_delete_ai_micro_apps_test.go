package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/tests"
)

func TestDeleteAIMicroAppsMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	if _, err := app.FindCollectionByNameOrId(aiMicroAppsCollection); err == nil {
		t.Fatal("ai_micro_apps collection must be deleted after all migrations run")
	}
}
