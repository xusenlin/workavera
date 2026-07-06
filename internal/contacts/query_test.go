package contacts

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	_ "github.com/xusenlin/workavera/migrations"
)

func TestSearchReturnsAllAndExcludesPhoneNumbers(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}

	var actorID string
	for index := range 25 {
		record := core.NewRecord(users)
		record.SetEmail(fmt.Sprintf("person-%02d@example.com", index))
		record.SetPassword("password123")
		record.Set("name", fmt.Sprintf("Person %02d", index))
		record.Set("title", "Engineer")
		record.Set("phone", fmt.Sprintf("secret-%02d", index))
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
		if index == 0 {
			actorID = record.Id
		}
	}

	result, err := Search(context.Background(), app, actorID, SearchOptions{Query: "Engineer"})
	if err != nil {
		t.Fatal(err)
	}
	if len(result) != 25 {
		t.Fatalf("expected all 25 results, got %d", len(result))
	}
	raw, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "secret-") || strings.Contains(string(raw), "phone") {
		t.Fatalf("contact tool projection leaked phone data: %s", raw)
	}
}

func TestSearchRejectsUnknownActor(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	if _, err := Search(context.Background(), app, "missing-user", SearchOptions{}); err == nil {
		t.Fatal("expected an unknown actor to be rejected")
	}
}
