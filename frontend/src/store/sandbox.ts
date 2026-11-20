import { create } from "zustand"
import { toast } from "sonner"

import { extractErrorMessage } from "@/lib/error"
import { pb } from "@/lib/pocketbase"

export type SandboxState =
  "unavailable" | "disabled" | "preparing" | "running" | "stopped" | "error"

export type SandboxStatus = {
  available: boolean
  reason: string
  message: string
  enabled: boolean
  online: boolean
  networkAllowed: boolean
  configuredImage: string
  limits: { memory: string; cpus: number; pids: number }
  idleTimeoutMinutes: number
  container: {
    name: string
    state: SandboxState
    phase: string
    image: string
    createdAt: string
    error: string
  }
}

type SandboxStoreState = {
  status: SandboxStatus | null
  loading: boolean
  error: string | null
  busy: "enabled" | "network" | null
  load: (force?: boolean) => Promise<void>
  setStatus: (status: SandboxStatus) => void
  toggleEnabled: (enabled: boolean) => Promise<void>
  toggleOnline: (online: boolean) => Promise<void>
  clear: () => void
}

let fetchPromise: Promise<void> | null = null
let requestVersion = 0

export const useSandboxStore = create<SandboxStoreState>((set, get) => ({
  status: null,
  loading: false,
  error: null,
  busy: null,

  load: async (force = false) => {
    if (!force && get().status !== null) return
    if (get().busy !== null) return
    if (fetchPromise) return fetchPromise

    const initialLoad = get().status === null
    const version = ++requestVersion
    fetchPromise = (async () => {
      if (initialLoad) {
        set({ loading: true, error: null })
      }
      try {
        const next = await pb.send<SandboxStatus>("/api/sandbox", {
          requestKey: null,
        })
        if (version !== requestVersion) return
        set({ status: next, error: null })
      } catch (error) {
        if (version !== requestVersion) return
        set({ error: extractErrorMessage(error, "Could not load sandbox") })
      } finally {
        if (version === requestVersion) {
          set({ loading: false })
        }
      }
    })()

    try {
      await fetchPromise
    } finally {
      fetchPromise = null
    }
  },

  setStatus: (status) => {
    requestVersion++
    set({ status, error: null, loading: false })
  },

  toggleEnabled: async (enabled) => {
    if (get().busy !== null) return
    const version = ++requestVersion
    set({ busy: "enabled" })
    try {
      const next = await pb.send<SandboxStatus>(
        enabled ? "/api/sandbox/enable" : "/api/sandbox/disable",
        { method: "POST", requestKey: null }
      )
      if (version === requestVersion) {
        set({ status: next, error: null })
      }
    } catch (error) {
      toast.error(
        extractErrorMessage(
          error,
          enabled ? "Could not turn the sandbox on" : "Could not turn it off"
        )
      )
      set({ busy: null })
      void get().load(true)
      return
    } finally {
      set({ busy: null })
    }
  },

  toggleOnline: async (online) => {
    if (get().busy !== null) return
    const version = ++requestVersion
    set({ busy: "network" })
    try {
      const next = await pb.send<SandboxStatus>("/api/sandbox/network", {
        method: "POST",
        body: { online },
        requestKey: null,
      })
      if (version === requestVersion) {
        set({ status: next, error: null })
      }
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not change network"))
      set({ busy: null })
      void get().load(true)
      return
    } finally {
      set({ busy: null })
    }
  },

  clear: () => {
    requestVersion++
    fetchPromise = null
    set({ status: null, loading: false, error: null, busy: null })
  },
}))
