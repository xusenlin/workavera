package docs

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"
)

func TestPublishServesThePinnedRevisionOnly(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createTestUser(t, app, "share-owner@example.com")

	doc, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Launch plan", Content: "published body"})
	if err != nil {
		t.Fatal(err)
	}
	share, err := Publish(context.Background(), app, owner.Id, doc.ID, ShareInput{})
	if err != nil || share.Revision != 1 || len(share.Slug) != shareSlugLength {
		t.Fatalf("publish: %#v, %v", share, err)
	}

	// Editing after publishing must not change what the link serves.
	if _, _, err := Update(context.Background(), app, owner.Id, doc.ID, UpdateInput{Title: "Launch plan", Content: "draft body", BaseRevision: 1}); err != nil {
		t.Fatal(err)
	}
	public, err := PublicDoc(context.Background(), app, share.Slug)
	if err != nil || public.Content != "published body" || public.Revision != 1 || public.Kind != KindMarkdown {
		t.Fatalf("public document followed the draft: %#v, %v", public, err)
	}

	// An expiry change alone must leave the published snapshot where it is.
	pinned, err := Publish(context.Background(), app, owner.Id, doc.ID, ShareInput{Expires: types.NowDateTime().Add(time.Hour).String()})
	if err != nil || pinned.Revision != 1 {
		t.Fatalf("expiry change moved the snapshot: %#v, %v", pinned, err)
	}

	republished, err := Publish(context.Background(), app, owner.Id, doc.ID, ShareInput{Republish: true})
	if err != nil || republished.Revision != 2 || republished.Slug != share.Slug {
		t.Fatalf("republish: %#v, %v", republished, err)
	}
	public, err = PublicDoc(context.Background(), app, share.Slug)
	if err != nil || public.Content != "draft body" {
		t.Fatalf("republish did not move the snapshot: %#v, %v", public, err)
	}
}

func TestPublicDocRejectsExpiredRevokedAndArchivedShares(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createTestUser(t, app, "share-lifecycle@example.com")

	doc, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Notes", Content: "body"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := PublicDoc(context.Background(), app, "aaaaaaaaaaaaaaaaaaaaaa"); !errors.Is(err, ErrShareNotFound) {
		t.Fatalf("unknown slug: %v", err)
	}

	future := types.NowDateTime().Add(time.Hour)
	share, err := Publish(context.Background(), app, owner.Id, doc.ID, ShareInput{Expires: future.String()})
	if err != nil || share.Expires == "" {
		t.Fatalf("publish with expiry: %#v, %v", share, err)
	}
	if _, err := Publish(context.Background(), app, owner.Id, doc.ID, ShareInput{Expires: types.NowDateTime().Add(-time.Hour).String()}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("past expiry was accepted: %v", err)
	}

	// Expire the share behind the API to avoid waiting for wall-clock time.
	record, err := app.FindFirstRecordByFilter(SharesCollectionName, "slug = {:slug}", map[string]any{"slug": share.Slug})
	if err != nil {
		t.Fatal(err)
	}
	record.Set("expires", types.NowDateTime().Add(-time.Minute))
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	if _, err := PublicDoc(context.Background(), app, share.Slug); !errors.Is(err, ErrShareNotFound) {
		t.Fatalf("expired share was served: %v", err)
	}

	// A fresh publish clears the expiry and serves again.
	if _, err := Publish(context.Background(), app, owner.Id, doc.ID, ShareInput{}); err != nil {
		t.Fatal(err)
	}
	if _, err := PublicDoc(context.Background(), app, share.Slug); err != nil {
		t.Fatalf("republished share is not served: %v", err)
	}

	if _, err := SetArchived(context.Background(), app, owner.Id, doc.ID, true); err != nil {
		t.Fatal(err)
	}
	if _, err := PublicDoc(context.Background(), app, share.Slug); !errors.Is(err, ErrShareNotFound) {
		t.Fatalf("archived document stayed public: %v", err)
	}
	if _, err := Publish(context.Background(), app, owner.Id, doc.ID, ShareInput{}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("archived document was published: %v", err)
	}
	if _, err := SetArchived(context.Background(), app, owner.Id, doc.ID, false); err != nil {
		t.Fatal(err)
	}

	if err := Unpublish(context.Background(), app, owner.Id, doc.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := PublicDoc(context.Background(), app, share.Slug); !errors.Is(err, ErrShareNotFound) {
		t.Fatalf("revoked share was served: %v", err)
	}
	if _, err := GetShare(context.Background(), app, owner.Id, doc.ID); !errors.Is(err, ErrShareNotFound) {
		t.Fatalf("revoked share is still reported: %v", err)
	}
	// Publishing again must not revive the revoked link.
	reshared, err := Publish(context.Background(), app, owner.Id, doc.ID, ShareInput{})
	if err != nil || reshared.Slug == share.Slug {
		t.Fatalf("revoked slug came back: %#v, %v", reshared, err)
	}
}

func TestOnlyTheOwnerCanPublish(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createTestUser(t, app, "share-project-owner@example.com")
	member := createTestUser(t, app, "share-project-member@example.com")
	outsider := createTestUser(t, app, "share-outsider@example.com")
	project := createTestProject(t, app, owner.Id)
	createTestMembership(t, app, project.Id, member.Id, "member")

	doc, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Spec", Content: "body", ProjectID: project.Id})
	if err != nil {
		t.Fatal(err)
	}
	// Project members may edit the document but sharing it publicly is the
	// creator's call, matching archive and delete.
	if _, err := Publish(context.Background(), app, member.Id, doc.ID, ShareInput{}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("project member published: %v", err)
	}
	if _, err := Publish(context.Background(), app, outsider.Id, doc.ID, ShareInput{}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("outsider published: %v", err)
	}
	share, err := Publish(context.Background(), app, owner.Id, doc.ID, ShareInput{})
	if err != nil {
		t.Fatal(err)
	}
	if err := Unpublish(context.Background(), app, member.Id, doc.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("project member revoked: %v", err)
	}
	if _, err := GetShare(context.Background(), app, member.Id, doc.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("project member read the share: %v", err)
	}
	if _, err := PublicDoc(context.Background(), app, share.Slug); err != nil {
		t.Fatalf("owner share is not public: %v", err)
	}
}

func TestPublicAssetsAreLimitedToThePublishedSnapshot(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createTestUser(t, app, "share-assets@example.com")

	doc, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "With images", Content: "body"})
	if err != nil {
		t.Fatal(err)
	}
	published, err := UploadAsset(context.Background(), app, owner.Id, doc.ID, testPNG(t, "published.png"))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := Update(context.Background(), app, owner.Id, doc.ID, UpdateInput{
		Title:        "With images",
		Content:      fmt.Sprintf("![diagram](%s)", published.URL),
		BaseRevision: 1,
	}); err != nil {
		t.Fatal(err)
	}
	share, err := Publish(context.Background(), app, owner.Id, doc.ID, ShareInput{})
	if err != nil {
		t.Fatal(err)
	}

	asset, err := PublicAsset(context.Background(), app, share.Slug, published.ID)
	if err != nil || asset.Id != published.ID {
		t.Fatalf("published attachment is not reachable: %v", err)
	}

	// Uploaded to the same document but never part of the published snapshot.
	private, err := UploadAsset(context.Background(), app, owner.Id, doc.ID, testPNG(t, "private.png"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := PublicAsset(context.Background(), app, share.Slug, private.ID); !errors.Is(err, ErrShareNotFound) {
		t.Fatalf("unpublished attachment leaked: %v", err)
	}

	other, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Other", Content: "body"})
	if err != nil {
		t.Fatal(err)
	}
	foreign, err := UploadAsset(context.Background(), app, owner.Id, other.ID, testPNG(t, "foreign.png"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := PublicAsset(context.Background(), app, share.Slug, foreign.ID); !errors.Is(err, ErrShareNotFound) {
		t.Fatalf("another document's attachment leaked: %v", err)
	}
}

func TestDeletingADocumentRemovesItsShare(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createTestUser(t, app, "share-delete@example.com")

	doc, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Temporary", Content: "body"})
	if err != nil {
		t.Fatal(err)
	}
	share, err := Publish(context.Background(), app, owner.Id, doc.ID, ShareInput{})
	if err != nil {
		t.Fatal(err)
	}
	if err := Delete(context.Background(), app, owner.Id, doc.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := PublicDoc(context.Background(), app, share.Slug); !errors.Is(err, ErrShareNotFound) {
		t.Fatalf("share survived document deletion: %v", err)
	}
	records, err := app.FindRecordsByFilter(SharesCollectionName, "slug = {:slug}", "", 1, 0, map[string]any{"slug": share.Slug})
	if err != nil || len(records) != 0 {
		t.Fatalf("share record survived document deletion: %d, %v", len(records), err)
	}
}

func TestPublishedHTMLKeepsItsKind(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createTestUser(t, app, "share-html@example.com")

	doc, err := Create(context.Background(), app, owner.Id, CreateInput{
		Title:   "Calculator",
		Kind:    KindHTML,
		Content: "<html><body>tool</body></html>",
	})
	if err != nil {
		t.Fatal(err)
	}
	share, err := Publish(context.Background(), app, owner.Id, doc.ID, ShareInput{})
	if err != nil {
		t.Fatal(err)
	}
	public, err := PublicDoc(context.Background(), app, share.Slug)
	if err != nil || public.Kind != KindHTML || !strings.Contains(public.Content, "tool") {
		t.Fatalf("public HTML document: %#v, %v", public, err)
	}
}
