import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react"

import {
  Download01Icon,
  File01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "sonner"

import {
  getDocAssetMetadata,
  openDocAssetDownload,
  type DocAssetMetadata,
} from "@/lib/doc-assets"
import { extractErrorMessage } from "@/lib/error"

export function DocAttachmentCard({
  inlineContent,
}: {
  inlineContent: { props: { name: string; url: string } }
}) {
  const { name, url } = inlineContent.props
  const [metadata, setMetadata] = useState<DocAssetMetadata>()

  useEffect(() => {
    let cancelled = false
    void getDocAssetMetadata(url)
      .then((asset) => {
        if (!cancelled) setMetadata(asset)
      })
      .catch(() => {
        // The card remains usable with the name stored in Markdown when
        // metadata cannot be loaded (for example after access is revoked).
      })
    return () => {
      cancelled = true
    }
  }, [url])

  const download = () => {
    void openDocAssetDownload(url).catch((error) => {
      toast.error(extractErrorMessage(error, "Could not download the file."))
    })
  }
  const activateWithKeyboard = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    download()
  }
  const keepEditorSelection = (event: MouseEvent<HTMLSpanElement>) => {
    event.preventDefault()
  }

  return (
    <span
      className="doc-attachment-card"
      role="button"
      tabIndex={0}
      aria-label={`Download ${name}`}
      contentEditable={false}
      onMouseDown={keepEditorSelection}
      onClick={download}
      onKeyDown={activateWithKeyboard}
    >
      <span className="doc-attachment-icon" aria-hidden="true">
        <HugeiconsIcon icon={File01Icon} strokeWidth={1.8} />
      </span>
      <span className="doc-attachment-details">
        <span className="doc-attachment-name">{name}</span>
        <span className="doc-attachment-meta">
          {fileTypeLabel(metadata?.mediaType, name)}
          {metadata ? ` · ${formatFileSize(metadata.size)}` : ""}
          {metadata?.created ? ` · ${formatCreatedAt(metadata.created)}` : ""}
        </span>
      </span>
      <span className="doc-attachment-download" aria-hidden="true">
        <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
        <span className="doc-attachment-download-label">Download</span>
      </span>
    </span>
  )
}

function fileTypeLabel(mediaType: string | undefined, name: string): string {
  const extension = name.split(".").pop()?.toUpperCase()
  if (extension && extension !== name.toUpperCase() && extension.length <= 5) {
    return extension
  }
  if (mediaType === "application/pdf") return "PDF"
  if (mediaType?.startsWith("text/")) return "TEXT"
  return "FILE"
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = units[0]
  for (let index = 1; value >= 1024 && index < units.length; index++) {
    value /= 1024
    unit = units[index]
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`
}

function formatCreatedAt(value: string): string {
  const created = new Date(value)
  if (Number.isNaN(created.getTime())) return ""
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(created)
}
