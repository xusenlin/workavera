package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/tests"
)

func TestDocPinsMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	pins, err := app.FindCollectionByNameOrId(docPinsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if pins.ListRule != nil || pins.CreateRule != nil || pins.UpdateRule != nil || pins.DeleteRule != nil {
		t.Fatal("doc pins must only be accessed through server endpoints")
	}
}
