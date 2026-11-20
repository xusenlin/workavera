package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestUserResourcesMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	resources, err := app.FindCollectionByNameOrId(userResourcesCollection)
	if err != nil {
		t.Fatalf("missing user resources collection: %v", err)
	}
	ownerRule := `@request.auth.id != "" && owner = @request.auth.id`
	if resources.ListRule == nil || *resources.ListRule != ownerRule || resources.ViewRule == nil || *resources.ViewRule != ownerRule {
		t.Fatalf("resources must be listable and viewable by their owner only: %v %v", resources.ListRule, resources.ViewRule)
	}
	if resources.UpdateRule == nil || *resources.UpdateRule != ownerRule {
		t.Fatalf("unexpected update rule: %v", resources.UpdateRule)
	}
	if resources.CreateRule != nil || resources.DeleteRule != nil {
		t.Fatal("resources must be created and deleted through the resource service only")
	}
	file, ok := resources.Fields.GetByName("file").(*core.FileField)
	if !ok || !file.Protected || !file.Required || file.MaxSelect != 1 || file.MaxSize != resourceFileSizeCeiling {
		t.Fatalf("unexpected file field: %#v", file)
	}
	hash, ok := resources.Fields.GetByName("sha256").(*core.TextField)
	if !ok || !hash.Hidden {
		t.Fatalf("sha256 must be hidden: %#v", hash)
	}
	owner, ok := resources.Fields.GetByName("owner").(*core.RelationField)
	if !ok || !owner.CascadeDelete || !owner.Required {
		t.Fatalf("resources must be cascade-deleted with their owner: %#v", owner)
	}
	if !hasUniqueIndex(resources, "idx_user_resources_owner_sha256_name") {
		t.Fatal("owner, sha256, and original_name must be unique together")
	}

	leases, err := app.FindCollectionByNameOrId(resourceDownloadLeasesCollection)
	if err != nil {
		t.Fatalf("missing download leases collection: %v", err)
	}
	if leases.ListRule == nil || *leases.ListRule != ownerRule || leases.ViewRule == nil || *leases.ViewRule != ownerRule {
		t.Fatalf("leases must be listable and viewable by their owner only: %v %v", leases.ListRule, leases.ViewRule)
	}
	if leases.CreateRule != nil || leases.UpdateRule != nil || leases.DeleteRule != nil {
		t.Fatal("leases must be created and revoked through the resource service only")
	}
	tokenHash, ok := leases.Fields.GetByName("token_hash").(*core.TextField)
	if !ok || !tokenHash.Hidden {
		t.Fatalf("token_hash must be hidden: %#v", tokenHash)
	}
	resource, ok := leases.Fields.GetByName("resource").(*core.RelationField)
	if !ok || !resource.CascadeDelete || resource.CollectionId != resources.Id {
		t.Fatalf("leases must be cascade-deleted with their resource: %#v", resource)
	}
	if !hasUniqueIndex(leases, "idx_resource_download_leases_token_hash") {
		t.Fatal("token_hash must be unique")
	}

	if err := dropUserResourcesCollections(app); err != nil {
		t.Fatalf("drop resources collections: %v", err)
	}
	for _, name := range []string{userResourcesCollection, resourceDownloadLeasesCollection} {
		if _, err := app.FindCollectionByNameOrId(name); err == nil {
			t.Fatalf("expected %s to be removed", name)
		}
	}
}

func hasUniqueIndex(collection *core.Collection, name string) bool {
	index := collection.GetIndex(name)
	return index != "" && len(index) > len("CREATE UNIQUE") && index[:len("CREATE UNIQUE")] == "CREATE UNIQUE"
}
