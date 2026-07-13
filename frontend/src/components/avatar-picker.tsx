import { useEffect, useRef, useState } from "react"

import { createAvatar } from "@dicebear/core"
import {
  adventurer,
  avataaars,
  bigSmile,
  bottts,
  funEmoji,
  lorelei,
  micah,
  notionists,
  shapes,
  thumbs,
} from "@dicebear/collection/async"

import { HugeiconsIcon } from "@hugeicons/react"
import { Upload04Icon } from "@hugeicons/core-free-icons"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { dataUriToFile, validateAvatarFile } from "@/lib/avatar"

type AvatarStyle = {
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style: any
}

const AVATAR_STYLE_LOADERS = [
  { name: "Adventurer", load: adventurer },
  { name: "Avataaars", load: avataaars },
  { name: "Big Smile", load: bigSmile },
  { name: "Bottts", load: bottts },
  { name: "Fun Emoji", load: funEmoji },
  { name: "Lorelei", load: lorelei },
  { name: "Micah", load: micah },
  { name: "Notionists", load: notionists },
  { name: "Shapes", load: shapes },
  { name: "Thumbs", load: thumbs },
]

const SEEDS = ["Senlin", "Alice", "Bob", "Diana", "Eric", "Luna", "Max", "Zoe"]

function getInitials(name: string) {
  return name.charAt(0).toUpperCase()
}

type AvatarPickerProps = {
  value?: string
  name: string
  onChange: (selection: AvatarSelection) => void
}

export type AvatarSelection = {
  file: File
  previewUrl: string
}

export function AvatarPicker({ value, name, onChange }: AvatarPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validationError = validateAvatarFile(file)
    if (validationError) {
      setError(validationError)
      e.target.value = ""
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setError(null)
      onChange({ file, previewUrl: reader.result as string })
    }
    reader.readAsDataURL(file)
  }

  const handlePresetSelect = async (dataUri: string, filename: string) => {
    try {
      const file = await dataUriToFile(dataUri, filename)
      const validationError = validateAvatarFile(file)
      if (validationError) {
        setError(validationError)
        return
      }

      setError(null)
      onChange({ file, previewUrl: dataUri })
      setSheetOpen(false)
    } catch {
      setError("Could not prepare the preset avatar. Please try again.")
      setSheetOpen(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <Avatar size="lg" className="size-20">
          {value && <AvatarImage src={value} alt={name} />}
          <AvatarFallback className="text-2xl">
            {getInitials(name || "?")}
          </AvatarFallback>
        </Avatar>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="flex flex-row gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setSheetOpen(true)}
          >
            Choose preset
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <HugeiconsIcon
              icon={Upload04Icon}
              strokeWidth={2}
              className="size-4"
            />
            Upload image
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <PresetSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        value={value}
        onSelect={handlePresetSelect}
      />
    </div>
  )
}

function PresetSheet({
  open,
  onOpenChange,
  value,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value?: string
  onSelect: (avatar: string, filename: string) => Promise<void>
}) {
  const [styles, setStyles] = useState<AvatarStyle[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    if (!open || styles) return
    let active = true
    void Promise.all(
      AVATAR_STYLE_LOADERS.map(async ({ name, load }) => ({
        name,
        style: await load(),
      }))
    )
      .then((loadedStyles) => {
        if (active) setStyles(loadedStyles)
      })
      .catch(() => {
        if (active) setLoadFailed(true)
      })
    return () => {
      active = false
    }
  }, [open, styles])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg!">
        <SheetHeader>
          <SheetTitle>Choose avatar</SheetTitle>
          <SheetDescription>
            Pick from preset avatars generated by DiceBear.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 overflow-y-auto px-6 pb-6">
          {!styles && !loadFailed && (
            <div className="flex min-h-40 items-center justify-center">
              <Spinner className="size-5" />
            </div>
          )}
          {loadFailed && (
            <p className="py-8 text-center text-sm text-destructive">
              Could not load preset avatars. Please try again.
            </p>
          )}
          {styles?.map((entry) => (
            <div key={entry.name} className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {entry.name}
              </span>
              <div className="grid grid-cols-4 gap-2">
                {SEEDS.map((seed) => {
                  const dataUri = createAvatar(entry.style, {
                    seed,
                    size: 80,
                  }).toDataUri()
                  const selected = value === dataUri
                  return (
                    <button
                      key={`${entry.name}-${seed}`}
                      type="button"
                      onClick={() =>
                        void onSelect(
                          dataUri,
                          `avatar-${entry.name.toLowerCase().replaceAll(" ", "-")}-${seed.toLowerCase()}.svg`
                        )
                      }
                      className={cn(
                        "flex items-center justify-center rounded-lg border-2 p-1 transition-all hover:bg-muted/50",
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-transparent"
                      )}
                      aria-label={`Select ${entry.name} ${seed} avatar`}
                    >
                      <img
                        src={dataUri}
                        alt={`${entry.name} ${seed}`}
                        className="size-12 rounded-md"
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t p-6">
          <SheetClose asChild>
            <Button className="w-full">Done</Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  )
}
