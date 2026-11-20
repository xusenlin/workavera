import { create } from "zustand"

import { isRequestAbort } from "@/lib/error"
import { pb } from "@/lib/pocketbase"
import {
  forgetResourceState,
  RESOURCE_LEASES_COLLECTION,
  RESOURCE_LIST_FIELDS,
  RESOURCES_COLLECTION,
  resourceErrorMessage,
  resourceTypeFilter,
  uploadResource,
  type Resource,
  type ResourceLease,
  type ResourceTypeFilter,
} from "@/lib/resources"

export const RESOURCES_PER_PAGE = 20

type ResourceListParams = {
  query: string
  type: ResourceTypeFilter
  page: number
}

type ResourcesState = ResourceListParams & {
  resources: Resource[]
  totalItems: number
  totalPages: number
  loading: boolean
  error: string | null
  /** Loads one page of resources; omitted params keep their current value. */
  fetchResources: (params?: Partial<ResourceListParams>) => Promise<void>
  upload: (file: File) => Promise<Resource>
  rename: (id: string, displayName: string) => Promise<void>
  remove: (id: string) => Promise<void>
  fetchLeases: (resourceId: string) => Promise<ResourceLease[]>
  revokeLease: (leaseId: string) => Promise<void>
}

/** PocketBase filter for resources whose display name contains the query. */
export function resourceNameFilter(query: string) {
  const trimmed = query.trim()
  return trimmed ? pb.filter("display_name ~ {:query}", { query: trimmed }) : ""
}

export const useResourcesStore = create<ResourcesState>((set, get) => ({
  resources: [],
  query: "",
  type: "all",
  page: 1,
  totalItems: 0,
  totalPages: 0,
  loading: false,
  error: null,

  fetchResources: async (params) => {
    const { query, type, page } = { ...get(), ...params }
    set({ loading: true, error: null, query, type, page })
    try {
      const result = await pb
        .collection(RESOURCES_COLLECTION)
        .getList<Resource>(page, RESOURCES_PER_PAGE, {
          filter: [resourceNameFilter(query), resourceTypeFilter(type)]
            .filter(Boolean)
            .join(" && "),
          sort: "-updated",
          fields: RESOURCE_LIST_FIELDS,
          requestKey: "resources-list",
        })
      // A delete can empty the last page; show the one before it instead.
      if (result.items.length === 0 && page > 1 && result.totalPages > 0) {
        return get().fetchResources({ page: result.totalPages })
      }
      set({
        resources: result.items,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
        loading: false,
      })
    } catch (error) {
      if (isRequestAbort(error)) return
      set({
        loading: false,
        error: resourceErrorMessage(error, "Could not load resources."),
      })
    }
  },

  upload: async (file) => {
    const resource = await uploadResource(file)
    // Newest first, so the upload lands at the top of the first page.
    void get().fetchResources({ page: 1 })
    return resource
  },

  rename: async (id, displayName) => {
    const updated = await pb
      .collection(RESOURCES_COLLECTION)
      .update<Resource>(
        id,
        { display_name: displayName },
        { fields: RESOURCE_LIST_FIELDS }
      )
    forgetResourceState(id)
    set((state) => ({
      resources: state.resources.map((item) =>
        item.id === id ? updated : item
      ),
    }))
  },

  remove: async (id) => {
    await pb.send(`/api/resources/${encodeURIComponent(id)}`, {
      method: "DELETE",
      requestKey: null,
    })
    forgetResourceState(id)
    await get().fetchResources()
  },

  fetchLeases: async (resourceId) =>
    pb.collection(RESOURCE_LEASES_COLLECTION).getFullList<ResourceLease>({
      filter: pb.filter("resource = {:resource} && expires_at > @now", {
        resource: resourceId,
      }),
      sort: "expires_at",
      fields: "id,resource,purpose,expires_at,created",
      requestKey: null,
    }),

  revokeLease: async (leaseId) => {
    await pb.send(
      `/api/resource-download-leases/${encodeURIComponent(leaseId)}`,
      { method: "DELETE", requestKey: null }
    )
  },
}))
