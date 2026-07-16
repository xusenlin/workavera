import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ChangeEvent,
} from "react"

import { type PartialBlock } from "@blocknote/core"
import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from "@blocknote/core/extensions"
import {
  Attachment01Icon,
  Download01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  BasicTextStyleButton,
  BlockTypeSelect,
  CreateLinkButton,
  DeleteLinkButton,
  EditLinkButton,
  FormattingToolbar,
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  LinkToolbar,
  LinkToolbarController,
  OpenLinkButton,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  useCreateBlockNote,
  useComponentsContext,
  type DefaultReactSuggestionItem,
  type LinkToolbarProps,
} from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import "@blocknote/shadcn/style.css"
import { toast } from "sonner"

import { useMarkdownBlockTypeItems } from "@/components/docs/doc-editor-block-types"
import { promoteDocAttachmentLinks } from "@/components/docs/doc-attachment-inline"
import { docEditorSchema } from "@/components/docs/doc-editor-schema"
import { DocDragHandleMenu } from "@/components/docs/doc-editor-side-menu"
import { SourceCodeEditor } from "@/components/docs/source-code-editor"
import {
  DOC_ASSET_ACCEPT,
  docAssetDownloadURL,
  isDocAssetURL,
  isSupportedDocImage,
  openDocAssetDownload,
  resolveDocAssetURL,
  uploadDocAsset,
} from "@/lib/doc-assets"
import { extractErrorMessage } from "@/lib/error"
import { useResolvedTheme } from "@/lib/use-resolved-theme"

export type DocumentEditorMode = "rich-text" | "source"

export function BlockNoteDocumentEditor({
  docId,
  value,
  mode,
  onChange,
}: {
  docId: string
  value: string
  mode: DocumentEditorMode
  onChange: (markdown: string) => void
}) {
  return (
    <div className="workavera-doc-editor">
      {mode === "rich-text" ? (
        <RichTextArea docId={docId} value={value} onChange={onChange} />
      ) : (
        <SourceCodeEditor language="markdown" value={value} onChange={onChange} />
      )}
    </div>
  )
}

function RichTextArea({
  docId,
  value,
  onChange,
}: {
  docId: string
  value: string
  onChange: (markdown: string) => void
}) {
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const editor = useCreateBlockNote(
    {
      schema: docEditorSchema,
      uploadFile: async (file) => {
        if (!isSupportedDocImage(file)) {
          throw new Error("Choose a PNG, JPEG, WebP, or GIF image.")
        }
        return (await uploadDocAsset(docId, file)).url
      },
      resolveFileUrl: resolveDocAssetURL,
      links: {
        onClick: (event) => {
          const target = event.target
          if (!(target instanceof Element)) return false
          const href = target
            .closest<HTMLAnchorElement>("a[href]")
            ?.getAttribute("href")
          if (!href || !isDocAssetURL(href)) return false
          event.preventDefault()
          openProtectedDocAsset(href)
          return true
        },
      },
    },
    [docId]
  )
  const resolvedTheme = useResolvedTheme()
  // Markdown the editor last produced or received; external `value` changes
  // (doc load, version restore, source-mode edits) are re-parsed into blocks,
  // while our own onChange emissions are recognized and skipped.
  const lastMarkdown = useRef<string | null>(null)
  const applyingExternal = useRef(0)
  const serializeSeq = useRef(0)

  // Invalidate in-flight serializations on unmount: switching documents
  // remounts this editor (and HTML documents render no editor at all), and a
  // late async onChange from the old instance would otherwise clobber the
  // freshly loaded document's draft with the previous document's Markdown.
  useEffect(() => {
    const seq = serializeSeq
    return () => {
      seq.current++
    }
  }, [])

  useEffect(() => {
    if (value === lastMarkdown.current) return
    let cancelled = false
    void (async () => {
      const blocks = promoteDocAttachmentLinks(
        await editor.tryParseMarkdownToBlocks(value)
      )
      if (cancelled) return
      const nextBlocks: PartialBlock<
        typeof docEditorSchema.blockSchema,
        typeof docEditorSchema.inlineContentSchema,
        typeof docEditorSchema.styleSchema
      >[] = blocks.length > 0 ? blocks : [{ type: "paragraph" }]
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

  const openAttachmentPicker = useCallback(() => {
    attachmentInputRef.current?.click()
  }, [])

  const slashMenuItems = useMemo<DefaultReactSuggestionItem[]>(
    () => {
      const defaultItems = (
        getDefaultReactSlashMenuItems(editor) as Array<
          DefaultReactSuggestionItem & { key?: string }
        >
      ).filter((item) => !item.key?.startsWith("toggle_"))
      const imageIndex = defaultItems.findIndex((item) => item.key === "image")
      const attachmentItem: DefaultReactSuggestionItem = {
        title: "Attach file",
        subtext: "Upload a file and insert a download link",
        aliases: ["file", "attachment", "upload"],
        group: defaultItems[imageIndex]?.group ?? "Media",
        icon: <HugeiconsIcon icon={Attachment01Icon} strokeWidth={2} />,
        onItemClick: () => {
          insertOrUpdateBlockForSlashMenu(editor, { type: "paragraph" })
          openAttachmentPicker()
        },
      }

      if (imageIndex < 0) {
        return [...defaultItems, attachmentItem]
      }

      return [
        ...defaultItems.slice(0, imageIndex + 1),
        attachmentItem,
        ...defaultItems.slice(imageIndex + 1),
      ]
    },
    [editor, openAttachmentPicker]
  )

  const uploadAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    try {
      const asset = await uploadDocAsset(docId, file)
      editor.insertInlineContent(
        [
          {
            type: "docAttachment",
            props: {
              url: docAssetDownloadURL(asset.url),
              name: asset.name,
            },
          },
        ],
        { updateSelection: true }
      )
      editor.focus()
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not attach the file."))
    }
  }

  return (
    <>
      <input
        ref={attachmentInputRef}
        type="file"
        accept={DOC_ASSET_ACCEPT}
        hidden
        onChange={(event) => void uploadAttachment(event)}
      />
      <BlockNoteView
        editor={editor}
        theme={resolvedTheme}
        onChange={() => void emitMarkdown()}
        formattingToolbar={false}
        linkToolbar={false}
        slashMenu={false}
        sideMenu={false}
        className="doc-rich-area"
      >
        {/* Only Markdown-safe formatting actions; the default toolbar also
            offers colors and alignment, which Markdown cannot persist. */}
        <FormattingToolbarController
          formattingToolbar={() => <DocFormattingToolbar />}
        />
        <LinkToolbarController linkToolbar={DocLinkToolbar} />
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(slashMenuItems, query)
          }
        />
        <SideMenuController
          sideMenu={(props) => (
            <SideMenu {...props} dragHandleMenu={DocDragHandleMenu} />
          )}
        />
      </BlockNoteView>
    </>
  )
}

function DocLinkToolbar(props: LinkToolbarProps) {
  return (
    <LinkToolbar {...props}>
      <EditLinkButton {...props} />
      {isDocAssetURL(props.url) ? (
        <OpenDocAssetButton url={props.url} />
      ) : (
        <OpenLinkButton url={props.url} />
      )}
      <DeleteLinkButton {...props} />
    </LinkToolbar>
  )
}

function OpenDocAssetButton({ url }: { url: string }) {
  const Components = useComponentsContext()!

  return (
    <Components.LinkToolbar.Button
      className="bn-button"
      label="Download file"
      mainTooltip="Download file"
      isSelected={false}
      onClick={() => openProtectedDocAsset(url)}
      icon={<HugeiconsIcon icon={Download01Icon} strokeWidth={2} />}
    />
  )
}

function openProtectedDocAsset(href: string) {
  void openDocAssetDownload(href)
    .catch((error) => {
      toast.error(extractErrorMessage(error, "Could not download the file."))
    })
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
