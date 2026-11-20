import type { SentConversation } from "@/components/chat/conversation-reference"

export function parseSentConversation(
  output: unknown
): SentConversation | null {
  if (typeof output === "string") {
    try {
      output = JSON.parse(output)
    } catch {
      return null
    }
  }
  if (!output || typeof output !== "object") return null
  const card = output as Record<string, unknown>
  const { conversationId, messageId, title, excerpt, matchedKeywords } = card
  if (
    typeof conversationId !== "string" ||
    !conversationId ||
    typeof messageId !== "string" ||
    !messageId ||
    typeof title !== "string" ||
    typeof excerpt !== "string" ||
    !excerpt
  )
    return null
  const keywords = Array.isArray(matchedKeywords)
    ? matchedKeywords.filter(
        (term): term is string => typeof term === "string" && term.length > 0
      )
    : undefined
  return {
    conversationId,
    messageId,
    title,
    excerpt,
    ...(keywords && keywords.length > 0 ? { matchedKeywords: keywords } : {}),
  }
}
