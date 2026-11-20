import { HugeiconsIcon } from "@hugeicons/react"
import {
  File02Icon,
  FileAttachmentIcon,
  FileZipIcon,
  Image01Icon,
  Pdf01Icon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons"

import { resourceTypeTone } from "@/lib/resources"
import { cn } from "@/lib/utils"

function iconFor(mediaType: string) {
  if (mediaType === "application/pdf") return Pdf01Icon
  if (mediaType.startsWith("image/")) return Image01Icon
  if (
    mediaType === "application/zip" ||
    mediaType === "application/x-tar" ||
    mediaType === "application/gzip" ||
    mediaType === "application/x-7z-compressed"
  )
    return FileZipIcon
  if (mediaType.startsWith("text/x-") || mediaType === "text/javascript")
    return SourceCodeIcon
  if (
    mediaType === "text/html" ||
    mediaType.includes("json") ||
    mediaType === "application/vnd.sqlite3"
  )
    return SourceCodeIcon
  if (mediaType.startsWith("text/")) return File02Icon
  return FileAttachmentIcon
}

export function ResourceIcon({
  mediaType,
  className,
}: {
  mediaType: string
  className?: string
}) {
  return (
    <HugeiconsIcon
      icon={iconFor(mediaType)}
      strokeWidth={2}
      className={cn("size-4 shrink-0", className)}
    />
  )
}

/** A small tinted square identifying a file's type. */
export function ResourceTypeTile({
  mediaType,
  name,
  className,
  iconClassName,
}: {
  mediaType: string
  name: string
  className?: string
  iconClassName?: string
}) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md",
        resourceTypeTone(mediaType, name),
        className
      )}
    >
      <ResourceIcon mediaType={mediaType} className={iconClassName} />
    </span>
  )
}
