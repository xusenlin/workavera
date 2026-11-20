package sandbox

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"path"
	"strings"
	"unicode"
	"unicode/utf8"

	workdocs "github.com/xusenlin/workavera/internal/docs"
	"github.com/xusenlin/workavera/internal/resources"
)

const maxFileNameBytes = 200

// sanitizeFileName turns a resource name or document title into one path
// component: path separators become underscores and control characters go.
func sanitizeFileName(name string) string {
	name = strings.Map(func(r rune) rune {
		switch {
		case r == '/' || r == '\\':
			return '_'
		case unicode.IsControl(r) || unicode.Is(unicode.Cf, r):
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == ".." {
		name = "untitled"
	}
	if len(name) > maxFileNameBytes {
		ext := path.Ext(name)
		if len(ext) > 20 {
			ext = ""
		}
		base := name[:maxFileNameBytes-len(ext)]
		for !utf8.ValidString(base) {
			base = base[:len(base)-1]
		}
		name = base + ext
	}
	return name
}

// importScript writes stdin to a free name in directory $1: "$2$3", or
// "$2 (2)$3" and so on when it is taken. It prints the path it wrote.
const importScript = `
dir=$1 base=$2 ext=$3
mkdir -p -- "$dir" 2> /dev/null || exit 13
name="$base$ext"
n=1
while [ -e "$dir/$name" ]; do
	n=$((n + 1))
	name="$base ($n)$ext"
done
cat > "$dir/$name" 2> /dev/null || exit 13
printf '%s' "$dir/$name"
`

// ImportResult is the outcome of sandbox_import.
type ImportResult struct {
	Path   string `json:"path"`
	Size   int    `json:"size"`
	Notice string `json:"notice"`
}

// Import copies one of the user's resources or a document visible to them
// into the conversation's folder on the server, so the content never passes
// through the model.
func (m *Manager) Import(ctx context.Context, userID, conversationID, source, id string) (ImportResult, error) {
	base := ConversationDir(conversationID)
	var dir, fileName string
	var data []byte
	switch source {
	case "resource":
		file, err := resources.Source(m.app, userID, id)
		if err != nil {
			return ImportResult{}, err
		}
		dir, fileName, data = base+"/resources", file.FileName, file.Data
	case "doc":
		doc, err := workdocs.Get(ctx, m.app, userID, strings.TrimSpace(id))
		if err != nil {
			return ImportResult{}, err
		}
		ext := ".md"
		if doc.Kind == workdocs.KindHTML {
			ext = ".html"
		}
		dir, fileName, data = base+"/docs", sanitizeFileName(doc.Title)+ext, []byte(doc.Content)
	default:
		return ImportResult{}, newError(CodeInvalidInput, http.StatusBadRequest, `source must be "resource" or "doc".`)
	}

	name, err := m.Ready(ctx, userID)
	if err != nil {
		return ImportResult{}, err
	}
	fileName = sanitizeFileName(fileName)
	ext := path.Ext(fileName)
	writeCtx, cancel := context.WithTimeout(ctx, fileOpTimeout)
	defer cancel()
	output, err := m.docker.script(writeCtx, name, bytes.NewReader(data), importScript, dir, strings.TrimSuffix(fileName, ext), ext)
	m.touch(userID)
	if err != nil {
		return ImportResult{}, fileError(err, dir, 0)
	}
	return ImportResult{Path: string(output), Size: len(data), Notice: untrustedNotice}, nil
}

// ExportInput describes a sandbox_export call.
type ExportInput struct {
	Path      string
	Target    string
	Name      string
	FolderID  string
	ProjectID string
}

// ExportResult is the outcome of sandbox_export: a new resource or a new
// document.
type ExportResult struct {
	Resource *resources.Resource `json:"resource,omitempty"`
	Document *workdocs.Document  `json:"document,omitempty"`
}

const maxDocBytes = 1024 * 1024

// Export saves a sandbox file as a new resource, under every rule of a user
// upload, or as a new document. Existing documents are never overwritten, so
// their revision checks cannot be bypassed.
func (m *Manager) Export(ctx context.Context, userID, conversationID string, input ExportInput) (ExportResult, error) {
	filePath, err := resolvePath(ConversationDir(conversationID), input.Path)
	if err != nil {
		return ExportResult{}, err
	}
	fileName := path.Base(filePath)
	ext := strings.ToLower(strings.TrimPrefix(path.Ext(fileName), "."))
	switch input.Target {
	case "resource":
	case "doc":
		if ext != "md" && ext != "markdown" && ext != "html" && ext != "htm" {
			return ExportResult{}, newError(CodeExportTypeUnsupport, http.StatusUnsupportedMediaType, "Only .md, .markdown, .html, and .htm files can be exported as documents. Export other files as resources.")
		}
	default:
		return ExportResult{}, newError(CodeInvalidInput, http.StatusBadRequest, `target must be "resource" or "doc".`)
	}

	name, err := m.Ready(ctx, userID)
	if err != nil {
		return ExportResult{}, err
	}
	maxBytes := int(resources.MaxFileSize(m.app))
	if input.Target == "doc" {
		maxBytes = maxDocBytes
	}
	data, err := m.readBytes(ctx, name, filePath, maxBytes)
	m.touch(userID)
	if err != nil {
		return ExportResult{}, err
	}

	if input.Target == "resource" {
		resource, err := resources.Save(ctx, m.app, userID, fileName, strings.TrimSpace(input.Name), data)
		if err != nil {
			var resourceErr *resources.Error
			if errors.As(err, &resourceErr) && resourceErr.Code == resources.CodeUnsupportedMediaType {
				return ExportResult{}, newError(CodeExportTypeUnsupport, http.StatusUnsupportedMediaType, "This file type cannot be saved as a resource. Resources accept PDF, Office, OpenDocument, RTF, EPUB, CSV, HTML, text, Markdown, code, data, SQLite, image, and archive files.")
			}
			return ExportResult{}, err
		}
		return ExportResult{Resource: &resource}, nil
	}

	if !looksLikeText(data, false) {
		return ExportResult{}, notTextError(filePath)
	}
	kind := workdocs.KindMarkdown
	if ext == "html" || ext == "htm" {
		kind = workdocs.KindHTML
	}
	title := strings.TrimSpace(input.Name)
	if title == "" {
		title = strings.TrimSuffix(fileName, path.Ext(fileName))
	}
	doc, err := workdocs.Create(ctx, m.app, userID, workdocs.CreateInput{
		Title:     title,
		Kind:      kind,
		Content:   string(data),
		FolderID:  strings.TrimSpace(input.FolderID),
		ProjectID: strings.TrimSpace(input.ProjectID),
		Source:    "ai",
	})
	if err != nil {
		return ExportResult{}, err
	}
	return ExportResult{Document: &doc}, nil
}
