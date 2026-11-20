# 移除内置 anydoc 文档转换并精简 Resources（PRD）

[English](./remove-anydoc-prd.md)

> 状态：已确认 · 目标版本：`0.3.0` · 涉及仓库：`workavera`、`workavera-sandbox`（镜像升至 `:4`）· 移动端影响：无（Android / iOS 尚未引用 `user_resources`）

---

## 1. 背景与动机

`v0.2.0` 引入 [Resources](../v0.0.1-v0.2.x/resources-prd.zh-CN.md) 时，产品采用了「上传即同步转换并落库」的方案：

- 服务端内嵌 `github.com/xusenlin/go-anydoc`（含 `6.3 MB` 的 `anydoc.wasm` 与 `wazy` WASM 运行时）以及 `html-to-markdown/v2`，在上传请求内将 PDF / Office / CSV / HTML 转为 Markdown，并将结果存入 `user_resources.converted_markdown`（单条最高 8 MB）。
- 随着同版本引入 [Per-User Docker 沙箱](../v0.0.1-v0.2.x/sandbox-prd.zh-CN.md)，并放开图片、压缩包、扫描版 PDF、加密文档等「无文本资源」后，内置转换的局限性越来越明显：

| 痛点 | 旧实现中的具体表现 |
| --- | --- |
| **二进制体积与启动内存开销巨大** | 内嵌 `6.3 MB` WASM + `wazy` 编译器；首次启动/升级/换 CPU/重建容器需在后台编译到 `anydoc_cache/`，短暂产生 **~550 MB 内存峰值**，每次转换再占约 100 MB。 |
| **有损且不完整的转换** | 丢失公式、排版、图片、多栏结构与工作表细节；提示词被迫反复警告模型「Markdown 是有损的，别信它，去沙箱看原文件」。 |
| **无法覆盖任意文件，补丁越来越多** | 为兼容扫描 PDF、加密文件、二进制文件等，被迫新增 `no_text_reason` 枚举（`binary / needs_ocr / encrypted / empty / too_complex`）、`csvToUTF8` 乱码绕过、2 并发信号量、60 秒超时和 warm-up 失败降级逻辑。 |
| **SQLite 数据库膨胀与查询负担** | 每条记录最多在 SQLite 中冗余存放 8 MB `converted_markdown`，拖大 `pb_data/data.db` 及备份体积；前后端列表查询都必须显式避开该字段。 |
| **与沙箱能力重复且弱于沙箱** | 沙箱镜像已内置 `pandoc`、`poppler-utils`（`pdftotext`/`pdftoppm`/`pdfimages`）、`qpdf`、`ocrmypdf`、`tesseract`、`openpyxl`、`python-docx`、`python-pptx`、`pypdf`、`pandas`、`duckdb` 等工具链，可直接无损处理原文件。 |

**核心理念转变**：Workavera 服务端只负责**原文件的安全存储、元数据管理、临时下载链接、以及与沙箱之间的搬运**；「如何解析、转换或抽取文件内容」属于**计算与工具执行**范畴，应放进用户沙箱，由 AI 根据任务自行决定使用什么工具（`anydoc`、`pdftotext`、`openpyxl`、`pandoc`、OCR 等）。

---

## 2. 已确定的产品选择

1. **彻底纯粹化 Resources（不提供服务端内容读取）**：
   - 删除 `resources_read_markdown` 与 `resources_search` 工具。
   - Resources 工具保留 `resources_list`（按文件名检索）、`resources_rename`、下载链接工具（Chat 专用）以及沙箱的 `sandbox_import` / `sandbox_export`。
   - 无沙箱环境（如 Docker 容器内运行或用户关闭沙箱）不提供服务端正文读取；外部 MCP 客户端对 Resources 仅保留列出（按名称）与重命名能力。
2. **一并移除 `html-to-markdown`**：
   - 彻底移除服务端一切文档/HTML 转换流水线与依赖（`github.com/xusenlin/go-anydoc`、`github.com/samyfodil/wazy`、`github.com/JohannesKaufmann/html-to-markdown/v2`、`github.com/JohannesKaufmann/dom`）。
3. **将原生 `anydoc` CLI 加入 `workavera-sandbox:4`**：
   - 在 `workavera-sandbox` 镜像中全局安装固定版本的 `@firecrawl/anydoc`（内含 `linux-x64-gnu` / `linux-arm64-gnu` 原生 napi-rs 绑定，提供全局 `anydoc` 命令），更新 `org.workavera.sandbox.tools` 标签与 `scripts/smoke.sh`。
   - 在主仓用迁移将默认 `sandbox.image` 从 `:3` 升至 `:4`（保留管理员自定义镜像），并在发布 `workavera` `0.3.0` 前先推送 `workavera-sandbox:4`。
4. **保持安全白名单，并新增 SQLite 数据库支持**：
   - 保留基于扩展名 + `mimetype.Detect` 的安全校验，继续拦截 `.svg` 等高危脚本格式，移除内部的 `conversionPath` 分类。
   - 新增 `.sqlite`、`.sqlite3`、`.db` 支持（校验魔数 `application/vnd.sqlite3`），前端归入 `Code & data` 筛选分组并显示为 `SQLite`。

---

## 3. 目标与非目标

### 目标
1. 彻底移除 `go-anydoc`、`wazy`、`html-to-markdown/v2` 与服务端上传期文档转换流水线。
2. 消除服务启动时的 550 MB WASM 编译内存峰值与 `anydoc_cache/` 运行时目录。
3. 从 `user_resources` 集合中移除 `converted_markdown`、`converted_size`、`no_text_reason` 字段，减小二进制体积与 SQLite 体积。
4. 让上传操作变为纯校验 + 哈希去重 + 落盘，即时完成且不因解析失败/超时而中断，并新增 SQLite 文件支持。
5. 将 `anydoc` CLI 放入 `workavera-sandbox:4`，由 AI 自主决定是否调用；服务端默认镜像迁至 `:4`。
6. 平滑兼容 `v0.2.0` / `v0.2.1` 升级（数据库迁移、历史对话记录渲染不报错）。

### 非目标
- 不在本期引入大模型多模态直传原文件（PDF/图片原生 File Part 透传给 LLM API）。
- 不在本期改变 Docker 部署下「禁止嵌套启动沙箱」的安全边界。
- 不在本期取消上传 MIME 安全校验或开放 `.svg`。

---

## 4. 架构与功能变更设计

### 4.1 数据模型与迁移（`migrations/`）

1. **`1786334400_remove_resource_conversion.go`**（及测试）：
   - **Up**：从 `user_resources` 集合移除 `converted_markdown`、`converted_size`、`no_text_reason`。保留 `owner`、`file`、`original_name`、`display_name`、`media_type`、`size`、`sha256`、`created`、`updated`、索引、`resource_download_leases` 与 `resources.max_file_size_mb`。
   - **Down**：恢复上述 3 个可选字段（历史转换正文无法自动恢复）。
   - 升级提示：已有 `pb_data/data.db` 删除列后不会自动缩小文件体积，管理员可按需备份并执行 `VACUUM` 回收磁盘空间。
2. **`1786420800_sandbox_image_4.go`**（及测试）：
   - 将 `configs` 中仍为 `"ghcr.io/xusenlin/workavera-sandbox:3"` 的 `sandbox.image` 升至 `"ghcr.io/xusenlin/workavera-sandbox:4"`，不覆盖管理员自定义值；同步更新 `internal/configs/sandbox.go` 的 `DefaultSandboxImage`。

### 4.2 服务端 `internal/resources/`

- **删除文件**：`internal/resources/convert.go`、`internal/resources/convert_test.go`。
- **精简 `resources.go`**：
  - 移除 `converter`、`converterStoreKey`、`MaxMarkdownSize`、启动时的 `warmInBackground()`。
  - 移除转换与正文读取错误码：`CodeUnsupportedEncoding`、`CodeConversionFailed`、`CodeConversionTimeout`、`CodeDocumentEncrypted`、`CodeDocumentMalformed`、`CodeDocumentNeedsOCR`、`CodeConvertedContentEmpty`、`CodeConvertedContentTooLarge`、`CodeResourceHasNoText`、`CodeInvalidResourceCursor`。
  - `immutableFields` 移除 `converted_markdown`、`converted_size`、`no_text_reason`；`Resource` 移除 `ConvertedSize`、`NoTextReason`；`SourceFile` 移除 `Markdown`。
- **精简 `upload.go`**：
  - 移除 `go-anydoc`、`conversionPath`、`IsBinary`、`NoText*` 常量及 `noTextReason()`。
  - `Upload()` 与 `Save()` 不再需要 `*converter` 参数；流程简化为：大小校验 → 文件名清理 → 扩展名与 `mimetype.Detect` 校验 → SHA-256 去重 → 保存记录与原文件。
  - `formats` 新增 `.sqlite`、`.sqlite3`、`.db`（`application/vnd.sqlite3`）。
- **精简 `query.go`**：
  - `summaryColumns`、`summaryRow`、`ListItem`、`Snapshot` 移除 `no_text_reason`。
  - `List()` 移除 `converted_markdown LIKE` 二级正文匹配，仅按 `display_name` 与 `original_name` 匹配，并移除 `MatchedIn`。
  - 移除 `Search()`、`Read()`、cursor HMAC 编解码、`NoTextDescription()`、`UntrustedNotice` 等正文读取代码。

### 4.3 依赖与容器构建清理

- **`go.mod` / `go.sum`**（`task tidy`）：移除 `github.com/xusenlin/go-anydoc`、`github.com/JohannesKaufmann/html-to-markdown/v2` 及传递依赖 `github.com/samyfodil/wazy`、`github.com/JohannesKaufmann/dom`；`golang.org/x/text` 退回间接依赖。
- **构建与忽略配置**：[`Dockerfile`](../../Dockerfile) 移除 `/app/anydoc_cache` 目录创建与 `chown`；`.gitignore`、`.dockerignore` 移除 `anydoc_cache`。

### 4.4 Sandbox、Chat 与 Assistant 工具

- **`internal/sandbox/transfer.go`**：
  - `Import()` 不再写入 `<name>.md` 伴生文件；`ImportResult` 移除 `MarkdownPath`、`MarkdownSize`。
  - `Export()` 移除 `resourceExportNotice`，并更新不支持类型的错误提示（纳入 SQLite 等）。
- **`internal/assistant/tools/sandbox.go`**：更新 `sandbox_import` 与 `sandbox_export` 描述，去掉 `<name>.md` 说明。
- **`internal/assistant/tools/resources.go` & `registry.go` & `internal/mcpserver/mcpserver.go`**：
  - 移除 `resources_search` 与 `resources_read_markdown` 工具。
  - 更新 `resources_list` 描述（仅按文件名列出/查找）。
  - 更新 MCP `serverInstructions`，说明 resources 提供列表与重命名。
- **`internal/chat/attachments.go` & `internal/agent/types.go` & `internal/chat/stream.go`**：
  - `canonicalParts()` 不再写入 `data["noText"]`。
  - `ResourceAttachmentText()` 忽略历史消息遗留的 `noText` / `binary`，统一告知模型：文件内容未包含在消息中，需要查看或处理时请调用 `sandbox_import` 导入沙箱后使用沙箱工具分析（若未启用沙箱则告知用户启用沙箱）。
  - 更新 `baseSystemPrompt` 中 Resources 与附件规则，去掉所有 `converted Markdown` / `resources_read_markdown` / `resources_search` 描述。

### 4.5 前端（`frontend/`）

- [`frontend/src/pages/resources.tsx`](../../frontend/src/pages/resources.tsx)：移除 `No text` Badge、`View extracted text` 菜单项与 `ResourcePreviewDialog` 调用。
- [`frontend/src/components/resources/resource-dialogs.tsx`](../../frontend/src/components/resources/resource-dialogs.tsx)：删除 `ResourcePreviewDialog`，更新 `DeleteResourceDialog` 文案。
- [`frontend/src/store/resources.ts`](../../frontend/src/store/resources.ts) & [`frontend/src/lib/resources.ts`](../../frontend/src/lib/resources.ts)：移除 `fetchMarkdown`、`NO_TEXT_LABELS`、`Resource.no_text_reason`、`RESOURCE_LIST_FIELDS` 中的 `no_text_reason` 及废弃的转换错误码文案；新增 `.sqlite`/`.sqlite3`/`.db` 扩展名、`application/vnd.sqlite3` 类型筛选、`SQLite` 标签与图标色系。
- **历史会话兼容**（[`frontend/src/components/chat/chat-message.tsx`](../../frontend/src/components/chat/chat-message.tsx) & [`resources-tool-output.tsx`](../../frontend/src/components/chat/resources-tool-output.tsx)）：保留 `resources_read_markdown` / `resources_search` 工具卡片的只读渲染器（标明 legacy compatibility），避免查看 `v0.2.x` 历史对话时报错。

### 4.6 沙箱镜像（`workavera-sandbox:4`）

- 将 `workavera-sandbox/VERSION` 升至 `4`。
- 在 `workavera-sandbox/Dockerfile` 中固定版本全局安装 `@firecrawl/anydoc@0.2.5`（含原生 `linux-x64-gnu` / `linux-arm64-gnu` 绑定，离线可用）。
- 更新 `LABEL org.workavera.sandbox.tools`，声明 `anydoc` CLI。
- 在 `scripts/smoke.sh` 中增加 `anydoc` CLI 的标签检查与离线文档转换冒烟测试（如用 `pandoc` 生成 `.docx` 再用 `anydoc` 转 Markdown 验证）。
- 同步更新 `workavera-sandbox/README.md`、`README.zh-CN.md`（包含 `sandbox-prd` 路径更新）及 `CHANGELOG.md`。

### 4.7 文档更新

- 更新 [self-hosting.md](../self-hosting.md) / [self-hosting.zh-CN.md](../self-hosting.zh-CN.md)：移除「文件转换的内存需求」整节与 `anydoc_cache/` 说明，更新数据隐私说明及默认 `sandbox.image` 为 `:4`。
- 更新 `CHANGELOG.md` 的 `## [Unreleased]`：记录移除内置转换、`user_resources` 字段变更、新增 SQLite 文件支持、默认沙箱镜像升至 `:4`，以及旧 `anydoc_cache/` 目录可安全删除的提示。

---

## 5. 验收标准

1. **依赖与构建**：`go.mod` / `go.sum` 不再包含 `go-anydoc`、`wazy`、`html-to-markdown`、`dom`；`task build` 二进制体积明显下降；启动日志无任何 converter warm-up 或 `anydoc_cache` 目录生成。
2. **迁移与数据兼容**：从 `v0.2.1` 的 `pb_data` 升级启动无报错，`user_resources` 不再包含 `converted_markdown`、`converted_size`、`no_text_reason`，默认 `sandbox.image` 升至 `:4`；原有资源可正常列表、打开、下载、重命名、删除、建下载链接与导入沙箱；迁移测试通过。
3. **上传与沙箱闭环**：上传 PDF、Office、HTML、纯文本、图片、压缩包与 SQLite（`.sqlite`/`.sqlite3`/`.db`）均直接成功保存；`v0.2.x` 历史对话中的旧附件与旧工具卡片可正常渲染。
4. **全量验证**：`task test`、`frontend/` 下 `pnpm typecheck` / `pnpm lint` / `pnpm build`，以及 `workavera-sandbox` 下 `task test` 全部通过。
