# Remove Built-in anydoc Conversion and Simplify Resources (PRD)

[简体中文](./remove-anydoc-prd.zh-CN.md)

> Status: Confirmed · Target version: `0.3.0` · Repositories: `workavera`, `workavera-sandbox` (image `:4`) · Mobile impact: None (Android / iOS do not reference `user_resources` yet)

---

## 1. Background and Motivation

When [Resources](../v0.0.1-v0.2.x/resources-prd.md) shipped in `v0.2.0`, it converted documents synchronously during upload and stored the extracted text in the database:

- The server embeds `github.com/xusenlin/go-anydoc` (`6.3 MB` `anydoc.wasm` plus the `wazy` WASM runtime) and `html-to-markdown/v2`, converting PDF, Office, CSV, and HTML uploads to Markdown and storing up to 8 MB per row in `user_resources.converted_markdown`.
- Once the same release introduced the [per-user Docker sandbox](../v0.0.1-v0.2.x/sandbox-prd.md) and widened Resources to accept images, archives, scanned PDFs, and encrypted documents without text, built-in conversion became increasingly awkward:

| Pain point | How it showed up previously |
| --- | --- |
| **Heavy binary & startup memory spike** | Embedded `6.3 MB` WASM + the `wazy` compiler; first startup, upgrades, CPU changes, and container rebuilds compiled to `anydoc_cache/` with a transient **~550 MB memory peak**, plus ~100 MB per active conversion. |
| **Lossy, incomplete conversion** | Dropped formulas, layout, images, multi-column structure, and sheet fidelity; prompts repeatedly warned the model not to trust the Markdown and to inspect the original file in the sandbox instead. |
| **Growing patches for non-convertible files** | Required adding `no_text_reason` (`binary / needs_ocr / encrypted / empty / too_complex`), a `csvToUTF8` mojibake workaround, a 2-slot concurrency semaphore, 60-second upload timeouts, and warm-up failure handling. |
| **SQLite bloat & query gymnastics** | Stored up to 8 MB of duplicated Markdown inside `pb_data/data.db` per row, inflating DB size and backups and forcing every list query to carefully exclude the column. |
| **Redundant with a stronger sandbox** | The sandbox image already ships `pandoc`, `poppler-utils` (`pdftotext`/`pdftoppm`/`pdfimages`), `qpdf`, `ocrmypdf`, `tesseract`, `openpyxl`, `python-docx`, `python-pptx`, `pypdf`, `pandas`, and `duckdb`, all operating directly on lossless original files. |

**Core principle shift**: The Workavera server owns **safe storage of original files, metadata, short-lived download links, and file transfer to/from the sandbox**. Parsing, converting, or extracting content is **compute/tooling** and belongs inside the user's sandbox, where the AI chooses the right tool for the job (`anydoc`, `pdftotext`, `openpyxl`, `pandoc`, OCR, etc.).

---

## 2. Finalized Product Decisions

1. **Pure file library (no server-side content reading)**:
   - Remove `resources_read_markdown` and `resources_search`.
   - Keep `resources_list` (by filename), `resources_rename`, Chat-only download link tools, and `sandbox_import` / `sandbox_export`.
   - Environments without a sandbox (e.g. Docker container deployments or Sandbox turned off) do not read resource contents on the server; external MCP clients keep listing (by name) and renaming.
2. **Remove `html-to-markdown` alongside `go-anydoc`**:
   - Remove all server-side document/HTML conversion pipelines and dependencies (`github.com/xusenlin/go-anydoc`, `github.com/samyfodil/wazy`, `github.com/JohannesKaufmann/html-to-markdown/v2`, `github.com/JohannesKaufmann/dom`).
3. **Ship native `anydoc` CLI in `workavera-sandbox:4`**:
   - Install pinned `@firecrawl/anydoc` globally in `workavera-sandbox/Dockerfile` (which bundles prebuilt native napi-rs bindings for `linux-x64-gnu` and `linux-arm64-gnu`, exposing the global `anydoc` command), update `org.workavera.sandbox.tools`, and add a smoke test in `scripts/smoke.sh`.
   - Bump the default `sandbox.image` from `:3` to `:4` in a Workavera migration (preserving custom admin values), pushing `workavera-sandbox:4` before releasing `workavera` `0.3.0`.
4. **Keep the vetted MIME whitelist and add SQLite support**:
   - Keep extension + `mimetype.Detect` validation and continue blocking `.svg`, removing only `conversionPath` classification.
   - Add `.sqlite`, `.sqlite3`, and `.db` (`application/vnd.sqlite3`), grouped under `Code & data` in the frontend and labeled `SQLite`.

---

## 3. Goals and Non-goals

### Goals
1. Completely remove `go-anydoc`, `wazy`, `html-to-markdown/v2`, and synchronous upload-time conversion.
2. Eliminate the ~550 MB WASM compilation memory peak and the `anydoc_cache/` directory.
3. Drop `converted_markdown`, `converted_size`, and `no_text_reason` from `user_resources`, reducing binary size and SQLite database size.
4. Make uploads pure validation + deduplication + file storage—fast and never blocked by conversion errors or timeouts—and add SQLite file support.
5. Ship the `anydoc` CLI in `workavera-sandbox:4` so the AI chooses when to use it, and move the server default image to `:4`.
6. Upgrade cleanly from `v0.2.0` / `v0.2.1` (schema migration and legacy chat history rendering).

### Non-goals
- Adding native multimodal file attachments (passing raw PDF/image bytes directly to LLM APIs) in this change.
- Changing the security boundary that disables the sandbox when Workavera itself runs inside a container.
- Removing upload MIME validation or permitting `.svg`.

---

## 4. Technical Scope

### 4.1 Data Model & Migrations (`migrations/`)

1. **`1786334400_remove_resource_conversion.go`** (+ test):
   - **Up**: Drop `converted_markdown`, `converted_size`, and `no_text_reason` from `user_resources`. Keep `owner`, `file`, `original_name`, `display_name`, `media_type`, `size`, `sha256`, `created`, `updated`, existing indexes, `resource_download_leases`, and `resources.max_file_size_mb`.
   - **Down**: Re-add the 3 optional fields (dropped extracted text cannot be restored automatically).
   - Release note: Dropping columns in SQLite does not automatically shrink `pb_data/data.db`; administrators may optionally back up and run `VACUUM`.
2. **`1786420800_sandbox_image_4.go`** (+ test):
   - Move `sandbox.image` in `configs` from `"ghcr.io/xusenlin/workavera-sandbox:3"` to `"ghcr.io/xusenlin/workavera-sandbox:4"` without overwriting administrator-configured images; update `DefaultSandboxImage` in `internal/configs/sandbox.go`.

### 4.2 Backend `internal/resources/`

- **Delete**: `internal/resources/convert.go`, `internal/resources/convert_test.go`.
- **Simplify `resources.go`**: Remove `converter`, `converterStoreKey`, `MaxMarkdownSize`, `warmInBackground()`, conversion/reading error codes (`CodeUnsupportedEncoding`, `CodeConversionFailed`, `CodeConversionTimeout`, `CodeDocumentEncrypted`, `CodeDocumentMalformed`, `CodeDocumentNeedsOCR`, `CodeConvertedContentEmpty`, `CodeConvertedContentTooLarge`, `CodeResourceHasNoText`, `CodeInvalidResourceCursor`), `ConvertedSize` / `NoTextReason` on `Resource`, `Markdown` on `SourceFile`, and dropped columns from `immutableFields`.
- **Simplify `upload.go`**: Remove `go-anydoc`, `conversionPath`, `IsBinary`, `NoText*`, and `noTextReason()`. `Upload()` / `Save()` drop `*converter` and perform size check → filename sanitization → extension/MIME check → SHA-256 dedup → save. Add `.sqlite`, `.sqlite3`, and `.db` (`application/vnd.sqlite3`) to `formats`.
- **Simplify `query.go`**: Drop `no_text_reason` from `summaryColumns`, `summaryRow`, `ListItem`, and `Snapshot`; restrict `List()` to `display_name` and `original_name` and drop `MatchedIn`; remove `Search()`, `Read()`, cursor helpers, `NoTextDescription()`, and `UntrustedNotice`.

### 4.3 Dependencies & Container Build

- **`go.mod` / `go.sum`** (`task tidy`): Drop `github.com/xusenlin/go-anydoc`, `github.com/JohannesKaufmann/html-to-markdown/v2`, and transitives `github.com/samyfodil/wazy` and `github.com/JohannesKaufmann/dom`; `golang.org/x/text` becomes indirect.
- **Build & ignore files**: Remove `/app/anydoc_cache` from [`Dockerfile`](../../Dockerfile), `.gitignore`, and `.dockerignore`.

### 4.4 Sandbox, Chat, and Assistant Tools

- **`internal/sandbox/transfer.go`**: `Import()` stops writing `<name>.md` and drops `MarkdownPath` / `MarkdownSize`; `Export()` removes `resourceExportNotice` and updates unsupported-type guidance.
- **`internal/assistant/tools/sandbox.go`**: Update `sandbox_import` and `sandbox_export` descriptions.
- **`internal/assistant/tools/resources.go`, `registry.go`, `internal/mcpserver/mcpserver.go`**: Remove `resources_search` and `resources_read_markdown`; update `resources_list` description and MCP `serverInstructions`.
- **`internal/chat/attachments.go`, `internal/agent/types.go`, `internal/chat/stream.go`**: Stop emitting `noText` on `data-resource`; ignore legacy `noText`/`binary` keys in `ResourceAttachmentText()` and direct the model to use `sandbox_import` when inspecting attached files (or inform the user to enable the sandbox when unavailable); update `baseSystemPrompt`.

### 4.5 Frontend (`frontend/`)

- [`frontend/src/pages/resources.tsx`](../../frontend/src/pages/resources.tsx): Remove the `No text` badge, `View extracted text` menu item, and `ResourcePreviewDialog`.
- [`frontend/src/components/resources/resource-dialogs.tsx`](../../frontend/src/components/resources/resource-dialogs.tsx): Delete `ResourcePreviewDialog` and update `DeleteResourceDialog` copy.
- [`frontend/src/store/resources.ts`](../../frontend/src/store/resources.ts) & [`frontend/src/lib/resources.ts`](../../frontend/src/lib/resources.ts): Remove `fetchMarkdown`, `NO_TEXT_LABELS`, `Resource.no_text_reason`, `no_text_reason` from `RESOURCE_LIST_FIELDS`, and obsolete conversion error messages; add `.sqlite`/`.sqlite3`/`.db`, `application/vnd.sqlite3` under `Code & data`, `SQLite` label, and code icon tint.
- **Legacy chat history** ([`frontend/src/components/chat/chat-message.tsx`](../../frontend/src/components/chat/chat-message.tsx) & [`resources-tool-output.tsx`](../../frontend/src/components/chat/resources-tool-output.tsx)): Keep read-only renderers for historical `resources_read_markdown` and `resources_search` tool calls so `v0.2.x` conversations continue rendering cleanly.

### 4.6 Sandbox Image (`workavera-sandbox:4`)

- Bump `workavera-sandbox/VERSION` to `4`.
- Install pinned `@firecrawl/anydoc@0.2.5` globally in `workavera-sandbox/Dockerfile` (bundling native `linux-x64-gnu` / `linux-arm64-gnu` bindings for offline use).
- Update `LABEL org.workavera.sandbox.tools` to advertise `anydoc`.
- Add `anydoc` label and offline conversion checks in `scripts/smoke.sh` (e.g. converting a `pandoc`-generated `.docx` to Markdown).
- Update `workavera-sandbox/README.md`, `README.zh-CN.md` (including the updated `sandbox-prd` path), and `CHANGELOG.md`.

### 4.7 Documentation

- Update [self-hosting.md](../self-hosting.md) and [self-hosting.zh-CN.md](../self-hosting.zh-CN.md): remove the "Memory for document conversion" section and `anydoc_cache/` notes, update privacy notes about how the assistant accesses resources, and update default `sandbox.image` to `:4`.
- Record the changes under `## [Unreleased]` in `CHANGELOG.md`.

---

## 5. Acceptance Criteria

1. **Dependencies & build**: `go.mod` / `go.sum` contain no `go-anydoc`, `wazy`, `html-to-markdown`, or `dom`; `task build` produces a noticeably smaller binary; startup logs show no converter warm-up and no `anydoc_cache/` directory is created.
2. **Migration & compatibility**: Upgrading an existing `v0.2.1` `pb_data` succeeds cleanly; `user_resources` drops `converted_markdown`, `converted_size`, and `no_text_reason`; default `sandbox.image` moves to `:4`; existing resources remain listable, downloadable, renamable, deletable, shareable via leases, and importable into the sandbox; migration tests pass.
3. **Upload & sandbox loop**: Uploading PDF, Office, HTML, plain text, images, archives, and SQLite (`.sqlite`/`.sqlite3`/`.db`) succeeds directly; `v0.2.x` chat history with legacy attachment fields and `resources_read_markdown` / `resources_search` tool cards renders cleanly.
4. **Checks**: `task test`, frontend `pnpm typecheck` / `pnpm lint` / `pnpm build`, and `workavera-sandbox` `task test` all pass.
