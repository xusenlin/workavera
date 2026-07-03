import { useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Brain02Icon,
  Delete02Icon,
  StarIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ModelSheet } from "@/components/model-sheet"
import { useLlmSettingsStore } from "@/store/llm-settings"

export function SettingsPage() {
  const models = useLlmSettingsStore((s) => s.models)
  const activeModelId = useLlmSettingsStore((s) => s.activeModelId)
  const setActiveModel = useLlmSettingsStore((s) => s.setActiveModel)
  const removeModel = useLlmSettingsStore((s) => s.removeModel)

  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Manage your preferences and configure model providers.
        </p>
      </div>

      {/* Large Language Model */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <HugeiconsIcon icon={Brain02Icon} strokeWidth={2} className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle>Large Language Model</CardTitle>
              <CardDescription>
                Manage the models available to Workavera.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
              Add model
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {models.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                <HugeiconsIcon icon={Brain02Icon} strokeWidth={2} className="size-5" />
              </div>
              <p className="text-sm font-medium">No models configured</p>
              <p className="text-muted-foreground text-xs">
                Add a model to start using Workavera.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {models.map((model, idx) => {
                const isActive = model.id === activeModelId
                return (
                  <li key={model.id}>
                    {idx > 0 && <Separator />}
                    <div className="hover:bg-muted/30 flex items-center gap-3 px-6 py-3.5 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {model.name}
                          </span>
                          <span className="bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-0.5 text-xs capitalize">
                            {model.protocol}
                          </span>
                          {isActive && (
                            <span className="bg-primary/10 text-primary shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground truncate text-xs">
                          {model.modelId || "—"} · {model.baseUrl}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {!isActive && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setActiveModel(model.id)}
                            aria-label="Set as default"
                          >
                            <HugeiconsIcon icon={StarIcon} strokeWidth={2} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeModel(model.id)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Delete model"
                        >
                          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <ModelSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  )
}
