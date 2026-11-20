package resources

import (
	"archive/tar"
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	_ "github.com/xusenlin/workavera/migrations"
)

func newTestApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	return app
}

func createTestUser(t *testing.T, app core.App, email string) *core.Record {
	t.Helper()
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	user := core.NewRecord(users)
	user.SetEmail(email)
	user.SetPassword("password123")
	user.Set("name", email)
	user.SetVerified(true)
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}
	return user
}

func uploadText(t *testing.T, app core.App, ownerID, name, content string) Resource {
	t.Helper()
	resource, err := Upload(context.Background(), app, ownerID, name, []byte(content))
	if err != nil {
		t.Fatalf("upload %s: %v", name, err)
	}
	return resource
}

func errorCode(err error) string {
	var resourceErr *Error
	if errors.As(err, &resourceErr) {
		return resourceErr.Code
	}
	return ""
}

func countResources(t *testing.T, app core.App) int {
	t.Helper()
	count, err := app.CountRecords(CollectionName)
	if err != nil {
		t.Fatal(err)
	}
	return int(count)
}

func TestUploadStoresFileUnchangedAndReusesIdenticalFiles(t *testing.T) {
	app := newTestApp(t)
	owner := createTestUser(t, app, "resource-owner@example.com")

	content := "# Plan\n\nShip the resources library.\n"
	resource := uploadText(t, app, owner.Id, `C:\Users\me\..\Plan.md`, content)
	if resource.OriginalName != "Plan.md" || resource.DisplayName != "Plan.md" || resource.MediaType != "text/markdown" || resource.Size != int64(len(content)) {
		t.Fatalf("unexpected resource: %#v", resource)
	}
	if !strings.HasPrefix(resource.URL, "/api/files/user_resources/"+resource.ID+"/") {
		t.Fatalf("unexpected protected file URL: %s", resource.URL)
	}
	record, err := app.FindRecordById(CollectionName, resource.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(record.GetString("sha256")) != 64 || record.GetString("file") == "" {
		t.Fatalf("unexpected stored resource: %#v", record)
	}
	source, err := Source(app, owner.Id, resource.ID)
	if err != nil || string(source.Data) != content || source.FileName != "Plan.md" {
		t.Fatalf("unexpected source file: %#v %v", source, err)
	}

	again := uploadText(t, app, owner.Id, "Plan.md", content)
	if again.ID != resource.ID {
		t.Fatalf("same content and name must reuse the resource: %s vs %s", again.ID, resource.ID)
	}
	renamed := uploadText(t, app, owner.Id, "Plan copy.md", content)
	if renamed.ID == resource.ID {
		t.Fatal("same content under a different name must be a separate resource")
	}
	other := createTestUser(t, app, "resource-other@example.com")
	if foreign := uploadText(t, app, other.Id, "Plan.md", content); foreign.ID == resource.ID {
		t.Fatal("another owner's upload must never reuse this resource")
	}
}

func TestUploadRejectsInvalidFilesWithoutSavingAnything(t *testing.T) {
	app := newTestApp(t)
	owner := createTestUser(t, app, "resource-reject@example.com")

	cases := []struct {
		name string
		file string
		data []byte
		code string
	}{
		{"empty", "empty.txt", nil, CodeFileEmpty},
		{"too large", "big.txt", bytes.Repeat([]byte("a"), 10*1024*1024+1), CodeFileTooLarge},
		{"pdf disguised as text", "report.txt", []byte("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n"), CodeUnsupportedMediaType},
		{"text disguised as pdf", "report.pdf", []byte("just some text"), CodeUnsupportedMediaType},
		{"text disguised as sqlite", "data.sqlite", []byte("not a sqlite db"), CodeUnsupportedMediaType},
		{"unsupported extension", "tool.exe", []byte("MZ\x90\x00"), CodeUnsupportedMediaType},
		{"no extension", "README", []byte("hello"), CodeUnsupportedMediaType},
		{"svg image", "drawing.svg", []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`), CodeUnsupportedMediaType},
		{"zip disguised as png", "chart.png", []byte("PK\x03\x04"), CodeUnsupportedMediaType},
		{"empty name", "   ", []byte("hello"), CodeInvalidFilename},
		{"path only", "folder/", []byte("hello"), CodeInvalidFilename},
		{"too long name", strings.Repeat("a", 252) + ".txt", []byte("hello"), CodeInvalidFilename},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			_, err := Upload(context.Background(), app, owner.Id, test.file, test.data)
			if code := errorCode(err); code != test.code {
				t.Fatalf("expected %s, got %v", test.code, err)
			}
		})
	}
	if count := countResources(t, app); count != 0 {
		t.Fatalf("rejected uploads saved %d resources", count)
	}
}

func TestSanitizeNameStripsPathsAndDisguises(t *testing.T) {
	cases := map[string]string{
		"../../etc/passwd.txt":      "passwd.txt",
		`C:\fakepath\report.pdf`:    "report.pdf",
		"report\u202Etxt.exe":       "reporttxt.exe",
		"line\r\nbreak.md":          "linebreak.md",
		` "quoted" name.txt `:       "quoted name.txt",
		"年度报告 2026.docx":            "年度报告 2026.docx",
		"tab\there.csv":             "tabhere.csv",
		"zero\u200bwidth.json":      "zerowidth.json",
		"replacement\ufffdchar.txt": "replacementchar.txt",
	}
	for input, expected := range cases {
		if got := sanitizeName(input); got != expected {
			t.Errorf("sanitizeName(%q) = %q, want %q", input, got, expected)
		}
	}
}

func TestSaveUsesDisplayNameAndReusesIdenticalFiles(t *testing.T) {
	app := newTestApp(t)
	owner := createTestUser(t, app, "resource-save@example.com")

	resource, err := Save(context.Background(), app, owner.Id, "out.txt", "Quarterly numbers", []byte("hello"))
	if err != nil {
		t.Fatal(err)
	}
	if resource.DisplayName != "Quarterly numbers" || resource.OriginalName != "out.txt" || resource.MediaType != "text/plain" {
		t.Fatalf("unexpected saved resource: %#v", resource)
	}
	again, err := Save(context.Background(), app, owner.Id, "out.txt", "Another name", []byte("hello"))
	if err != nil || again.ID != resource.ID || again.DisplayName != "Quarterly numbers" {
		t.Fatalf("saving the same file again must return the existing resource unchanged: %#v %v", again, err)
	}
}

func TestSupportedFileTypesAndConfiguredSizeLimit(t *testing.T) {
	app := newTestApp(t)
	owner := createTestUser(t, app, "resource-types@example.com")
	ctx := context.Background()

	for name, mediaType := range map[string]string{
		"main.py":     "text/x-python",
		"deploy.yaml": "application/yaml",
		"rows.tsv":    "text/tab-separated-values",
		"feed.xml":    "application/xml",
		"page.html":   "text/html",
		"table.csv":   "text/csv",
	} {
		resource, err := Upload(ctx, app, owner.Id, name, []byte("key: value\n"))
		if err != nil || resource.MediaType != mediaType {
			t.Fatalf("%s must be stored with %s: %#v %v", name, mediaType, resource, err)
		}
	}

	var archive bytes.Buffer
	writer := tar.NewWriter(&archive)
	if err := writer.WriteHeader(&tar.Header{Name: "notes.txt", Mode: 0o644, Size: 5}); err != nil {
		t.Fatal(err)
	}
	if _, err := writer.Write([]byte("hello")); err != nil || writer.Close() != nil {
		t.Fatal(err)
	}
	bmp := append([]byte{'B', 'M', 0x3a, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0, 0x28, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0x18, 0}, make([]byte, 32)...)
	sqliteHeader := append([]byte("SQLite format 3\x00"), make([]byte, 84)...)

	cases := []struct {
		file      string
		data      []byte
		mediaType string
	}{
		{"report.pdf", []byte("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\n"), "application/pdf"},
		{"chart.png", []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"), "image/png"},
		{"photo.jpg", []byte("\xff\xd8\xff\xe0\x00\x10JFIF\x00"), "image/jpeg"},
		{"photo.jpeg", []byte("\xff\xd8\xff\xe1\x00\x10Exif\x00"), "image/jpeg"},
		{"loop.gif", []byte("GIF89a\x01\x00\x01\x00"), "image/gif"},
		{"image.webp", []byte("RIFF\x24\x00\x00\x00WEBPVP8 "), "image/webp"},
		{"scan.tiff", []byte("II*\x00\x08\x00\x00\x00"), "image/tiff"},
		{"photo.bmp", bmp, "image/bmp"},
		{"IMG_01.HEIC", append([]byte{0, 0, 0, 0x18}, []byte("ftypheic\x00\x00\x00\x00mif1heic")...), "image/heic"},
		{"bundle.zip", []byte("PK\x03\x04\x14\x00\x00\x00"), "application/zip"},
		{"backup.gz", []byte("\x1f\x8b\x08\x00\x00\x00\x00\x00"), "application/gzip"},
		{"backup.tar", archive.Bytes(), "application/x-tar"},
		{"archive.7z", []byte("7z\xbc\xaf\x27\x1c\x00\x04"), "application/x-7z-compressed"},
		{"app.sqlite", sqliteHeader, "application/vnd.sqlite3"},
		{"metrics.sqlite3", sqliteHeader, "application/vnd.sqlite3"},
		{"store.db", sqliteHeader, "application/vnd.sqlite3"},
	}
	for _, test := range cases {
		t.Run(test.file, func(t *testing.T) {
			resource, err := Upload(ctx, app, owner.Id, test.file, test.data)
			if err != nil || resource.MediaType != test.mediaType {
				t.Fatalf("%s must be stored as %s: %#v %v", test.file, test.mediaType, resource, err)
			}
		})
	}
	if _, err := Upload(ctx, app, owner.Id, "tool.py", []byte("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff")); errorCode(err) != CodeUnsupportedMediaType {
		t.Fatalf("binary content behind a code extension must be refused, got %v", err)
	}

	if _, err := Upload(ctx, app, owner.Id, "big.txt", bytes.Repeat([]byte("a"), 7*1024*1024)); err != nil {
		t.Fatalf("7 MB is within the default 10 MB limit: %v", err)
	}
	record, err := app.FindFirstRecordByFilter("configs", `key = "resources.max_file_size_mb"`)
	if err != nil {
		t.Fatal(err)
	}
	record.Set("value", "2")
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	_, err = Upload(ctx, app, owner.Id, "other.txt", bytes.Repeat([]byte("b"), 3*1024*1024))
	var resourceErr *Error
	if !errors.As(err, &resourceErr) || resourceErr.Code != CodeFileTooLarge || !strings.Contains(resourceErr.Message, "2 MB") {
		t.Fatalf("the configured limit must apply, got %v", err)
	}
}
