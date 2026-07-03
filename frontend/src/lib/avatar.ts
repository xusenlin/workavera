export const AVATAR_MAX_SIZE = 500 * 1024

export const AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
] as const

export function validateAvatarFile(file: File) {
  if (
    !AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number])
  ) {
    return "Choose a JPEG, PNG, WebP, GIF, or SVG image."
  }
  if (file.size > AVATAR_MAX_SIZE) {
    return "Avatar images must be 500 KiB or smaller."
  }
  return null
}

export async function dataUriToFile(dataUri: string, filename: string) {
  const response = await fetch(dataUri)
  const blob = await response.blob()
  return new File([blob], filename, { type: blob.type || "image/svg+xml" })
}
