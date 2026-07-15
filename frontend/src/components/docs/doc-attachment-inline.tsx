import { createReactInlineContentSpec } from "@blocknote/react"

import { DocAttachmentCard } from "@/components/docs/doc-attachment-card"
import {
  docAssetDownloadURL,
  isDocAssetURL,
} from "@/lib/doc-assets"

export const docAttachmentInlineSpec = createReactInlineContentSpec(
  {
    type: "docAttachment",
    propSchema: {
      url: { default: "" },
      name: { default: "Attachment" },
    },
    content: "none",
  },
  {
    runsBefore: ["link"],
    parse: (element) => {
      if (!(element instanceof HTMLAnchorElement)) return undefined
      const href = element.getAttribute("href") ?? ""
      if (!isDocAssetURL(href)) return undefined
      return {
        url: docAssetDownloadURL(href),
        name: element.textContent?.trim() || "Attachment",
      }
    },
    render: DocAttachmentCard,
    toExternalHTML: ({ inlineContent }) => (
      <a href={docAssetDownloadURL(inlineContent.props.url)}>
        {inlineContent.props.name}
      </a>
    ),
  }
)

export function promoteDocAttachmentLinks<T>(value: T): T {
  return promoteValue(value) as T
}

function promoteValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(promoteValue)
  if (!value || typeof value !== "object") return value

  const record = value as Record<string, unknown>
  if (
    record.type === "link" &&
    typeof record.href === "string" &&
    isDocAssetURL(record.href)
  ) {
    return {
      type: "docAttachment",
      props: {
        url: docAssetDownloadURL(record.href),
        name: inlineText(record.content) || "Attachment",
      },
    }
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, promoteValue(entry)])
  )
}

function inlineText(value: unknown): string {
  if (Array.isArray(value)) return value.map(inlineText).join("")
  if (!value || typeof value !== "object") return ""
  const record = value as Record<string, unknown>
  return typeof record.text === "string" ? record.text : inlineText(record.content)
}
