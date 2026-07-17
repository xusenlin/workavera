package migrations

import (
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestAPIKeysCollectionMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	keys, err := app.FindCollectionByNameOrId(apiKeysCollection)
	if err != nil {
		t.Fatal(err)
	}
	if keys.CreateRule != nil || keys.UpdateRule != nil {
		t.Fatal("api key creation must go through the server endpoint that hashes the secret")
	}
	ownerRule := "user = @request.auth.id"
	if keys.ListRule == nil || *keys.ListRule != ownerRule {
		t.Fatalf("unexpected api keys list rule: %v", keys.ListRule)
	}
	if keys.ViewRule == nil || *keys.ViewRule != ownerRule {
		t.Fatalf("unexpected api keys view rule: %v", keys.ViewRule)
	}
	if keys.DeleteRule == nil || *keys.DeleteRule != ownerRule {
		t.Fatalf("unexpected api keys delete rule: %v", keys.DeleteRule)
	}
	user, ok := keys.Fields.GetByName("user").(*core.RelationField)
	if !ok || !user.Required || !user.CascadeDelete || user.MaxSelect != 1 {
		t.Fatalf("unexpected api key user relation: %#v", user)
	}
	keyHash, ok := keys.Fields.GetByName("key_hash").(*core.TextField)
	if !ok || !keyHash.Required || !keyHash.Hidden || keyHash.Min != 64 || keyHash.Max != 64 {
		t.Fatalf("unexpected api key hash field: %#v", keyHash)
	}
	if _, ok := keys.Fields.GetByName("allow_destructive").(*core.BoolField); !ok {
		t.Fatal("api keys must carry the allow_destructive scope flag")
	}
	foundHashIndex := false
	for _, index := range keys.Indexes {
		lower := strings.ToLower(index)
		if strings.Contains(lower, "unique") && strings.Contains(lower, "key_hash") {
			foundHashIndex = true
			break
		}
	}
	if !foundHashIndex {
		t.Fatalf("expected unique key_hash index, got: %v", keys.Indexes)
	}
}
