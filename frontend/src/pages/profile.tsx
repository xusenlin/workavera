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
import { Textarea } from "@/components/ui/textarea"
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
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const updatePassword = useAuthStore((s) => s.updatePassword)

  // Profile form state
  const [name, setName] = useState(user?.name ?? "")
  const [phone, setPhone] = useState(user?.phone ?? "")
  const [title, setTitle] = useState(user?.title ?? "")
  const [bio, setBio] = useState(user?.bio ?? "")
  const [status, setStatus] = useState<UserStatus>(user?.status ?? "online")
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar)
  const [avatarFile, setAvatarFile] = useState<File>()
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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
  const [pwdSaving, setPwdSaving] = useState(false)

  const handleSaveProfile = async () => {
    setSaveError(null)
    setSaving(true)
    try {
      const updatedUser = await updateProfile({
        name,
        phone,
        title,
        bio,
        status,
        avatar: avatarFile,
      })
      setName(updatedUser.name)
      setPhone(updatedUser.phone ?? "")
      setTitle(updatedUser.title ?? "")
      setBio(updatedUser.bio ?? "")
      setStatus(updatedUser.status ?? "online")
      setAvatarPreview(updatedUser.avatar)
      setAvatarFile(undefined)
      setSaved(true)
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save your profile"
      )
      setSaved(false)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdatePassword = async () => {
    setPwdError(null)
    if (pwdForm.next.length < 8) {
      setPwdError("New password must be at least 8 characters")
      return
    }
    if (pwdForm.next !== pwdForm.confirm) {
      setPwdError("Passwords do not match")
      return
    }
    setPwdSaving(true)
    try {
      await updatePassword(pwdForm.current, pwdForm.next)
      setPwdForm({ current: "", next: "", confirm: "" })
      setPwdSaved(true)
    } catch (error) {
      setPwdError(
        error instanceof Error
          ? error.message
          : "Could not update your password"
      )
      setPwdSaved(false)
    } finally {
      setPwdSaving(false)
    }
  }

  const statusMeta = STATUS_OPTIONS.find((s) => s.value === status)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Manage your personal information and security settings.
        </p>
      </div>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HugeiconsIcon
                icon={UserCircle02Icon}
                strokeWidth={2}
                className="size-4"
              />
            </div>
            <div>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>
                Update your avatar, name, contact details, and profile.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {/* Avatar */}
          <AvatarPicker
            value={avatarPreview}
            name={name}
            onChange={({ file, previewUrl }) => {
              setAvatarFile(file)
              setAvatarPreview(previewUrl)
              setSaved(false)
              setSaveError(null)
            }}
          />

          {/* Name */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-name">Username</Label>
            <Input
              id="profile-name"
              value={name}
              maxLength={100}
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
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="profile-phone"
                value={phone}
                maxLength={32}
                onChange={(e) => {
                  setPhone(e.target.value)
                  setSaved(false)
                }}
                placeholder="+86 138 0000 0000"
                className="pl-9"
              />
            </div>
          </div>

          {/* Title */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-title">Title</Label>
            <Input
              id="profile-title"
              value={title}
              maxLength={120}
              onChange={(e) => {
                setTitle(e.target.value)
                setSaved(false)
              }}
              placeholder="Product Designer"
            />
          </div>

          {/* Bio */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-bio">Bio</Label>
            <Textarea
              id="profile-bio"
              value={bio}
              maxLength={1000}
              rows={4}
              onChange={(e) => {
                setBio(e.target.value)
                setSaved(false)
              }}
              placeholder="A short introduction about you"
            />
            <span className="text-right text-xs text-muted-foreground">
              {bio.length}/1000
            </span>
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

          {saveError && (
            <p className="text-sm text-destructive" role="alert">
              {saveError}
            </p>
          )}
        </CardContent>

        <CardFooter className="justify-end gap-3 border-t">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <HugeiconsIcon
                icon={CheckmarkCircle04Icon}
                strokeWidth={2}
                className="size-4 text-emerald-500"
              />
              Saved
            </span>
          )}
          <Button onClick={handleSaveProfile} disabled={!name.trim() || saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </CardFooter>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HugeiconsIcon
                icon={Shield02Icon}
                strokeWidth={2}
                className="size-4"
              />
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
            <p className="text-sm text-destructive" role="alert">
              {pwdError}
            </p>
          )}
          {pwdSaved && !pwdError && (
            <p className="flex items-center gap-1.5 text-sm text-emerald-600">
              <HugeiconsIcon
                icon={CheckmarkCircle04Icon}
                strokeWidth={2}
                className="size-4"
              />
              Password updated successfully.
            </p>
          )}
        </CardContent>

        <CardFooter className="justify-end border-t">
          <Button
            onClick={handleUpdatePassword}
            disabled={
              pwdSaving || !pwdForm.current || !pwdForm.next || !pwdForm.confirm
            }
          >
            {pwdSaving ? "Updating..." : "Update password"}
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
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
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
          className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
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
