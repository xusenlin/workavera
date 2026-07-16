import { html } from "@codemirror/lang-html"
import { markdown } from "@codemirror/lang-markdown"
import CodeMirror, { EditorView } from "@uiw/react-codemirror"

import { useResolvedTheme } from "@/lib/use-resolved-theme"

/**
 * Shared source-code editor for document source modes: CodeMirror with line
 * numbers, syntax highlighting, and the app light/dark theme. Used for both
 * Markdown source editing and HTML documents.
 */
export function SourceCodeEditor({
  language,
  value,
  onChange,
}: {
  language: "markdown" | "html"
  value: string
  onChange: (value: string) => void
}) {
  const theme = useResolvedTheme()
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={theme}
      height="100%"
      className="doc-code-editor"
      extensions={[
        language === "html" ? html() : markdown(),
        EditorView.lineWrapping,
      ]}
    />
  )
}
