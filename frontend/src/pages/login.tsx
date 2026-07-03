import { useState } from "react"
import { useNavigate } from "react-router"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  EyeIcon,
  EyeOffIcon,
  LockKeyIcon,
  Mail02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { ThemeToggle } from "@/components/theme-toggle"
import { Logo } from "@/components/logo"
import { useAuthStore } from "@/store/auth"

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const [email, setEmail] = useState("demo@workavera.com")
  const [password, setPassword] = useState("password")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate("/dashboard", { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background p-6">
      {/* Decorative background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background:radial-gradient(60%_50%_at_50%_0%,oklch(0.7_0.15_300)_0%,transparent_60%)] dark:[background:radial-gradient(60%_50%_at_50%_0%,oklch(0.4_0.15_300)_0%,transparent_60%)]"
      />

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="mb-4 size-12" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Sign in to your personal workspace
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <div className="relative">
                <HugeiconsIcon
                  icon={Mail02Icon}
                  strokeWidth={2}
                  className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                />
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                >
                  Forgot?
                </button>
              </div>
              <div className="relative">
                <HugeiconsIcon
                  icon={LockKeyIcon}
                  strokeWidth={2}
                  className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="px-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <HugeiconsIcon
                    icon={showPassword ? EyeOffIcon : EyeIcon}
                    strokeWidth={2}
                    className="size-4"
                  />
                </button>
              </div>
            </div>

            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="mt-1 w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </div>

          <div className="my-5 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs">Demo</span>
            <Separator className="flex-1" />
          </div>

          <div className="bg-muted/60 rounded-2xl px-3.5 py-2.5 text-xs text-muted-foreground">
            <p className="flex items-center justify-between">
              <span>Email</span>
              <span className="text-foreground/80 font-medium">
                demo@workavera.com
              </span>
            </p>
            <p className="mt-1 flex items-center justify-between">
              <span>Password</span>
              <span className="text-foreground/80 font-medium">password</span>
            </p>
          </div>
        </form>

        <p className="text-muted-foreground mt-6 text-center text-sm">
          Don&apos;t have an account?{" "}
          <a href="#" className="text-foreground font-medium hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  )
}
