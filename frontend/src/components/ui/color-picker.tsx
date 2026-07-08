import { useState } from "react"
import { HexColorPicker } from "react-colorful"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type ColorPickerProps = {
  value: string
  onChange: (value: string) => void
  className?: string
  /** Size of the trigger dot in pixels. Defaults to 32. */
  size?: number
  "aria-label"?: string
}

export function ColorPicker({
  value,
  onChange,
  className,
  size = 32,
  ...props
}: ColorPickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "shrink-0 cursor-pointer rounded-full border-2 border-white shadow-sm ring-1 ring-black/10 transition-transform hover:scale-110",
            className
          )}
          style={{ width: size, height: size, backgroundColor: value }}
          aria-label={props["aria-label"] ?? "Pick color"}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto border-none p-3" align="start">
        <HexColorPicker color={value} onChange={onChange} />
      </PopoverContent>
    </Popover>
  )
}
