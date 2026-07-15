import {
  BlockNoteSchema,
  createCodeBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
  type CodeBlockOptions,
} from "@blocknote/core"
import { createParser } from "prosemirror-highlight/shiki"

import { bundledLanguagesInfo, createHighlighter } from "@/lib/shiki-lite"
import { docAttachmentInlineSpec } from "@/components/docs/doc-attachment-inline"

// Highlighting reuses the curated shiki bundle shared with the chat
// renderer, so doc code blocks add no new grammar chunks to the build.
const codeBlockOptions = {
  defaultLanguage: "text",
  supportedLanguages: {
    text: { name: "Plain Text", aliases: ["text", "txt", "plain"] },
    ...Object.fromEntries(
      bundledLanguagesInfo.map((lang) => [
        lang.id,
        {
          name: lang.name,
          aliases: "aliases" in lang ? [...lang.aliases] : undefined,
        },
      ])
    ),
  },
  // The app ships shiki v3 while BlockNote's types target shiki v4; the
  // runtime surface BlockNote uses (codeToTokens, loadLanguage,
  // getLoadedLanguages, getLoadedThemes) is identical in both.
  createHighlighter: () =>
    createDocCodeHighlighter() as unknown as ReturnType<
      NonNullable<CodeBlockOptions["createHighlighter"]>
    >,
} satisfies CodeBlockOptions

function createDocCodeHighlighter() {
  const highlighterPromise = createHighlighter({
    themes: ["github-light", "github-dark"],
    langs: [],
  })
  // BlockNote's built-in token parser renders with a single fixed theme. It
  // checks a global registry first, so pre-seed it with a dual-theme parser:
  // tokens then carry github-light colors inline plus --shiki-dark variables
  // that index.css switches on in dark mode. Registered via promise.then
  // before BlockNote's own .then, so it wins the initialization order.
  void highlighterPromise.then((highlighter) => {
    const shikiGlobals = globalThis as Record<symbol, unknown>
    shikiGlobals[Symbol.for("blocknote.shikiParser")] ??= createParser(
      // Same shiki v3-value / v4-types bridge as createHighlighter above.
      highlighter as unknown as Parameters<typeof createParser>[0],
      { themes: { light: "github-light", dark: "github-dark" } }
    )
  })
  return highlighterPromise
}

// Docs are persisted as Markdown, so the schema keeps only blocks and styles
// that survive the Markdown round-trip. Underline, colors, toggle lists and
// audio/video/file blocks would silently disappear on save.
export const docEditorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    quote: defaultBlockSpecs.quote,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    table: defaultBlockSpecs.table,
    image: defaultBlockSpecs.image,
    divider: defaultBlockSpecs.divider,
    codeBlock: createCodeBlockSpec(codeBlockOptions),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    docAttachment: docAttachmentInlineSpec,
  },
  styleSpecs: {
    bold: defaultStyleSpecs.bold,
    italic: defaultStyleSpecs.italic,
    strike: defaultStyleSpecs.strike,
    code: defaultStyleSpecs.code,
  },
})
