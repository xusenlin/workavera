import { HugeiconsIcon } from "@hugeicons/react"
import { File01Icon } from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatTaskSpan, type DateLocale } from "@/lib/date-format"
import type { PublicState, PublicTask } from "@/lib/public-board"
import { PRIORITY_META } from "@/store/board"

type PublicTaskDialogProps = {
  task: PublicTask | null
  state?: PublicState
  locale: DateLocale
  onOpenChange: (open: boolean) => void
}

/**
 * The read-only detail of one task. It shows what the task is and when, never
 * who it belongs to: assignees stay out of a public preview.
 */
export function PublicTaskDialog({
  task,
  state,
  locale,
  onOpenChange,
}: PublicTaskDialogProps) {
  const priority = task
    ? PRIORITY_META.find((item) => item.value === task.priority)
    : undefined
  const span = task ? formatTaskSpan(task.startDate, task.dueDate, locale) : ""

  return (
    <Dialog open={Boolean(task)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        {task && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6 text-left">{task.title}</DialogTitle>
              <DialogDescription className="sr-only">
                Task details
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              {state && (
                <Badge
                  variant="secondary"
                  className="gap-1.5"
                  style={{ color: state.color }}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: state.color }}
                  />
                  {state.name}
                </Badge>
              )}
              {priority && (
                <Badge
                  variant="secondary"
                  className="gap-1.5"
                  style={{ color: priority.color }}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: priority.color }}
                  />
                  {priority.label}
                </Badge>
              )}
              {span && (
                <span className="text-xs text-muted-foreground">{span}</span>
              )}
            </div>

            {task.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {task.labels.map((label) => (
                  <span
                    key={label.name}
                    className="inline-flex h-5 items-center rounded-md px-2 text-[11px] font-medium text-white"
                    style={{ backgroundColor: label.color }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            )}

            {task.description && (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {task.description}
              </p>
            )}

            {task.documents.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h4 className="text-xs font-medium text-muted-foreground">
                  Documents
                </h4>
                {task.documents.map((document, index) =>
                  document.slug ? (
                    <a
                      key={`${document.title}-${index}`}
                      href={`/s/${document.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm transition-colors hover:border-border hover:bg-muted/40"
                    >
                      <HugeiconsIcon
                        icon={File01Icon}
                        strokeWidth={2}
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {document.title}
                      </span>
                    </a>
                  ) : (
                    <div
                      key={`${document.title}-${index}`}
                      className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-sm text-muted-foreground"
                    >
                      <HugeiconsIcon
                        icon={File01Icon}
                        strokeWidth={2}
                        className="size-4 shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {document.title}
                      </span>
                      <span className="shrink-0 text-[11px]">
                        Not shared by the author
                      </span>
                    </div>
                  )
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
