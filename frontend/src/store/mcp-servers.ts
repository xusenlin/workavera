import { create } from "zustand"
import { toast } from "sonner"

import { pb } from "@/lib/pocketbase"

export type McpTool = {
  name: string
  description: string
  enabled: boolean
  approval: "always" | "never"
  hash: string
  stale: boolean
}

export type McpServer = {
  id: string
  name: string
  slug: string
  transport: "http" | "sse"
  url: string
  approvalPolicy: "all" | "writes" | "none"
  enabled: boolean
  tools: McpTool[]
  lastError: string
  lastRefreshed: string
}

export function enabledMcpToolCount(server: McpServer) {
  return server.tools.filter((tool) => tool.enabled).length
}

function toMcpServer(record: Record<string, unknown>): McpServer {
  return {
    id: String(record.id),
    name: String(record.name ?? ""),
    slug: String(record.slug ?? ""),
    transport: (record.transport as McpServer["transport"]) ?? "http",
    url: String(record.url ?? ""),
    approvalPolicy:
      (record.approval_policy as McpServer["approvalPolicy"]) ??
      (record.approvalPolicy as McpServer["approvalPolicy"]) ??
      "writes",
    enabled: Boolean(record.enabled),
    tools: Array.isArray(record.tools) ? (record.tools as McpTool[]) : [],
    lastError: String(record.last_error ?? record.lastError ?? ""),
    lastRefreshed: String(record.last_refreshed ?? record.lastRefreshed ?? ""),
  }
}

type McpServersState = {
  servers: McpServer[]
  loading: boolean
  initialized: boolean
  error: string | null
  togglingIds: Record<string, boolean>
  loadServers: (force?: boolean) => Promise<void>
  toggleServer: (id: string, enabled: boolean) => Promise<void>
  clear: () => void
}

let fetchPromise: Promise<void> | null = null

export const useMcpServersStore = create<McpServersState>((set, get) => ({
  servers: [],
  loading: false,
  initialized: false,
  error: null,
  togglingIds: {},

  loadServers: async (force = false) => {
    if (!force && get().initialized) return
    if (fetchPromise) return fetchPromise

    const initialLoad = !get().initialized
    fetchPromise = (async () => {
      if (initialLoad) {
        set({ loading: true, error: null })
      }
      try {
        const records = await pb
          .collection("mcp_servers")
          .getFullList<Record<string, unknown>>({
            sort: "created",
            requestKey: null,
          })
        set({
          servers: records.map(toMcpServer),
          initialized: true,
          error: null,
        })
      } catch {
        set({ error: "Could not load MCP servers." })
      } finally {
        set({ loading: false })
      }
    })()

    try {
      await fetchPromise
    } finally {
      fetchPromise = null
    }
  },

  toggleServer: async (id, enabled) => {
    const previous = get().servers
    const target = previous.find((server) => server.id === id)
    if (!target || get().togglingIds[id]) return

    set((state) => ({
      servers: state.servers.map((server) =>
        server.id === id ? { ...server, enabled } : server
      ),
      togglingIds: { ...state.togglingIds, [id]: true },
    }))

    try {
      const updated = await pb.send<Record<string, unknown>>(
        `/api/mcp-servers/${id}`,
        {
          method: "PATCH",
          body: { enabled },
          requestKey: null,
        }
      )
      set((state) => ({
        servers: state.servers.map((server) =>
          server.id === id ? toMcpServer(updated) : server
        ),
      }))
    } catch {
      set((state) => ({
        servers: state.servers.map((server) =>
          server.id === id ? target : server
        ),
      }))
      toast.error("Could not update the server")
    } finally {
      set((state) => {
        const next = { ...state.togglingIds }
        delete next[id]
        return { togglingIds: next }
      })
    }
  },

  clear: () => {
    fetchPromise = null
    set({
      servers: [],
      loading: false,
      initialized: false,
      error: null,
      togglingIds: {},
    })
  },
}))
