import { BlockNoteEditor } from "@blocknote/core"

import { docEditorSchema } from "./doc-editor-schema"

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

/** Convert doc Markdown to a self-contained HTML file for export. */
export async function documentMarkdownToStandaloneHtml(
  markdown: string,
  title: string
): Promise<string> {
  const editor = BlockNoteEditor.create({ schema: docEditorSchema })
  const blocks = await editor.tryParseMarkdownToBlocks(markdown)
  const body = editor.blocksToHTMLLossy(blocks)
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { max-width: 720px; margin: 3rem auto; padding: 0 1.5rem; font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.7; color: #1f2328; }
  pre { padding: 1rem; overflow-x: auto; border-radius: 8px; background: #f6f8fa; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; }
  table { border-collapse: collapse; }
  th, td { padding: 0.4rem 0.6rem; border: 1px solid #d1d9e0; text-align: left; }
  th { background: #f6f8fa; }
  blockquote { margin: 0; padding-left: 1rem; border-left: 3px solid #d1d9e0; color: #59636e; }
  img { max-width: 100%; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>
`
}
