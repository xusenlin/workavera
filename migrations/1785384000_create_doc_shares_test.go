package migrations

import (
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestDocSharesMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	shares, err := app.FindCollectionByNameOrId(docSharesCollection)
	if err != nil {
		t.Fatal(err)
	}
	if shares.ListRule == nil || shares.ViewRule == nil || *shares.ListRule != *shares.ViewRule {
		t.Fatal("doc shares must be readable only by the document owner")
	}
	if !strings.Contains(*shares.ListRule, "doc.owner = @request.auth.id") {
		t.Fatalf("unexpected doc shares read rule: %v", *shares.ListRule)
	}
	// Writes are reserved for /api/docs/{id}/share so a slug can never be
	// chosen by a client and a revision can never be pinned by hand.
	if shares.CreateRule != nil || shares.UpdateRule != nil || shares.DeleteRule != nil {
		t.Fatal("doc shares must not be writable through the PocketBase CRUD API")
	}

	docs, err := app.FindCollectionByNameOrId(docsCollection)
	if err != nil {
		t.Fatal(err)
	}
	doc, ok := shares.Fields.GetByName("doc").(*core.RelationField)
	if !ok || !doc.Required || !doc.CascadeDelete || doc.CollectionId != docs.Id {
		t.Fatalf("unexpected doc shares doc field: %#v", doc)
	}
	slug, ok := shares.Fields.GetByName("slug").(*core.TextField)
	if !ok || !slug.Required || slug.Min != 22 || slug.Max != 22 {
		t.Fatalf("unexpected doc shares slug field: %#v", slug)
	}
	revision, ok := shares.Fields.GetByName("revision").(*core.NumberField)
	if !ok || !revision.Required {
		t.Fatalf("unexpected doc shares revision field: %#v", revision)
	}
	expires, ok := shares.Fields.GetByName("expires").(*core.DateField)
	if !ok || expires.Required {
		t.Fatalf("unexpected doc shares expires field: %#v", expires)
	}

	foundDoc := false
	foundSlug := false
	for _, index := range shares.Indexes {
		if strings.Contains(index, "idx_doc_shares_doc") && strings.Contains(index, "UNIQUE") {
			foundDoc = true
		}
		if strings.Contains(index, "idx_doc_shares_slug") && strings.Contains(index, "UNIQUE") {
			foundSlug = true
		}
	}
	if !foundDoc || !foundSlug {
		t.Fatalf("doc and slug must both be unique: %#v", shares.Indexes)
	}
}
