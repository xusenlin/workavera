import { Chat01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Checkbox } from "@/components/ui/checkbox"
import { formatRelativeTime } from "@/lib/chat-utils"
import { cn } from "@/lib/utils"
import type { ConversationOption } from "./conversation-reference"
import type { useMentionPicker } from "./use-resource-attachments"

export function ConversationPickerList({
  picker,
  full,
  includeArchived,
  onIncludeArchived,
  onSelect,
}: {
  picker: ReturnType<typeof useMentionPicker<ConversationOption>>
  full: boolean
  includeArchived: boolean
  onIncludeArchived: (value: boolean) => void
  onSelect: (item: ConversationOption) => void
}) {
  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-md overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span>Reference a conversation</span>
        <label className="flex cursor-pointer items-center gap-1.5 text-foreground select-none">
          <Checkbox
            checked={includeArchived}
            onCheckedChange={(checked) => onIncludeArchived(checked === true)}
            className="size-3.5 rounded-[4px]"
          />
          <span>Include archived</span>
        </label>
      </div>
      {full || !picker.results.length ? (
        <div className="p-3 text-sm text-muted-foreground">
          {full
            ? "Up to 6 conversations per message."
            : picker.loading
              ? "Searching…"
              : picker.failed
                ? "Could not load conversations."
                : "No matching conversations."}
        </div>
      ) : (
        <ul role="listbox" className="max-h-64 overflow-y-auto p-1">
          {picker.results.map((item, i) => (
            <li
              key={item.id}
              role="option"
              aria-selected={i === picker.highlighted}
            >
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  i === picker.highlighted && "bg-accent text-accent-foreground"
                )}
                onMouseEnter={() => picker.setHighlighted(i)}
                onClick={() => onSelect(item)}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md",
                    item.status === "archived"
                      ? "bg-amber-500/12 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400"
                      : "bg-sky-500/12 text-sky-600 dark:bg-sky-400/15 dark:text-sky-400"
                  )}
                >
                  <HugeiconsIcon
                    icon={Chat01Icon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                </span>
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.status === "archived" && "Archived · "}
                  {item.last_message_at &&
                    formatRelativeTime(item.last_message_at)}{" "}
                  · {item.id.slice(-6)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
