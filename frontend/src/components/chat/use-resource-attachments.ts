import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { isRequestAbort } from "@/lib/error"
import { pb } from "@/lib/pocketbase"
import {
  MAX_MESSAGE_RESOURCES,
  RESOURCE_LIST_FIELDS,
  RESOURCES_COLLECTION,
  resourceErrorMessage,
  uploadResource,
  useResourceMaxSize,
  validateResourceFile,
  type Resource,
} from "@/lib/resources"
import { resourceNameFilter } from "@/store/resources"

export type InputAttachment = {
  key: string
  status: "uploading" | "ready" | "error"
  name: string
  mediaType: string
  size: number
  resourceId?: string
  error?: string
  file?: File
}

function readyAttachment(resource: Resource): InputAttachment {
  return {
    key: resource.id,
    status: "ready",
    name: resource.display_name,
    mediaType: resource.media_type,
    size: resource.size,
    resourceId: resource.id,
  }
}

/**
 * The resources a message under composition references. Files are uploaded as
 * soon as they are added, so a message only ever references resources that
 * already exist; removing a chip drops the reference, never the resource.
 */
export function useResourceAttachments() {
  const [attachments, setAttachments] = useState<InputAttachment[]>([])
  const maxSize = useResourceMaxSize()

  const full = attachments.length >= MAX_MESSAGE_RESOURCES
  const uploading = attachments.some((item) => item.status === "uploading")
  const ready = attachments.filter((item) => item.status === "ready")

  const runUpload = useCallback(async (key: string, file: File) => {
    try {
      const resource = await uploadResource(file)
      setAttachments((items) => {
        // An identical file already attached resolves to the same resource.
        if (items.some((item) => item.resourceId === resource.id)) {
          return items.filter((item) => item.key !== key)
        }
        return items.map((item) =>
          item.key === key ? { ...readyAttachment(resource), key } : item
        )
      })
    } catch (error) {
      setAttachments((items) =>
        items.map((item) =>
          item.key === key
            ? {
                ...item,
                status: "error",
                error: resourceErrorMessage(error, "Upload failed."),
              }
            : item
        )
      )
    }
  }, [])

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return
      if (files.length > 1) {
        toast.info("Only the first file was added. Add files one at a time.")
      }
      const file = files[0]
      if (full) {
        toast.error(
          `A message can attach at most ${MAX_MESSAGE_RESOURCES} files.`
        )
        return
      }
      const invalid = validateResourceFile(file, maxSize)
      if (invalid) {
        toast.error(`${file.name}: ${invalid}`)
        return
      }
      const key = crypto.randomUUID()
      setAttachments((items) => [
        ...items,
        {
          key,
          status: "uploading",
          name: file.name,
          mediaType: file.type,
          size: file.size,
          file,
        },
      ])
      void runUpload(key, file)
    },
    [full, maxSize, runUpload]
  )

  const addResource = useCallback((resource: Resource) => {
    setAttachments((items) => {
      if (
        items.length >= MAX_MESSAGE_RESOURCES ||
        items.some((item) => item.resourceId === resource.id)
      ) {
        return items
      }
      return [...items, readyAttachment(resource)]
    })
  }, [])

  const retry = useCallback(
    (key: string) => {
      const attachment = attachments.find((item) => item.key === key)
      if (!attachment?.file) return
      setAttachments((items) =>
        items.map((item) =>
          item.key === key
            ? { ...item, status: "uploading", error: undefined }
            : item
        )
      )
      void runUpload(key, attachment.file)
    },
    [attachments, runUpload]
  )

  const remove = useCallback((key: string) => {
    setAttachments((items) => items.filter((item) => item.key !== key))
  }, [])

  const clear = useCallback(() => setAttachments([]), [])

  return {
    attachments,
    ready,
    full,
    uploading,
    addFiles,
    addResource,
    retry,
    remove,
    clear,
  }
}

/** The resource or conversation token immediately before the caret. */
export type MentionTrigger = {
  kind: "#" | "@"
  start: number
  end: number
  query: string
}

const triggerPattern = /(?:^|\s)#([^\s#]{0,64})$/

export function findMentionTrigger(
  value: string,
  caret: number
): MentionTrigger | null {
  const prefix = value.slice(0, caret)
  const mention = /(?:^|[\s，。；：、！？（「【])@([^\r\n@#]{0,200})$/.exec(
    prefix
  )
  const match = mention ?? triggerPattern.exec(prefix)
  if (!match) return null
  return {
    kind: mention ? "@" : "#",
    start: caret - match[1].length - 1,
    end: caret,
    query: match[1],
  }
}

export async function loadPickerResources(query: string) {
  const page = await pb
    .collection(RESOURCES_COLLECTION)
    .getList<Resource>(1, 8, {
      filter: resourceNameFilter(query),
      sort: "-updated",
      fields: RESOURCE_LIST_FIELDS,
      requestKey: "chat-resource-picker",
    })
  return page.items
}

// Both pickers leave keyboard focus in the textarea. Only results from the
// current query can be selected, including during the debounce interval.
export function useMentionPicker<T>({
  trigger,
  disabled,
  load,
  onSelect,
  onDismiss,
}: {
  trigger: MentionTrigger | null
  disabled: boolean
  load: (query: string) => Promise<T[]>
  onSelect: (item: T) => void
  onDismiss: () => void
}) {
  const [page, setPage] = useState<{
    query: string
    load: typeof load
    rows: T[]
    failed: boolean
  } | null>(null)
  const [highlighted, setHighlighted] = useState(0)
  const query = trigger?.query ?? null
  const current = page?.query === query && page.load === load ? page : null
  const results = current?.rows ?? []
  const loading = query !== null && !current
  useEffect(() => {
    if (query === null) return
    let active = true
    const timer = window.setTimeout(() => {
      void load(query)
        .then((rows) => {
          if (!active) return
          setPage({ query, load, rows, failed: false })
          setHighlighted(0)
        })
        .catch((err: unknown) => {
          if (!active || isRequestAbort(err)) return
          setPage({ query, load, rows: [], failed: true })
        })
    }, 120)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query, load])

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!trigger) return
    if (event.key === "Escape") {
      event.preventDefault()
      onDismiss()
      return
    }
    if (event.nativeEvent.isComposing) return
    if (disabled || results.length === 0) {
      if (trigger.kind === "@" && event.key === "Enter" && !event.shiftKey)
        event.preventDefault()
      return
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setHighlighted(
        (index) => (index + step + results.length) % results.length
      )
      return
    }
    if (
      (event.key === "Enter" || event.key === "Tab") &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      onSelect(results[Math.min(highlighted, results.length - 1)])
    }
  }

  return {
    open: trigger !== null,
    failed: current?.failed ?? false,
    results,
    loading,
    highlighted,
    setHighlighted,
    onKeyDown,
  }
}
