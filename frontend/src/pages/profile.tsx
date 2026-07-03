import { useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle04Icon,
  EyeIcon,
  EyeOffIcon,
  LockKeyIcon,
  Shield02Icon,
  UserCircle02Icon,
  Call02Icon,
} from "@hugeicons/core-free-icons"

import { AvatarPicker } from "@/components/avatar-picker"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuthStore, type UserStatus } from "@/store/auth"

const STATUS_OPTIONS: {
  value: UserStatus
  label: string
  color: string
}[] = [
  { value: "online", label: "Online", color: "#22c55e" },
  { value: "away", label: "Away", color: "#f59e0b" },
  { value: "busy", label: "Busy", color: "#ef4444" },
  { value: "offline", label: "Offline", color: "#64748b" },
]


export function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)
  const updatePassword = useAuthStore((s) => s.updatePassword)
  const currentPassword = useAuthStore((s) => s.password)

  // Profile form state
  const [name, setName] = useState(user?.name ?? "")
  const [phone, setPhone] = useState(user?.phone ?? "")
  const [status, setStatus] = useState<UserStatus>(user?.status ?? "online")
  const [avatar, setAvatar] = useState(user?.avatar)
  const [saved, setSaved] = useState(false)

  // Password form state
  const [pwdForm, setPwdForm] = useState({
    current: "",
    next: "",
    confirm: "",
  })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwdError, setPwdError] = useState<string | null>(null)
  const [pwdSaved, setPwdSaved] = useState(false)

  const handleSaveProfile = () => {
    updateUser({ name, phone, status, avatar })
    setSaved(true)
  }

  const handleUpdatePassword = () => {
    setPwdError(null)
    if (pwdForm.current !== currentPassword) {
      setPwdError("Current password is incorrect")
      return
    }
    if (pwdForm.next.length < 6) {
      setPwdError("New password must be at least 6 characters")
      return
    }
    if (pwdForm.next !== pwdForm.confirm) {
      setPwdError("Passwords do not match")
      return
    }
    updatePassword(pwdForm.next)
    setPwdForm({ current: "", next: "", confirm: "" })
    setPwdSaved(true)
  }

  const statusMeta = STATUS_OPTIONS.find((s) => s.value === status)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted-foreground text-sm">
          Manage your personal information and security settings.
        </p>
      </div>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
              <HugeiconsIcon icon={UserCircle02Icon} strokeWidth={2} className="size-4" />
            </div>
            <div>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>
                Update your avatar, name, phone, and status.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {/* Avatar */}
          <AvatarPicker
            value={avatar}
            name={name}
            onChange={(v) => {
              setAvatar(v)
              setSaved(false)
            }}
          />

          {/* Name */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-name">Username</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setSaved(false)
              }}
              placeholder="Your name"
            />
          </div>

          {/* Phone */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-phone">Phone</Label>
            <div className="relative">
              <HugeiconsIcon
                icon={Call02Icon}
                strokeWidth={2}
                className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <Input
                id="profile-phone"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  setSaved(false)
                }}
                placeholder="+86 138 0000 0000"
                className="pl-9"
              />
            </div>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as UserStatus)
                setSaved(false)
              }}
            >
              <SelectTrigger className="w-full">
                <span className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: statusMeta?.color }}
                  />
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: opt.color }}
                    />
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>

        <CardFooter className="border-t justify-end gap-3">
          {saved && (
            <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <HugeiconsIcon
                icon={CheckmarkCircle04Icon}
                strokeWidth={2}
                className="size-4 text-emerald-500"
              />
              Saved
            </span>
          )}
          <Button onClick={handleSaveProfile} disabled={!name.trim()}>
            Save changes
          </Button>
        </CardFooter>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
              <HugeiconsIcon icon={Shield02Icon} strokeWidth={2} className="size-4" />
            </div>
            <div>
              <CardTitle>Security</CardTitle>
              <CardDescription>
                Change your password to keep your account secure.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <PasswordField
            id="pwd-current"
            label="Current password"
            value={pwdForm.current}
            show={showCurrent}
            onToggle={() => setShowCurrent((v) => !v)}
            onChange={(v) => {
              setPwdForm((p) => ({ ...p, current: v }))
              setPwdError(null)
              setPwdSaved(false)
            }}
          />
          <PasswordField
            id="pwd-new"
            label="New password"
            value={pwdForm.next}
            show={showNext}
            onToggle={() => setShowNext((v) => !v)}
            onChange={(v) => {
              setPwdForm((p) => ({ ...p, next: v }))
              setPwdError(null)
              setPwdSaved(false)
            }}
          />
          <PasswordField
            id="pwd-confirm"
            label="Confirm new password"
            value={pwdForm.confirm}
            show={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)}
            onChange={(v) => {
              setPwdForm((p) => ({ ...p, confirm: v }))
              setPwdError(null)
              setPwdSaved(false)
            }}
          />

          {pwdError && (
            <p className="text-destructive text-sm" role="alert">
              {pwdError}
            </p>
          )}
          {pwdSaved && !pwdError && (
            <p className="text-emerald-600 flex items-center gap-1.5 text-sm">
              <HugeiconsIcon
                icon={CheckmarkCircle04Icon}
                strokeWidth={2}
                className="size-4"
              />
              Password updated successfully.
            </p>
          )}
        </CardContent>

        <CardFooter className="border-t justify-end">
          <Button
            onClick={handleUpdatePassword}
            disabled={!pwdForm.current || !pwdForm.next || !pwdForm.confirm}
          >
            Update password
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

function PasswordField({
  id,
  label,
  value,
  show,
  onToggle,
  onChange,
}: {
  id: string
  label: string
  value: string
  show: boolean
  onToggle: () => void
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <HugeiconsIcon
          icon={LockKeyIcon}
          strokeWidth={2}
          className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          className="px-9"
        />
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
          aria-label={show ? "Hide password" : "Show password"}
        >
          <HugeiconsIcon
            icon={show ? EyeOffIcon : EyeIcon}
            strokeWidth={2}
            className="size-4"
          />
        </button>
      </div>
    </div>
  )
}
