import { useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { EyeIcon, EyeOffIcon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useLlmSettingsStore, type LlmProtocol } from "@/store/llm-settings"

type ModelSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const emptyForm = {
  name: "",
  modelId: "",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  protocol: "openai" as LlmProtocol,
}

export function ModelSheet({ open, onOpenChange }: ModelSheetProps) {
  const addModel = useLlmSettingsStore((s) => s.addModel)

  const [form, setForm] = useState(emptyForm)
  const [showToken, setShowToken] = useState(false)

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    addModel(form)
    setForm(emptyForm)
    setShowToken(false)
    onOpenChange(false)
  }

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      setForm(emptyForm)
      setShowToken(false)
    }
    onOpenChange(value)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add model</SheetTitle>
          <SheetDescription>
            Configure a new language model provider. Fields are saved to your
            browser locally.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-6">
          {/* Name */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="model-name">Name</Label>
            <Input
              id="model-name"
              placeholder="My GPT-4o"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              A friendly name to identify this model.
            </p>
          </div>

          {/* Model ID */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="model-id">Model ID</Label>
            <Input
              id="model-id"
              placeholder="gpt-4o, claude-sonnet-4-20250514, ..."
              value={form.modelId}
              onChange={(e) => setField("modelId", e.target.value)}
            />
          </div>

          {/* Base URL */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="base-url">Base URL</Label>
            <Input
              id="base-url"
              placeholder="https://api.openai.com/v1"
              value={form.baseUrl}
              onChange={(e) => setField("baseUrl", e.target.value)}
            />
          </div>

          {/* API Token */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key">API Token</Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showToken ? "text" : "password"}
                placeholder="sk-..."
                value={form.apiKey}
                onChange={(e) => setField("apiKey", e.target.value)}
                className="px-9"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
                aria-label={showToken ? "Hide token" : "Show token"}
              >
                <HugeiconsIcon
                  icon={showToken ? EyeOffIcon : EyeIcon}
                  strokeWidth={2}
                  className="size-4"
                />
              </button>
            </div>
          </div>

          {/* Protocol */}
          <div className="flex flex-col gap-2">
            <Label>Protocol</Label>
            <RadioGroup
              value={form.protocol}
              onValueChange={(v) => setField("protocol", v as LlmProtocol)}
              className="grid gap-3 sm:grid-cols-2"
            >
              <Label
                htmlFor="protocol-openai"
                className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-xl border border-input p-3 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"
              >
                <RadioGroupItem
                  id="protocol-openai"
                  value="openai"
                  className="mt-0.5"
                />
                <div className="grid gap-0.5">
                  <span className="text-sm font-medium">OpenAI</span>
                  <span className="text-muted-foreground text-xs">
                    Chat completions API
                  </span>
                </div>
              </Label>
              <Label
                htmlFor="protocol-anthropic"
                className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-xl border border-input p-3 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"
              >
                <RadioGroupItem
                  id="protocol-anthropic"
                  value="anthropic"
                  className="mt-0.5"
                />
                <div className="grid gap-0.5">
                  <span className="text-sm font-medium">Anthropic</span>
                  <span className="text-muted-foreground text-xs">
                    Messages API
                  </span>
                </div>
              </Label>
            </RadioGroup>
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <SheetClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SheetClose>
          <Button onClick={handleSave} disabled={!form.name || !form.modelId}>
            Add model
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
