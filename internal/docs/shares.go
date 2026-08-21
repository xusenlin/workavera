package docs

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	SharesCollectionName = "doc_shares"
	shareSlugLength      = 22
	// Lowercase alphanumerics keep a shared link readable over the phone and
	// safe to paste anywhere without escaping.
	shareSlugAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
)

// ErrShareNotFound covers every reason a public link cannot be served: unknown
// slug, expired share, archived or deleted document, attachment outside the
// published snapshot. Public responses must not tell these apart.
var ErrShareNotFound = errors.New("shared document not found")

type Share struct {
	DocID    string `json:"docId"`
	Slug     string `json:"slug"`
	Revision int    `json:"revision"`
	Expires  string `json:"expires,omitempty"`
	Created  string `json:"created"`
	Updated  string `json:"updated"`
}

type ShareInput struct {
	Expires string `json:"expires"`
	// Republish moves an existing share to the document's current revision.
	// Without it, changing the expiry of a share leaves the published
	// snapshot where it is, so adjusting a date can never leak an unfinished
	// draft.
	Republish bool `json:"republish"`
}

// PublicDocument is everything an anonymous reader receives. Owner, project,
// folder, and editor identities stay out of it.
type PublicDocument struct {
	Title     string `json:"title"`
	Kind      string `json:"kind"`
	Content   string `json:"content"`
	Revision  int    `json:"revision"`
	Published string `json:"published"`
}

// Publish exposes the document's current revision under a public slug, and on
// an existing share updates its expiry and, when asked, its published
// revision. Only the owner can publish, matching archive and delete.
func Publish(ctx context.Context, app core.App, actorID, id string, input ShareInput) (Share, error) {
	if err := ctx.Err(); err != nil {
		return Share{}, err
	}
	record, err := manageableRecord(app, actorID, id)
	if err != nil {
		return Share{}, err
	}
	if record.GetString("status") == "archived" {
		return Share{}, ErrForbidden
	}
	expires, err := parseShareExpiry(input.Expires)
	if err != nil {
		return Share{}, err
	}

	share, err := findShareByDoc(app, id)
	if err != nil {
		return Share{}, err
	}
	if share == nil {
		collection, err := app.FindCollectionByNameOrId(SharesCollectionName)
		if err != nil {
			return Share{}, err
		}
		share = core.NewRecord(collection)
		share.Set("doc", id)
		share.Set("slug", security.RandomStringWithAlphabet(shareSlugLength, shareSlugAlphabet))
		share.Set("created_by", actorID)
		share.Set("revision", record.GetInt("revision"))
	} else if input.Republish {
		share.Set("revision", record.GetInt("revision"))
	}
	share.Set("expires", expires)
	if err := app.Save(share); err != nil {
		return Share{}, err
	}
	return shareForRecord(share), nil
}

// Unpublish revokes the link by deleting the record, so publishing again
// issues a new slug instead of reviving the old one.
func Unpublish(ctx context.Context, app core.App, actorID, id string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if _, err := manageableRecord(app, actorID, id); err != nil {
		return err
	}
	share, err := findShareByDoc(app, id)
	if err != nil || share == nil {
		return err
	}
	return app.Delete(share)
}

// GetShare reports the current share of a document, or ErrShareNotFound when
// it is not shared.
func GetShare(ctx context.Context, app core.App, actorID, id string) (Share, error) {
	if err := ctx.Err(); err != nil {
		return Share{}, err
	}
	if _, err := manageableRecord(app, actorID, id); err != nil {
		return Share{}, err
	}
	share, err := findShareByDoc(app, id)
	if err != nil {
		return Share{}, err
	}
	if share == nil {
		return Share{}, ErrShareNotFound
	}
	return shareForRecord(share), nil
}

// PublicDoc serves a shared document to an anonymous reader. It reads the
// pinned revision from doc_versions, so edits made after publishing stay
// private until the owner republishes.
func PublicDoc(ctx context.Context, app core.App, slug string) (PublicDocument, error) {
	share, doc, err := resolveShare(ctx, app, slug)
	if err != nil {
		return PublicDocument{}, err
	}
	revision := share.GetInt("revision")
	version, err := publishedVersion(app, doc.Id, revision)
	if err != nil {
		return PublicDocument{}, err
	}
	kind := doc.GetString("kind")
	if kind == "" {
		kind = KindMarkdown
	}
	return PublicDocument{
		Title:     version.GetString("title"),
		Kind:      kind,
		Content:   version.GetString("content"),
		Revision:  revision,
		Published: version.GetString("created"),
	}, nil
}

// PublicAsset resolves an attachment referenced by a published snapshot. The
// content check keeps attachments uploaded after publishing out of the public
// link, the same way the pinned revision keeps later edits out.
func PublicAsset(ctx context.Context, app core.App, slug, assetID string) (*core.Record, error) {
	share, doc, err := resolveShare(ctx, app, slug)
	if err != nil {
		return nil, err
	}
	asset, err := app.FindRecordById(AssetsCollectionName, assetID)
	if err != nil || asset.GetString("doc") != doc.Id {
		return nil, ErrShareNotFound
	}
	version, err := publishedVersion(app, doc.Id, share.GetInt("revision"))
	if err != nil {
		return nil, err
	}
	if !strings.Contains(version.GetString("content"), asset.Id) {
		return nil, ErrShareNotFound
	}
	return asset, nil
}

// resolveShare turns a public slug into its share and document, applying every
// reason the link may have stopped working.
func resolveShare(ctx context.Context, app core.App, slug string) (*core.Record, *core.Record, error) {
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return nil, nil, ErrShareNotFound
	}
	share, err := app.FindFirstRecordByFilter(SharesCollectionName, "slug = {:slug}", dbx.Params{"slug": slug})
	if err != nil {
		return nil, nil, ErrShareNotFound
	}
	if expires := share.GetDateTime("expires"); !expires.IsZero() && expires.Time().Before(time.Now()) {
		return nil, nil, ErrShareNotFound
	}
	doc, err := app.FindRecordById(CollectionName, share.GetString("doc"))
	if err != nil || doc.GetString("status") == "archived" {
		return nil, nil, ErrShareNotFound
	}
	return share, doc, nil
}

func publishedVersion(app core.App, docID string, revision int) (*core.Record, error) {
	version, err := app.FindFirstRecordByFilter(
		VersionsCollectionName,
		"doc = {:doc} && revision = {:revision}",
		dbx.Params{"doc": docID, "revision": revision},
	)
	if err != nil {
		return nil, ErrShareNotFound
	}
	return version, nil
}

func findShareByDoc(app core.App, docID string) (*core.Record, error) {
	records, err := app.FindRecordsByFilter(SharesCollectionName, "doc = {:doc}", "", 1, 0, dbx.Params{"doc": docID})
	if err != nil || len(records) == 0 {
		return nil, err
	}
	return records[0], nil
}

func parseShareExpiry(value string) (types.DateTime, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return types.DateTime{}, nil
	}
	expires, err := types.ParseDateTime(value)
	if err != nil || expires.IsZero() || expires.Time().Before(time.Now()) {
		return types.DateTime{}, ErrInvalidInput
	}
	return expires, nil
}

func shareForRecord(record *core.Record) Share {
	expires := ""
	if value := record.GetDateTime("expires"); !value.IsZero() {
		expires = value.String()
	}
	return Share{
		DocID:    record.GetString("doc"),
		Slug:     record.GetString("slug"),
		Revision: record.GetInt("revision"),
		Expires:  expires,
		Created:  record.GetString("created"),
		Updated:  record.GetString("updated"),
	}
}
