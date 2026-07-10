import { useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  AlertCircleIcon,
  EyeIcon,
  EyeOffIcon,
  Key01Icon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
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
import {
  useLlmSettingsStore,
  DEFAULT_MAX_OUTPUT_TOKENS,
  type LlmModelConfig,
  type LlmModelInput,
  type LlmProtocol,
} from "@/store/llm-settings"

type ModelSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  model?: LlmModelConfig | null
}

const DEFAULT_BASE_URLS: Record<LlmProtocol, string> = {
  openai: "https://api.openai.com/v1",
  "openai-compatible": "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com/",
}

const PROTOCOLS: Array<{
  value: LlmProtocol
  label: string
  description: string
}> = [
  { value: "openai", label: "OpenAI", description: "Chat Completions API" },
  {
    value: "openai-compatible",
    label: "OpenAI compatible",
    description: "Third-party Chat Completions API",
  },
  { value: "anthropic", label: "Anthropic", description: "Messages API" },
  {
    value: "google",
    label: "Google",
    description: "Gemini generateContent API",
  },
]

function createForm(model?: LlmModelConfig | null) {
  return {
    name: model?.name ?? "",
    modelId: model?.modelId ?? "",
    baseUrl: model?.baseUrl ?? DEFAULT_BASE_URLS.openai,
    apiKey: "",
    protocol: model?.protocol ?? ("openai" as LlmProtocol),
    maxOutputTokens:
      model?.maxOutputTokens && model.maxOutputTokens > 0
        ? String(model.maxOutputTokens)
        : "",
  }
}

function isValidBaseUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export function ModelSheet({ open, onOpenChange, model }: ModelSheetProps) {
  const addModel = useLlmSettingsStore((state) => state.addModel)
  const updateModel = useLlmSettingsStore((state) => state.updateModel)

  const [form, setForm] = useState(() => createForm(model))
  const [showToken, setShowToken] = useState(false)
  const [clearSavedKey, setClearSavedKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setField = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) => setForm((current) => ({ ...current, [key]: value }))

  const handleProtocolChange = (protocol: LlmProtocol) => {
    setForm((current) => {
      const knownDefault = Object.values(DEFAULT_BASE_URLS).includes(
        current.baseUrl.trim()
      )
      return {
        ...current,
        protocol,
        baseUrl:
          !current.baseUrl.trim() || knownDefault
            ? DEFAULT_BASE_URLS[protocol]
            : current.baseUrl,
      }
    })
  }

  const handleSave = async () => {
    setError(null)
    const name = form.name.trim()
    const modelId = form.modelId.trim()
    const baseUrl = form.baseUrl.trim()
    if (!name || !modelId || !baseUrl) {
      setError("Name, model ID, and base URL are required.")
      return
    }
    if (!isValidBaseUrl(baseUrl)) {
      setError("Base URL must be an absolute HTTP or HTTPS URL.")
      return
    }

    const trimmedTokens = form.maxOutputTokens.trim()
    let maxOutputTokens: number | undefined
    if (trimmedTokens !== "") {
      const parsed = Number(trimmedTokens)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setError("Max output tokens must be a positive whole number.")
        return
      }
      maxOutputTokens = parsed
    }

    setSaving(true)
    try {
      const input: LlmModelInput = {
        name,
        modelId,
        baseUrl,
        protocol: form.protocol,
      }
      if (maxOutputTokens !== undefined) {
        input.maxOutputTokens = maxOutputTokens
      }
      if (!model || form.apiKey.trim() || clearSavedKey) {
        input.apiKey = clearSavedKey ? "" : form.apiKey.trim()
      }
      if (model) await updateModel(model.id, input)
      else await addModel(input)
      onOpenChange(false)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save model configuration"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          setForm(createForm(model))
          setShowToken(false)
          setClearSavedKey(false)
          setError(null)
        }
        onOpenChange(value)
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-lg!">
        <SheetHeader>
          <SheetTitle>{model ? "Edit model" : "Add model"}</SheetTitle>
          <SheetDescription>
            {model
              ? "Update this model configuration. The saved API key is never displayed."
              : "Configure a language model provider for your account."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-6">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <HugeiconsIcon
                icon={AlertCircleIcon}
                strokeWidth={2}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="model-name">Name</Label>
            <Input
              id="model-name"
              maxLength={120}
              placeholder="My GPT-4o"
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A friendly name to identify this configuration.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="model-id">Model ID</Label>
            <Input
              id="model-id"
              maxLength={255}
              placeholder="gpt-4o, claude-sonnet-4, gemini-2.5-flash, ..."
              value={form.modelId}
              onChange={(event) => setField("modelId", event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="base-url">Base URL</Label>
            <Input
              id="base-url"
              type="url"
              maxLength={2048}
              placeholder={DEFAULT_BASE_URLS[form.protocol]}
              value={form.baseUrl}
              onChange={(event) => setField("baseUrl", event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="api-key">API Key</Label>
              {model?.hasApiKey && !clearSavedKey && (
                <Badge variant="secondary" className="gap-1">
                  <HugeiconsIcon icon={Key01Icon} strokeWidth={2} />
                  Configured
                </Badge>
              )}
            </div>
            <div className="relative">
              <Input
                id="api-key"
                type={showToken ? "text" : "password"}
                maxLength={4096}
                placeholder={
                  model?.hasApiKey && !clearSavedKey
                    ? "Enter a new key to replace the saved key"
                    : "Optional API key"
                }
                value={form.apiKey}
                onChange={(event) => {
                  setField("apiKey", event.target.value)
                  if (event.target.value) setClearSavedKey(false)
                }}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowToken((value) => !value)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showToken ? "Hide key" : "Show key"}
              >
                <HugeiconsIcon
                  icon={showToken ? EyeOffIcon : EyeIcon}
                  strokeWidth={2}
                  className="size-4"
                />
              </button>
            </div>
            {model?.hasApiKey && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {clearSavedKey
                    ? "The saved key will be removed when you save."
                    : "Leave this blank to keep the saved key."}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setForm((current) => ({ ...current, apiKey: "" }))
                    setClearSavedKey((value) => !value)
                  }}
                >
                  {clearSavedKey ? "Keep key" : "Remove key"}
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="max-output-tokens">Max output tokens</Label>
            <Input
              id="max-output-tokens"
              type="number"
              min={1}
              placeholder={String(DEFAULT_MAX_OUTPUT_TOKENS)}
              value={form.maxOutputTokens}
              onChange={(event) =>
                setField("maxOutputTokens", event.target.value)
              }
            />
            <p className="text-xs text-muted-foreground">
              The maximum number of tokens the model can generate per step.
              Leave blank to use the default of{" "}
              {DEFAULT_MAX_OUTPUT_TOKENS.toLocaleString()}.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Protocol</Label>
            <RadioGroup
              value={form.protocol}
              onValueChange={(value) =>
                handleProtocolChange(value as LlmProtocol)
              }
              className="grid gap-3"
            >
              {PROTOCOLS.map((protocol) => (
                <Label
                  key={protocol.value}
                  htmlFor={`protocol-${protocol.value}`}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-input p-3 hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"
                >
                  <RadioGroupItem
                    id={`protocol-${protocol.value}`}
                    value={protocol.value}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5">
                    <span className="text-sm font-medium">
                      {protocol.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {protocol.description}
                    </span>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <SheetClose asChild>
            <Button variant="ghost" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : model ? "Save changes" : "Add model"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
