package migrations

import (
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestDocAssetsCollectionMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	assets, err := app.FindCollectionByNameOrId(docAssetsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if assets.CreateRule != nil || assets.UpdateRule != nil || assets.DeleteRule != nil {
		t.Fatal("doc asset mutations must go through server endpoints")
	}
	if assets.ListRule == nil || assets.ViewRule == nil || *assets.ListRule != *assets.ViewRule {
		t.Fatal("doc assets must share list and view access rules")
	}
	doc, ok := assets.Fields.GetByName("doc").(*core.RelationField)
	if !ok || !doc.Required || !doc.CascadeDelete || doc.MaxSelect != 1 {
		t.Fatalf("unexpected doc asset relation: %#v", doc)
	}
	file, ok := assets.Fields.GetByName("file").(*core.FileField)
	if !ok || !file.Required || !file.Protected || file.MaxSelect != 1 || file.MaxSize != docAssetMaxSize {
		t.Fatalf("unexpected doc asset file field: %#v", file)
	}
	if !slices.Equal(file.MimeTypes, docAssetMimeTypes) {
		t.Fatalf("unexpected doc asset MIME types: %#v", file.MimeTypes)
	}
	sha256, ok := assets.Fields.GetByName("sha256").(*core.TextField)
	if !ok || !sha256.Required || !sha256.Hidden || sha256.Min != 64 || sha256.Max != 64 || sha256.Pattern != "^[a-f0-9]{64}$" {
		t.Fatalf("unexpected doc asset sha256 field: %#v", sha256)
	}
	kind, ok := assets.Fields.GetByName("kind").(*core.SelectField)
	if !ok || !slices.Equal(kind.Values, []string{"image", "file"}) {
		t.Fatalf("unexpected doc asset kinds: %#v", kind)
	}
	foundDedupeIndex := false
	for _, index := range assets.Indexes {
		lower := strings.ToLower(index)
		if strings.Contains(lower, "unique") && strings.Contains(lower, "doc") && strings.Contains(lower, "sha256") && strings.Contains(lower, "original_name") {
			foundDedupeIndex = true
			break
		}
	}
	if !foundDedupeIndex {
		t.Fatalf("expected unique doc/sha256/original_name index, got: %v", assets.Indexes)
	}
}
