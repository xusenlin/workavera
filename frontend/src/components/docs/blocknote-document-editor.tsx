import { useCallback, useEffect, useRef, useState } from "react"

import { type PartialBlock } from "@blocknote/core"
import {
  BasicTextStyleButton,
  BlockTypeSelect,
  CreateLinkButton,
  FormattingToolbar,
  FormattingToolbarController,
  SideMenu,
  SideMenuController,
  useCreateBlockNote,
} from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import "@blocknote/shadcn/style.css"

import { useMarkdownBlockTypeItems } from "@/components/docs/doc-editor-block-types"
import { docEditorSchema } from "@/components/docs/doc-editor-schema"
import { DocDragHandleMenu } from "@/components/docs/doc-editor-side-menu"
import { useTheme } from "@/components/theme-provider"
import { Textarea } from "@/components/ui/textarea"

export type DocumentEditorMode = "rich-text" | "source"

function useResolvedTheme(): "light" | "dark" {
  const { theme } = useTheme()
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const update = () => setSystemTheme(mediaQuery.matches ? "dark" : "light")
    mediaQuery.addEventListener("change", update)
    return () => mediaQuery.removeEventListener("change", update)
  }, [])

  return theme === "system" ? systemTheme : theme
}

export function BlockNoteDocumentEditor({
  value,
  mode,
  onChange,
}: {
  value: string
  mode: DocumentEditorMode
  onChange: (markdown: string) => void
}) {
  return (
    <div className="workavera-doc-editor">
      {mode === "rich-text" ? (
        <RichTextArea value={value} onChange={onChange} />
      ) : (
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Markdown source"
          className="doc-source-area"
          spellCheck={false}
        />
      )}
    </div>
  )
}

function RichTextArea({
  value,
  onChange,
}: {
  value: string
  onChange: (markdown: string) => void
}) {
  const editor = useCreateBlockNote({ schema: docEditorSchema })
  const resolvedTheme = useResolvedTheme()
  // Markdown the editor last produced or received; external `value` changes
  // (doc load, version restore, source-mode edits) are re-parsed into blocks,
  // while our own onChange emissions are recognized and skipped.
  const lastMarkdown = useRef<string | null>(null)
  const applyingExternal = useRef(0)
  const serializeSeq = useRef(0)

  useEffect(() => {
    if (value === lastMarkdown.current) return
    let cancelled = false
    void (async () => {
      const blocks = await editor.tryParseMarkdownToBlocks(value)
      if (cancelled) return
      const nextBlocks: PartialBlock<typeof docEditorSchema.blockSchema>[] =
        blocks.length > 0 ? blocks : [{ type: "paragraph" }]
      applyingExternal.current++
      lastMarkdown.current = value
      try {
        editor.replaceBlocks(editor.document, nextBlocks)
      } finally {
        // BlockNote may emit change events asynchronously after the
        // replacement transaction, so release the guard on the next tick.
        setTimeout(() => {
          applyingExternal.current--
        }, 0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editor, value])

  const emitMarkdown = useCallback(async () => {
    if (applyingExternal.current > 0) return
    const seq = ++serializeSeq.current
    const markdown = await editor.blocksToMarkdownLossy(editor.document)
    if (seq !== serializeSeq.current) return
    lastMarkdown.current = markdown
    onChange(markdown)
  }, [editor, onChange])

  return (
    <BlockNoteView
      editor={editor}
      theme={resolvedTheme}
      onChange={() => void emitMarkdown()}
      formattingToolbar={false}
      sideMenu={false}
      className="doc-rich-area"
    >
      {/* Only Markdown-safe formatting actions; the default toolbar also
          offers colors and alignment, which Markdown cannot persist. */}
      <FormattingToolbarController
        formattingToolbar={() => <DocFormattingToolbar />}
      />
      <SideMenuController
        sideMenu={(props) => (
          <SideMenu {...props} dragHandleMenu={DocDragHandleMenu} />
        )}
      />
    </BlockNoteView>
  )
}

function DocFormattingToolbar() {
  const blockTypeItems = useMarkdownBlockTypeItems()
  return (
    <FormattingToolbar>
      <BlockTypeSelect items={blockTypeItems} key="blockTypeSelect" />
      <BasicTextStyleButton basicTextStyle="bold" key="bold" />
      <BasicTextStyleButton basicTextStyle="italic" key="italic" />
      <BasicTextStyleButton basicTextStyle="strike" key="strike" />
      <BasicTextStyleButton basicTextStyle="code" key="code" />
      <CreateLinkButton key="link" />
    </FormattingToolbar>
  )
}
