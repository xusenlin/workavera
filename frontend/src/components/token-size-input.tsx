import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type TokenSizePreset = {
  label: string
  value: number
}

export function TokenSizeInput({
  id,
  presets,
  preset,
  customValue,
  customPlaceholder,
  onPresetChange,
  onCustomValueChange,
}: {
  id: string
  presets: TokenSizePreset[]
  preset: string
  customValue: string
  customPlaceholder: string
  onPresetChange: (value: string) => void
  onCustomValueChange: (value: string) => void
}) {
  return (
    <div className="flex gap-2">
      <Select value={preset} onValueChange={onPresetChange}>
        <SelectTrigger
          id={id}
          className={preset === "custom" ? "w-32" : "w-full"}
        >
          <SelectValue placeholder="Select size" />
        </SelectTrigger>
        <SelectContent>
          {presets.map((entry) => (
            <SelectItem key={entry.value} value={String(entry.value)}>
              {entry.label} ({entry.value.toLocaleString()} tokens)
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom…</SelectItem>
        </SelectContent>
      </Select>
      {preset === "custom" && (
        <Input
          aria-label={`Custom value for ${id}`}
          placeholder={customPlaceholder}
          value={customValue}
          onChange={(event) => onCustomValueChange(event.target.value)}
          className="flex-1"
        />
      )}
    </div>
  )
}
