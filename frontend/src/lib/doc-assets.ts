import { pb } from "@/lib/pocketbase"
import type { RecordModel } from "pocketbase"

export const DOC_ASSET_MAX_SIZE = 10 * 1024 * 1024

export const DOC_ASSET_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".zip",
].join(",")

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

export type DocAsset = {
  id: string
  docId: string
  kind: "image" | "file"
  name: string
  mediaType: string
  size: number
  url: string
}

export type DocAssetMetadata = Pick<
  DocAsset,
  "id" | "kind" | "name" | "mediaType" | "size"
> & { created: string }

type DocAssetRecord = RecordModel & {
  kind: "image" | "file"
  original_name: string
  media_type: string
  size: number
  created: string
}

let fileTokenCache:
  { authToken: string; fileToken: string; expiresAt: number } | undefined
let fileTokenRequest:
  | { authToken: string; promise: Promise<string> }
  | undefined
const metadataCache = new Map<string, Promise<DocAssetMetadata>>()

export function isSupportedDocImage(file: File): boolean {
  return IMAGE_TYPES.has(file.type)
}

export async function uploadDocAsset(
  docId: string,
  file: File
): Promise<DocAsset> {
  if (file.size > DOC_ASSET_MAX_SIZE) {
    throw new Error("Files must be 10 MB or smaller.")
  }
  const body = new FormData()
  body.set("file", file)
  const asset = await pb.send<DocAsset>(`/api/docs/${docId}/assets`, {
    method: "POST",
    body,
  })
  return asset
}

export function isDocAssetURL(value: string): boolean {
  return parseDocAssetURL(value) !== undefined
}

export function docAssetDownloadURL(value: string): string {
  const parsed = parseDocAssetURL(value)
  if (!parsed) return value
  parsed.searchParams.set("download", "1")
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}

export async function getDocAssetMetadata(
  value: string
): Promise<DocAssetMetadata> {
  const id = docAssetRecordID(value)
  if (!id) throw new Error("Invalid document asset URL.")
  const cacheKey = metadataCacheKey(id)
  let request = metadataCache.get(cacheKey)
  if (!request) {
    request = pb
      .collection("doc_assets")
      .getOne<DocAssetRecord>(id, { requestKey: null })
      .then((record) => ({
        id: record.id,
        kind: record.kind,
        name: record.original_name,
        mediaType: record.media_type,
        size: record.size,
        created: record.created,
      }))
    metadataCache.set(cacheKey, request)
    void request.catch(() => metadataCache.delete(cacheKey))
  }
  return request
}

export async function openDocAssetDownload(value: string): Promise<void> {
  const popup = window.open("about:blank", "_blank")
  if (popup) popup.opener = null
  try {
    const resolved = await resolveDocAssetURL(docAssetDownloadURL(value))
    if (popup) {
      popup.location.href = resolved
    } else {
      window.location.assign(resolved)
    }
  } catch (error) {
    popup?.close()
    throw error
  }
}

export async function resolveDocAssetURL(value: string): Promise<string> {
  const parsed = parseDocAssetURL(value)
  if (!parsed) return value

  parsed.searchParams.set("token", await getFileToken())
  return parsed.toString()
}

export async function docAssetImageDataURL(value: string): Promise<string> {
  const response = await fetch(await resolveDocAssetURL(value))
  if (!response.ok) {
    throw new Error("Could not load an uploaded image for export.")
  }
  return blobToDataURL(await response.blob())
}

async function getFileToken(): Promise<string> {
  const authToken = pb.authStore.token
  if (
    fileTokenCache?.authToken === authToken &&
    fileTokenCache.expiresAt > Date.now()
  ) {
    return fileTokenCache.fileToken
  }
  if (!fileTokenRequest || fileTokenRequest.authToken !== authToken) {
    const request = {
      authToken,
      promise: pb.files.getToken().then((fileToken) => {
        fileTokenCache = {
          authToken,
          fileToken,
          // PocketBase file tokens last three minutes. Refresh with a
          // one-minute safety margin instead of decoding token internals.
          expiresAt: Date.now() + 2 * 60 * 1000,
        }
        return fileToken
      }),
    }
    request.promise = request.promise.finally(() => {
      if (fileTokenRequest === request) fileTokenRequest = undefined
    })
    fileTokenRequest = request
  }
  return fileTokenRequest.promise
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener("load", () => resolve(String(reader.result)))
    reader.addEventListener("error", () => reject(reader.error))
    reader.readAsDataURL(blob)
  })
}

function parseDocAssetURL(value: string): URL | undefined {
  try {
    const base = new URL(pb.buildURL("/"))
    const parsed = new URL(value, base)
    if (
      parsed.origin !== base.origin ||
      !parsed.pathname.startsWith("/api/files/doc_assets/")
    ) {
      return undefined
    }
    return parsed
  } catch {
    return undefined
  }
}

function docAssetRecordID(value: string): string | undefined {
  const parsed = parseDocAssetURL(value)
  if (!parsed) return undefined
  return parsed.pathname.split("/")[4] || undefined
}

function metadataCacheKey(id: string): string {
  return `${pb.authStore.record?.id ?? ""}:${id}`
}
