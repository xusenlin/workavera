package docs

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/url"
	"strings"

	"github.com/gabriel-vasile/mimetype"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

const (
	AssetsCollectionName = "doc_assets"
	maxAssetSize         = 10 * 1024 * 1024
)

var assetMimeTypes = []string{
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.ms-powerpoint",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"text/plain",
	"text/markdown",
	"text/csv",
	"application/json",
	"application/zip",
}

type Asset struct {
	ID        string `json:"id"`
	DocID     string `json:"docId"`
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	MediaType string `json:"mediaType"`
	Size      int64  `json:"size"`
	URL       string `json:"url"`
}

func UploadAsset(ctx context.Context, app core.App, actorID, docID string, file *filesystem.File) (Asset, error) {
	if err := ctx.Err(); err != nil {
		return Asset{}, err
	}
	if _, err := editableRecord(app, actorID, docID); err != nil {
		return Asset{}, err
	}
	if file == nil {
		return Asset{}, ErrInvalidInput
	}
	originalName := strings.TrimSpace(file.OriginalName)
	if originalName == "" || len(originalName) > 255 || file.Size <= 0 || file.Size > maxAssetSize {
		return Asset{}, ErrInvalidInput
	}

	mediaType, err := detectAllowedAssetType(file)
	if err != nil {
		return Asset{}, ErrInvalidInput
	}
	kind := "file"
	if strings.HasPrefix(mediaType, "image/") {
		kind = "image"
	}
	contentHash, err := assetSHA256(file)
	if err != nil {
		return Asset{}, err
	}
	existing, err := findExistingAsset(app, docID, contentHash, originalName)
	if err != nil {
		return Asset{}, err
	}
	if existing != nil {
		return assetFromRecord(existing), nil
	}

	collection, err := app.FindCollectionByNameOrId(AssetsCollectionName)
	if err != nil {
		return Asset{}, err
	}
	record := core.NewRecord(collection)
	record.Set("doc", docID)
	record.Set("file", file)
	record.Set("kind", kind)
	record.Set("original_name", originalName)
	record.Set("media_type", mediaType)
	record.Set("size", file.Size)
	record.Set("sha256", contentHash)
	record.Set("uploaded_by", actorID)
	if err := app.Save(record); err != nil {
		// A concurrent upload may have inserted the same document asset after
		// the lookup above. The unique index makes that race safe.
		if existing, findErr := findExistingAsset(app, docID, contentHash, originalName); findErr == nil && existing != nil {
			return assetFromRecord(existing), nil
		}
		return Asset{}, err
	}

	return assetFromRecord(record), nil
}

func assetFromRecord(record *core.Record) Asset {
	filename := record.GetString("file")
	return Asset{
		ID:        record.Id,
		DocID:     record.GetString("doc"),
		Kind:      record.GetString("kind"),
		Name:      record.GetString("original_name"),
		MediaType: record.GetString("media_type"),
		Size:      int64(record.GetFloat("size")),
		URL:       "/api/files/" + url.PathEscape(AssetsCollectionName) + "/" + url.PathEscape(record.Id) + "/" + url.PathEscape(filename),
	}
}

func findExistingAsset(app core.App, docID, contentHash, originalName string) (*core.Record, error) {
	records, err := app.FindRecordsByFilter(
		AssetsCollectionName,
		"doc = {:doc} && sha256 = {:sha256} && original_name = {:name}",
		"",
		1,
		0,
		dbx.Params{"doc": docID, "sha256": contentHash, "name": originalName},
	)
	if err != nil || len(records) == 0 {
		return nil, err
	}
	return records[0], nil
}

func assetSHA256(file *filesystem.File) (string, error) {
	reader, err := file.Reader.Open()
	if err != nil {
		return "", err
	}
	defer reader.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, reader); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func detectAllowedAssetType(file *filesystem.File) (string, error) {
	reader, err := file.Reader.Open()
	if err != nil {
		return "", err
	}
	defer reader.Close()
	detected, err := mimetype.DetectReader(reader)
	if err != nil {
		return "", err
	}
	for _, allowed := range assetMimeTypes {
		if detected.Is(allowed) {
			return detected.String(), nil
		}
	}
	return "", errors.New("unsupported asset media type")
}
