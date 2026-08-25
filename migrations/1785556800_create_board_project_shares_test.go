package migrations

import (
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestBoardProjectSharesMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	shares, err := app.FindCollectionByNameOrId(boardProjectSharesCollection)
	if err != nil {
		t.Fatal(err)
	}
	if shares.ListRule == nil || shares.ViewRule == nil || *shares.ListRule != *shares.ViewRule {
		t.Fatal("board project shares must be readable only by the project owner")
	}
	if !strings.Contains(*shares.ListRule, "project.owner = @request.auth.id") {
		t.Fatalf("unexpected board project shares read rule: %v", *shares.ListRule)
	}
	// Writes are reserved for /api/board/projects/{id}/share so a slug can
	// never be chosen by a client.
	if shares.CreateRule != nil || shares.UpdateRule != nil || shares.DeleteRule != nil {
		t.Fatal("board project shares must not be writable through the PocketBase CRUD API")
	}

	projects, err := app.FindCollectionByNameOrId(boardProjectsCollection)
	if err != nil {
		t.Fatal(err)
	}
	project, ok := shares.Fields.GetByName("project").(*core.RelationField)
	if !ok || !project.Required || !project.CascadeDelete || project.CollectionId != projects.Id {
		t.Fatalf("unexpected board project shares project field: %#v", project)
	}
	slug, ok := shares.Fields.GetByName("slug").(*core.TextField)
	if !ok || !slug.Required || slug.Min != 22 || slug.Max != 22 {
		t.Fatalf("unexpected board project shares slug field: %#v", slug)
	}
	expires, ok := shares.Fields.GetByName("expires").(*core.DateField)
	if !ok || expires.Required {
		t.Fatalf("unexpected board project shares expires field: %#v", expires)
	}
	// A public preview follows the project, so there is nothing to pin.
	if shares.Fields.GetByName("revision") != nil {
		t.Fatal("board project shares must not pin a revision")
	}

	foundProject := false
	foundSlug := false
	for _, index := range shares.Indexes {
		if strings.Contains(index, "idx_board_project_shares_project") && strings.Contains(index, "UNIQUE") {
			foundProject = true
		}
		if strings.Contains(index, "idx_board_project_shares_slug") && strings.Contains(index, "UNIQUE") {
			foundSlug = true
		}
	}
	if !foundProject || !foundSlug {
		t.Fatalf("project and slug must both be unique: %#v", shares.Indexes)
	}
}
