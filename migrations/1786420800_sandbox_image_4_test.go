package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"
)

func TestSandboxImage4Migration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	record, err := app.FindFirstRecordByFilter(configsCollection, `key = "sandbox.image"`)
	if err != nil || record.GetString("value") != sandboxImage4 {
		t.Fatalf("the default image must move to :4, got %q %v", record.GetString("value"), err)
	}

	custom := `"registry.example.com/sandbox:3"`
	record.Set("value", types.JSONRaw(custom))
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	if err := moveSandboxImage(app, sandboxImage3, sandboxImage4); err != nil {
		t.Fatal(err)
	}
	record, _ = app.FindFirstRecordByFilter(configsCollection, `key = "sandbox.image"`)
	if record.GetString("value") != custom {
		t.Fatalf("an administrator's own image must stay, got %q", record.GetString("value"))
	}
}
