package resources

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"path"
	"strings"
	"unicode"

	"github.com/gabriel-vasile/mimetype"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

// format describes one accepted extension: the media type stored for it and
// the detected media types that may sit behind it. The extension is only a
// hint; the detected type must agree with it.
type format struct {
	mediaType string
	detected  []string
}

const (
	mimeDocx   = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	mimePptx   = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	mimeXlsx   = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	mimeOLE    = "application/x-ole-storage"
	mimeText   = "text/plain"
	mimeSQLite = "application/vnd.sqlite3"
)

var formats = map[string]format{
	"txt":   {mediaType: "text/plain", detected: []string{mimeText}},
	"md":    {mediaType: "text/markdown", detected: []string{mimeText}},
	"json":  {mediaType: "application/json", detected: []string{mimeText}},
	"jsonl": {mediaType: "application/x-ndjson", detected: []string{mimeText}},

	"pdf":  {mediaType: "application/pdf", detected: []string{"application/pdf"}},
	"docx": {mediaType: mimeDocx, detected: []string{mimeDocx}},
	"docm": {mediaType: "application/vnd.ms-word.document.macroEnabled.12", detected: []string{mimeDocx}},
	"doc":  {mediaType: "application/msword", detected: []string{"application/msword", mimeOLE}},
	"pptx": {mediaType: mimePptx, detected: []string{mimePptx}},
	"pptm": {mediaType: "application/vnd.ms-powerpoint.presentation.macroEnabled.12", detected: []string{mimePptx}},
	"ppsx": {mediaType: "application/vnd.openxmlformats-officedocument.presentationml.slideshow", detected: []string{mimePptx}},
	"ppsm": {mediaType: "application/vnd.ms-powerpoint.slideshow.macroEnabled.12", detected: []string{mimePptx}},
	"ppt":  {mediaType: "application/vnd.ms-powerpoint", detected: []string{"application/vnd.ms-powerpoint", mimeOLE}},
	"pps":  {mediaType: "application/vnd.ms-powerpoint", detected: []string{"application/vnd.ms-powerpoint", mimeOLE}},
	"pot":  {mediaType: "application/vnd.ms-powerpoint", detected: []string{"application/vnd.ms-powerpoint", mimeOLE}},
	"xlsx": {mediaType: mimeXlsx, detected: []string{mimeXlsx}},
	"xlsm": {mediaType: "application/vnd.ms-excel.sheet.macroEnabled.12", detected: []string{mimeXlsx}},
	"xlsb": {mediaType: "application/vnd.ms-excel.sheet.binary.macroEnabled.12", detected: []string{mimeXlsx}},
	"xls":  {mediaType: "application/vnd.ms-excel", detected: []string{"application/vnd.ms-excel", mimeOLE}},
	"odt":  {mediaType: "application/vnd.oasis.opendocument.text", detected: []string{"application/vnd.oasis.opendocument.text"}},
	"ods":  {mediaType: "application/vnd.oasis.opendocument.spreadsheet", detected: []string{"application/vnd.oasis.opendocument.spreadsheet"}},
	"odp":  {mediaType: "application/vnd.oasis.opendocument.presentation", detected: []string{"application/vnd.oasis.opendocument.presentation"}},
	"rtf":  {mediaType: "application/rtf", detected: []string{"text/rtf"}},
	"epub": {mediaType: "application/epub+zip", detected: []string{"application/epub+zip"}},
	// CSV has no signature, so plain text is the honest detection result for
	// most files.
	"csv": {mediaType: "text/csv", detected: []string{"text/csv", mimeText}},

	"html": {mediaType: "text/html", detected: []string{"text/html", "application/xhtml+xml", mimeText}},
	"htm":  {mediaType: "text/html", detected: []string{"text/html", "application/xhtml+xml", mimeText}},

	// SVG is left out on purpose: it is XML that can run scripts when opened.
	"png":  {mediaType: "image/png", detected: []string{"image/png"}},
	"jpg":  {mediaType: "image/jpeg", detected: []string{"image/jpeg"}},
	"jpeg": {mediaType: "image/jpeg", detected: []string{"image/jpeg"}},
	"gif":  {mediaType: "image/gif", detected: []string{"image/gif"}},
	"webp": {mediaType: "image/webp", detected: []string{"image/webp"}},
	// The ZIP signature also opens OOXML and EPUB files, which the detector
	// names first; those are still ZIP archives and pass as one through the
	// detected type's ancestors.
	"zip": {mediaType: "application/zip", detected: []string{"application/zip"}},
	// TIFF is what most scanners write, and HEIC what iPhones photograph in;
	// both can be OCRed in the sandbox.
	"tif":  {mediaType: "image/tiff", detected: []string{"image/tiff"}},
	"tiff": {mediaType: "image/tiff", detected: []string{"image/tiff"}},
	"bmp":  {mediaType: "image/bmp", detected: []string{"image/bmp"}},
	"heic": {mediaType: "image/heic", detected: []string{"image/heic", "image/heic-sequence", "image/heif"}},
	"tar":  {mediaType: "application/x-tar", detected: []string{"application/x-tar"}},
	"gz":   {mediaType: "application/gzip", detected: []string{"application/gzip"}},
	"tgz":  {mediaType: "application/gzip", detected: []string{"application/gzip"}},
	"7z":   {mediaType: "application/x-7z-compressed", detected: []string{"application/x-7z-compressed"}},

	"sqlite":  {mediaType: mimeSQLite, detected: []string{mimeSQLite}},
	"sqlite3": {mediaType: mimeSQLite, detected: []string{mimeSQLite}},
	"db":      {mediaType: mimeSQLite, detected: []string{mimeSQLite}},
}

// textFormats are code, configuration, and data files detected as plain text.
// Each maps to the media type stored for it.
var textFormats = map[string]string{
	"tsv": "text/tab-separated-values", "log": "text/plain", "ipynb": "application/x-ipynb+json",
	"xml": "application/xml", "yaml": "application/yaml", "yml": "application/yaml", "toml": "application/toml",
	"ini": "text/plain", "cfg": "text/plain", "conf": "text/plain", "env": "text/plain",
	"sql": "application/sql", "sh": "application/x-sh", "bash": "application/x-sh", "zsh": "application/x-sh",
	"py": "text/x-python", "js": "text/javascript", "mjs": "text/javascript", "cjs": "text/javascript",
	"ts": "text/x-typescript", "tsx": "text/x-typescript", "jsx": "text/javascript",
	"go": "text/x-go", "rs": "text/x-rust", "java": "text/x-java", "kt": "text/x-kotlin", "swift": "text/x-swift",
	"c": "text/x-c", "h": "text/x-c", "cpp": "text/x-c++", "cc": "text/x-c++", "hpp": "text/x-c++",
	"cs": "text/x-csharp", "rb": "text/x-ruby", "php": "text/x-php", "lua": "text/x-lua", "r": "text/x-r",
	"css": "text/css", "scss": "text/x-scss", "vue": "text/x-vue", "svelte": "text/x-svelte",
}

func init() {
	for ext, mediaType := range textFormats {
		formats[ext] = format{mediaType: mediaType, detected: []string{mimeText}}
	}
}

// readUploadedFile returns the single multipart "file" of the request and its
// bytes. The declared size is checked before reading, and the bytes actually
// read are checked again, since the multipart header is client input.
func readUploadedFile(event *core.RequestEvent) (string, []byte, error) {
	files, err := event.FindUploadedFiles("file")
	if err != nil || len(files) == 0 {
		return "", nil, newError(CodeFileRequired, http.StatusBadRequest, "Choose a file to upload.")
	}
	if len(files) > 1 {
		return "", nil, newError(CodeInvalidInput, http.StatusBadRequest, "Upload one file at a time.")
	}
	file := files[0]
	if err := checkSize(event.App, file.Size); err != nil {
		return "", nil, err
	}
	reader, err := file.Reader.Open()
	if err != nil {
		return "", nil, err
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, MaxFileSize(event.App)+1))
	if err != nil {
		return "", nil, err
	}
	return file.OriginalName, data, nil
}

func checkSize(app core.App, size int64) error {
	if size <= 0 {
		return newError(CodeFileEmpty, http.StatusBadRequest, "The file is empty.")
	}
	if limit := MaxFileSize(app); size > limit {
		return newError(CodeFileTooLarge, http.StatusRequestEntityTooLarge, fmt.Sprintf("Files must be %d MB or smaller.", limit/(1024*1024)))
	}
	return nil
}

// Upload stores a new resource for the owner as-is after validating its size,
// filename, and detected media type. Uploading the same content under the same
// original name returns the existing resource.
func Upload(ctx context.Context, app core.App, ownerID, name string, data []byte) (Resource, error) {
	return upload(ctx, app, ownerID, name, "", data)
}

// Save stores bytes produced on the server, such as a file exported from the
// sandbox, under exactly the rules of a user upload. The name supplies the
// extension; displayName, when not empty, names a newly created resource
// instead of it.
func Save(ctx context.Context, app core.App, ownerID, name, displayName string, data []byte) (Resource, error) {
	return upload(ctx, app, ownerID, name, displayName, data)
}

func upload(ctx context.Context, app core.App, ownerID, name, displayName string, data []byte) (Resource, error) {
	if err := ctx.Err(); err != nil {
		return Resource{}, err
	}
	if err := checkSize(app, int64(len(data))); err != nil {
		return Resource{}, err
	}
	originalName := sanitizeName(name)
	if originalName == "" || len([]rune(originalName)) > MaxNameLength || originalName == "." || originalName == ".." {
		return Resource{}, newError(CodeInvalidFilename, http.StatusBadRequest, "The file name is missing or invalid.")
	}
	displayName = sanitizeName(displayName)
	if displayName == "" {
		displayName = originalName
	}
	if len([]rune(displayName)) > MaxNameLength {
		return Resource{}, newError(CodeInvalidFilename, http.StatusBadRequest, "The display name must be 1 to 255 characters.")
	}
	ext := strings.ToLower(strings.TrimPrefix(path.Ext(originalName), "."))
	spec, ok := formats[ext]
	if !ok || !detectedMatches(mimetype.Detect(data), spec.detected) {
		return Resource{}, newError(CodeUnsupportedMediaType, http.StatusUnsupportedMediaType, "This file type is not supported.")
	}

	digest := sha256.Sum256(data)
	contentHash := hex.EncodeToString(digest[:])
	if existing, err := findExisting(app, ownerID, contentHash, originalName); err != nil {
		return Resource{}, err
	} else if existing != nil {
		return resourceFromRecord(existing), nil
	}

	collection, err := app.FindCollectionByNameOrId(CollectionName)
	if err != nil {
		return Resource{}, err
	}
	file, err := filesystem.NewFileFromBytes(data, originalName)
	if err != nil {
		return Resource{}, err
	}
	record := core.NewRecord(collection)
	record.Set("owner", ownerID)
	record.Set("file", file)
	record.Set("original_name", originalName)
	record.Set("display_name", displayName)
	record.Set("media_type", spec.mediaType)
	record.Set("size", len(data))
	record.Set("sha256", contentHash)
	if err := app.Save(record); err != nil {
		// A concurrent upload of the same file may have won the unique index
		// between the lookup above and this save; reuse its record.
		if existing, findErr := findExisting(app, ownerID, contentHash, originalName); findErr == nil && existing != nil {
			return resourceFromRecord(existing), nil
		}
		return Resource{}, err
	}
	return resourceFromRecord(record), nil
}

func findExisting(app core.App, ownerID, contentHash, originalName string) (*core.Record, error) {
	records, err := app.FindRecordsByFilter(
		CollectionName,
		"owner = {:owner} && sha256 = {:sha256} && original_name = {:name}",
		"",
		1,
		0,
		dbx.Params{"owner": ownerID, "sha256": contentHash, "name": originalName},
	)
	if err != nil || len(records) == 0 {
		return nil, err
	}
	return records[0], nil
}

// detectedMatches reports whether the detected media type, or one of its
// ancestors, is among the accepted ones. Ancestors matter for text: a Markdown
// file that opens with an HTML tag is detected as HTML, whose parent is plain
// text.
func detectedMatches(detected *mimetype.MIME, accepted []string) bool {
	for current := detected; current != nil; current = current.Parent() {
		for _, mediaType := range accepted {
			if current.Is(mediaType) {
				return true
			}
		}
	}
	return false
}

// sanitizeName keeps only the last path component of a client-supplied name
// and drops control and formatting characters (including bidirectional
// overrides that can disguise an extension) and quotes, which would otherwise
// reach response headers.
func sanitizeName(name string) string {
	if index := strings.LastIndexAny(name, `/\`); index >= 0 {
		name = name[index+1:]
	}
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) || r == '"' || r == unicode.ReplacementChar {
			return -1
		}
		return r
	}, name)
	return strings.TrimSpace(name)
}
