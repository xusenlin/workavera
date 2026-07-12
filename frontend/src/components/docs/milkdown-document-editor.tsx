import { useEffect, useRef, useState } from "react"

import { Crepe } from "@milkdown/crepe"
import "@milkdown/crepe/theme/common/reset.css"
import "@milkdown/crepe/theme/common/prosemirror.css"
import "@milkdown/crepe/theme/common/cursor.css"
import "@milkdown/crepe/theme/common/link-tooltip.css"
import "@milkdown/crepe/theme/common/list-item.css"
import "@milkdown/crepe/theme/common/table.css"
import "@milkdown/crepe/theme/common/code-mirror.css"
import "@milkdown/crepe/theme/common/placeholder.css"
import {
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark"
import { insertTableCommand } from "@milkdown/kit/preset/gfm"
import { redoCommand, undoCommand } from "@milkdown/kit/plugin/history"
import { callCommand, getMarkdown, replaceAll } from "@milkdown/kit/utils"
import {
  Milkdown,
  MilkdownProvider,
  useEditor,
  useInstance,
} from "@milkdown/react"
import { diffLines } from "diff"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CodeIcon,
  FileDiffIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  Maximize01Icon,
  MinusSignIcon,
  Minimize01Icon,
  QuoteDownIcon,
  RedoIcon,
  SourceCodeIcon,
  TableIcon,
  TextBoldIcon,
  TextIcon,
  TextItalicIcon,
  UndoIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export type DocumentEditorMode = "rich-text" | "source" | "diff"

export function MilkdownDocumentEditor({
  value,
  savedValue,
  mode,
  onModeChange,
  onChange,
}: {
  value: string
  savedValue: string
  mode: DocumentEditorMode
  onModeChange: (mode: DocumentEditorMode) => void
  onChange: (markdown: string) => void
}) {
  return (
    <MilkdownProvider>
      <MilkdownEditorBody
        value={value}
        savedValue={savedValue}
        mode={mode}
        onModeChange={onModeChange}
        onChange={onChange}
      />
    </MilkdownProvider>
  )
}

function MilkdownEditorBody({
  value,
  savedValue,
  mode,
  onModeChange,
  onChange,
}: {
  value: string
  savedValue: string
  mode: DocumentEditorMode
  onModeChange: (mode: DocumentEditorMode) => void
  onChange: (markdown: string) => void
}) {
  const editorRootRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const updateFullscreen = () => {
      setFullscreen(document.fullscreenElement === editorRootRef.current)
    }
    document.addEventListener("fullscreenchange", updateFullscreen)
    return () =>
      document.removeEventListener("fullscreenchange", updateFullscreen)
  }, [])

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === editorRootRef.current) {
      await document.exitFullscreen()
      return
    }
    await editorRootRef.current?.requestFullscreen()
  }

  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: value,
      features: {
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.TopBar]: false,
        [Crepe.Feature.AI]: false,
        [Crepe.Feature.ImageBlock]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.BlockEdit]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: "Start writing…",
        },
      },
    })
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, previousMarkdown) => {
        if (markdown !== previousMarkdown) onChange(markdown)
      })
    })
    return crepe
  }, [])

  return (
    <div ref={editorRootRef} className="workavera-milkdown-editor">
      <MilkdownToolbar
        mode={mode}
        fullscreen={fullscreen}
        onModeChange={onModeChange}
        onToggleFullscreen={() => void toggleFullscreen()}
      />
      <MilkdownValueSync value={value} />
      <div
        className={cn("milkdown-rich-area", mode !== "rich-text" && "hidden")}
      >
        <Milkdown />
      </div>
      {mode === "source" && (
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Markdown source"
          className="milkdown-source-area"
          spellCheck={false}
        />
      )}
      {mode === "diff" && <MarkdownDiff before={savedValue} after={value} />}
    </div>
  )
}

function MilkdownValueSync({ value }: { value: string }) {
  const [loading, getEditor] = useInstance()
  useEffect(() => {
    if (loading) return
    const editor = getEditor()
    if (editor.action(getMarkdown()) !== value) {
      editor.action(replaceAll(value))
    }
  }, [getEditor, loading, value])
  return null
}

function MilkdownToolbar({
  mode,
  fullscreen,
  onModeChange,
  onToggleFullscreen,
}: {
  mode: DocumentEditorMode
  fullscreen: boolean
  onModeChange: (mode: DocumentEditorMode) => void
  onToggleFullscreen: () => void
}) {
  const [loading, getEditor] = useInstance()
  const run = (command: { key: unknown }, payload?: unknown) => {
    if (loading || mode !== "rich-text") return
    getEditor().action(callCommand(command.key as never, payload as never))
  }
  const disabled = loading || mode !== "rich-text"

  return (
    <div className="milkdown-system-toolbar">
      <ToolbarButton
        label="Undo"
        disabled={disabled}
        onClick={() => run(undoCommand)}
        icon={UndoIcon}
      />
      <ToolbarButton
        label="Redo"
        disabled={disabled}
        onClick={() => run(redoCommand)}
        icon={RedoIcon}
      />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Select
        disabled={disabled}
        onValueChange={(value) => {
          if (value === "paragraph") run(turnIntoTextCommand)
          else run(wrapInHeadingCommand, Number(value.slice(1)))
        }}
      >
        <SelectTrigger
          size="sm"
          className="h-8 w-28 border-0 bg-transparent shadow-none"
        >
          <SelectValue placeholder="Paragraph" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="paragraph">Paragraph</SelectItem>
          <SelectItem value="h1">Heading 1</SelectItem>
          <SelectItem value="h2">Heading 2</SelectItem>
          <SelectItem value="h3">Heading 3</SelectItem>
        </SelectContent>
      </Select>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolbarButton
        label="Bold"
        disabled={disabled}
        onClick={() => run(toggleStrongCommand)}
        icon={TextBoldIcon}
      />
      <ToolbarButton
        label="Italic"
        disabled={disabled}
        onClick={() => run(toggleEmphasisCommand)}
        icon={TextItalicIcon}
      />
      <ToolbarButton
        label="Inline code"
        disabled={disabled}
        onClick={() => run(toggleInlineCodeCommand)}
        icon={CodeIcon}
      />
      <ToolbarButton
        label="Link"
        disabled={disabled}
        onClick={() => {
          const href = window.prompt("Link URL")?.trim()
          if (href) run(toggleLinkCommand, { href })
        }}
        icon={Link01Icon}
      />
      <ToolbarButton
        label="Bullet list"
        disabled={disabled}
        onClick={() => run(wrapInBulletListCommand)}
        icon={LeftToRightListBulletIcon}
      />
      <ToolbarButton
        label="Numbered list"
        disabled={disabled}
        onClick={() => run(wrapInOrderedListCommand)}
        icon={LeftToRightListNumberIcon}
      />
      <ToolbarButton
        label="Quote"
        disabled={disabled}
        onClick={() => run(wrapInBlockquoteCommand)}
        icon={QuoteDownIcon}
      />
      <ToolbarButton
        label="Code block"
        disabled={disabled}
        onClick={() => run(createCodeBlockCommand)}
        icon={SourceCodeIcon}
      />
      <ToolbarButton
        label="Table"
        disabled={disabled}
        onClick={() => run(insertTableCommand, { row: 3, col: 3 })}
        icon={TableIcon}
      />
      <ToolbarButton
        label="Divider"
        disabled={disabled}
        onClick={() => run(insertHrCommand)}
        icon={MinusSignIcon}
      />
      <div className="ml-auto flex items-center gap-0.5">
        <ModeButton
          label="Rich text"
          active={mode === "rich-text"}
          onClick={() => onModeChange("rich-text")}
          icon={TextIcon}
        />
        <ModeButton
          label="Source"
          active={mode === "source"}
          onClick={() => onModeChange("source")}
          icon={SourceCodeIcon}
        />
        <ModeButton
          label="Diff"
          active={mode === "diff"}
          onClick={() => onModeChange("diff")}
          icon={FileDiffIcon}
        />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolbarButton
          label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          onClick={onToggleFullscreen}
          icon={fullscreen ? Minimize01Icon : Maximize01Icon}
        />
      </div>
    </div>
  )
}

function ToolbarButton({
  label,
  icon,
  ...props
}: { label: string; icon: typeof UndoIcon } & React.ComponentProps<
  typeof Button
>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label}
      {...props}
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
    </Button>
  )
}

function ModeButton({
  label,
  active,
  icon,
  onClick,
}: {
  label: string
  active: boolean
  icon: typeof TextIcon
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
    </Button>
  )
}

function MarkdownDiff({ before, after }: { before: string; after: string }) {
  const changes = diffLines(before, after)
  return (
    <pre className="milkdown-diff-area" aria-label="Markdown changes">
      {changes.map((change, index) => (
        <span
          key={`${index}-${change.value.length}`}
          className={cn(
            "block px-5 py-0.5 whitespace-pre-wrap",
            change.added &&
              "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
            change.removed &&
              "bg-red-500/15 text-red-800 line-through dark:text-red-300"
          )}
        >
          {change.value}
        </span>
      ))}
    </pre>
  )
}
