import type { IconSvgElement } from "@hugeicons/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons"
import { NavLink } from "react-router"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { flatNavItems } from "@/lib/navigation"

type PlaceholderPageProps = {
  title: string
  description: string
  icon: IconSvgElement
}

export function PlaceholderPage({ title, description, icon }: PlaceholderPageProps) {
  const others = flatNavItems.filter(
    (i) => i.title.toLowerCase() !== title.toLowerCase()
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
            <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      <Card className="border-dashed ring-border/60">
        <CardHeader>
          <CardTitle className="text-base">Coming soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            This section is under construction. In the meantime, explore other
            parts of your workspace.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {others.map((item) => (
              <Button key={item.url} asChild variant="secondary" size="sm">
                <NavLink to={item.url} className="gap-1.5">
                  <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-3.5" />
                  {item.title}
                  <HugeiconsIcon
                    icon={ArrowUpRight01Icon}
                    strokeWidth={2}
                    className="size-3"
                  />
                </NavLink>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
