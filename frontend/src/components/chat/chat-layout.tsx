import { ConversationList } from "./conversation-list"
import { ChatArea } from "./chat-area"

export function ChatLayout() {
  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] overflow-hidden md:-m-6">
      <ConversationList />
      <ChatArea />
    </div>
  )
}
