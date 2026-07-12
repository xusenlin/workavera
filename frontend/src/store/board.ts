import { create } from "zustand"
import { ClientResponseError, type RecordModel } from "pocketbase"
import { toast } from "sonner"

import { pb } from "@/lib/pocketbase"

export type Priority = "none" | "low" | "medium" | "high" | "urgent"
export type StateCategory = "pending" | "active" | "completed"
export type MemberRole = "admin" | "member" | "viewer"

export type TemplateState = {
  name: string
  color: string
  category: StateCategory
}

export type TemplateLabel = {
  name: string
  color: string
}

export type BoardTemplate = {
  id: string
  name: string
  description?: string
  ownerId?: string
  states: TemplateState[]
  labels: TemplateLabel[]
}

export type Project = {
  id: string
  name: string
  description?: string
  ownerId: string
  ownerName: string
  ownerAvatar?: string
  archived: boolean
  collapsed: boolean
}

export type ProjectState = {
  id: string
  projectId: string
  name: string
  color: string
  category: StateCategory
  sortOrder: number
}

export type Label = {
  id: string
  projectId: string
  name: string
  color: string
}

export type Member = {
  id: string
  projectId: string
  userId: string
  role: MemberRole
  name: string
  avatar?: string
}

export type ProjectParticipant = {
  userId: string
  name: string
  avatar?: string
  role: "owner" | MemberRole
}

export type Todo = {
  id: string
  projectId: string
  stateId: string
  title: string
  description?: string
  priority: Priority
  labels: string[]
  members: string[]
  dueDate?: string
  rank: number
}

type TodoInput = Omit<Todo, "id" | "rank">
type StateInput = Pick<ProjectState, "name" | "color" | "category">
type LabelInput = Pick<Label, "name" | "color">

const PROJECTS_PER_PAGE = 4

type BoardState = {
  templates: BoardTemplate[]
  projects: Project[]
  openedProject: Project | null
  projectPage: number
  projectTotalPages: number
  projectTotalItems: number
  states: ProjectState[]
  todos: Todo[]
  openedTask: Todo | null
  labels: Label[]
  members: Member[]
  loading: boolean
  initialized: boolean
  error: string | null
  initialize: () => Promise<void>
  dispose: () => void
  clearError: () => void
  loadProjectPage: (page: number) => Promise<void>
  openProject: (id: string) => Promise<Project | null>
  openTask: (id: string) => Promise<Todo | null>
  clearOpenedRecord: () => void
  addProject: (input: {
    name: string
    description?: string
    states: StateInput[]
    labels: LabelInput[]
    members: { userId: string; role: MemberRole }[]
  }) => Promise<void>
  updateProject: (
    id: string,
    patch: { name?: string; description?: string }
  ) => Promise<void>
  removeProject: (id: string) => Promise<void>
  transferProjectOwner: (id: string, ownerId: string) => Promise<void>
  toggleProjectCollapse: (id: string) => void
  addState: (projectId: string, input: StateInput) => Promise<void>
  updateState: (id: string, patch: Partial<StateInput>) => Promise<void>
  removeState: (id: string) => Promise<void>
  reorderState: (id: string, direction: -1 | 1) => Promise<void>
  addLabel: (projectId: string, input: LabelInput) => Promise<void>
  updateLabel: (id: string, patch: Partial<LabelInput>) => Promise<void>
  removeLabel: (id: string) => Promise<void>
  addMember: (
    projectId: string,
    input: { userId: string; role: MemberRole }
  ) => Promise<void>
  updateMember: (id: string, patch: { role: MemberRole }) => Promise<void>
  removeMember: (id: string) => Promise<void>
  addTodo: (todo: TodoInput) => Promise<void>
  updateTodo: (id: string, patch: Partial<Omit<Todo, "id">>) => Promise<void>
  removeTodo: (id: string) => Promise<void>
  moveTodo: (id: string, toStateId: string, toIndex: number) => Promise<void>
}

type TemplateRecord = RecordModel & {
  name: string
  description: string
  owner: string
  states: TemplateState[]
  labels: TemplateLabel[]
}

type ProjectRecord = RecordModel & {
  name: string
  description: string
  owner: string
  archived: boolean
  expand?: { owner?: UserRecord }
}

type StateRecord = RecordModel & {
  project: string
  name: string
  color: string
  category: StateCategory
  sort_order: number
}

type LabelRecord = RecordModel & {
  project: string
  name: string
  color: string
}

type UserRecord = RecordModel & {
  name: string
  email: string
  avatar: string
}

type MemberRecord = RecordModel & {
  project: string
  user: string
  role: MemberRole
  expand?: { user?: UserRecord }
}

type TodoRecord = RecordModel & {
  project: string
  state: string
  title: string
  description: string
  priority: Priority
  labels: string[]
  assignees: string[]
  due_date: string
  rank: number
}

const COLLECTIONS = {
  templates: "board_templates",
  projects: "board_projects",
  states: "board_project_states",
  members: "board_project_members",
  labels: "board_project_labels",
  tasks: "board_tasks",
} as const

// Accordion mode: only one project expanded at a time. null means all collapsed.
let expandedProjectId: string | null = null
let realtimeUnsubscribers: Array<() => void> = []
let connectionWanted = false

function toTemplate(record: TemplateRecord): BoardTemplate {
  return {
    id: record.id,
    name: record.name,
    description: record.description || undefined,
    ownerId: record.owner || undefined,
    states: Array.isArray(record.states) ? record.states : [],
    labels: Array.isArray(record.labels) ? record.labels : [],
  }
}

function toProject(record: ProjectRecord): Project {
  const owner = record.expand?.owner
  return {
    id: record.id,
    name: record.name,
    description: record.description || undefined,
    ownerId: record.owner,
    ownerName: owner?.name || owner?.email || "Unknown owner",
    ownerAvatar:
      owner?.avatar && owner ? pb.files.getURL(owner, owner.avatar) : undefined,
    archived: record.archived,
    collapsed: expandedProjectId === record.id,
  }
}

export function projectParticipants(
  project: Project,
  members: Member[]
): ProjectParticipant[] {
  const participants: ProjectParticipant[] = [
    {
      userId: project.ownerId,
      name: project.ownerName,
      avatar: project.ownerAvatar,
      role: "owner",
    },
  ]
  const seen = new Set([project.ownerId])
  for (const member of members) {
    if (member.projectId !== project.id || seen.has(member.userId)) continue
    seen.add(member.userId)
    participants.push({
      userId: member.userId,
      name: member.name,
      avatar: member.avatar,
      role: member.role,
    })
  }
  return participants
}

function toState(record: StateRecord): ProjectState {
  return {
    id: record.id,
    projectId: record.project,
    name: record.name,
    color: record.color,
    category: record.category,
    sortOrder: record.sort_order,
  }
}

function toLabel(record: LabelRecord): Label {
  return {
    id: record.id,
    projectId: record.project,
    name: record.name,
    color: record.color,
  }
}

function toMember(record: MemberRecord): Member {
  const user = record.expand?.user
  return {
    id: record.id,
    projectId: record.project,
    userId: record.user,
    role: record.role,
    name: user?.name || user?.email || "Unknown member",
    avatar:
      user?.avatar && user ? pb.files.getURL(user, user.avatar) : undefined,
  }
}

function toTodo(record: TodoRecord): Todo {
  return {
    id: record.id,
    projectId: record.project,
    stateId: record.state,
    title: record.title,
    description: record.description || undefined,
    priority: record.priority,
    labels: record.labels || [],
    members: record.assignees || [],
    dueDate: record.due_date ? record.due_date.slice(0, 10) : undefined,
    rank: record.rank,
  }
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex((current) => current.id === item.id)
  if (index === -1) return [...items, item]
  const next = [...items]
  next[index] = item
  return next
}

function messageFromError(error: unknown, fallback: string) {
  if (error instanceof ClientResponseError) {
    return error.response?.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

function todoPatchToRecord(patch: Partial<Omit<Todo, "id">>) {
  const body: Record<string, unknown> = {}
  if (patch.projectId !== undefined) body.project = patch.projectId
  if (patch.stateId !== undefined) body.state = patch.stateId
  if (patch.title !== undefined) body.title = patch.title
  if (patch.description !== undefined)
    body.description = patch.description || ""
  if (patch.priority !== undefined) body.priority = patch.priority
  if (patch.labels !== undefined) body.labels = patch.labels
  if (patch.members !== undefined) body.assignees = patch.members
  if (patch.dueDate !== undefined) body.due_date = patch.dueDate || ""
  if (patch.rank !== undefined) body.rank = patch.rank
  return body
}

async function loadBoardPage(page: number) {
  const [templates, projectResult, states, todos, labels, members] =
    await Promise.all([
      pb
        .collection(COLLECTIONS.templates)
        .getFullList<TemplateRecord>({ sort: "name", requestKey: null }),
      pb
        .collection(COLLECTIONS.projects)
        .getList<ProjectRecord>(page + 1, PROJECTS_PER_PAGE, {
          filter: "archived = false",
          sort: "-created",
          expand: "owner",
          requestKey: null,
        }),
      pb
        .collection(COLLECTIONS.states)
        .getFullList<StateRecord>({ sort: "sort_order", requestKey: null }),
      pb
        .collection(COLLECTIONS.tasks)
        .getFullList<TodoRecord>({ sort: "rank", requestKey: null }),
      pb
        .collection(COLLECTIONS.labels)
        .getFullList<LabelRecord>({ sort: "name", requestKey: null }),
      pb.collection(COLLECTIONS.members).getFullList<MemberRecord>({
        expand: "user",
        sort: "created",
        requestKey: null,
      }),
    ])

  return {
    templates: templates.map(toTemplate),
    projects: projectResult.items.map(toProject),
    projectPage: page,
    projectTotalPages: projectResult.totalPages,
    projectTotalItems: projectResult.totalItems,
    states: states.map(toState),
    todos: todos.map(toTodo),
    labels: labels.map(toLabel),
    members: members.map(toMember),
  }
}

async function connectRealtime(
  set: (
    patch: Partial<BoardState> | ((state: BoardState) => Partial<BoardState>)
  ) => void
) {
  realtimeUnsubscribers.forEach((unsubscribe) => unsubscribe())
  realtimeUnsubscribers = []

  const subscribe = async <T extends RecordModel>(
    collection: string,
    key: "projects" | "states" | "todos" | "labels" | "members",
    mapRecord: (record: T) => Project | ProjectState | Todo | Label | Member
  ) => {
    try {
      const options =
        key === "members"
          ? { expand: "user", requestKey: null }
          : key === "projects"
            ? {
                filter: "archived = false",
                expand: "owner",
                requestKey: null,
              }
            : { requestKey: null }
      const unsubscribe = await pb.collection(collection).subscribe<T>(
        "*",
        (event) => {
          set((state) => {
            const current = state[key] as Array<{ id: string }>
            if (event.action === "delete") {
              return {
                [key]: current.filter((item) => item.id !== event.record.id),
              } as Partial<BoardState>
            }
            return {
              [key]: upsertById(current, mapRecord(event.record)),
            } as Partial<BoardState>
          })
        },
        options
      )
      realtimeUnsubscribers.push(unsubscribe)
    } catch (err) {
      // 组件卸载或被新请求替代时，静默忽略 PocketBase 自动取消产生的 abort 错误
      if (err instanceof ClientResponseError && err.isAbort) return
      throw err
    }
  }

  await Promise.all([
    subscribe<ProjectRecord>(COLLECTIONS.projects, "projects", toProject),
    subscribe<StateRecord>(COLLECTIONS.states, "states", toState),
    subscribe<TodoRecord>(COLLECTIONS.tasks, "todos", toTodo),
    subscribe<LabelRecord>(COLLECTIONS.labels, "labels", toLabel),
    subscribe<MemberRecord>(COLLECTIONS.members, "members", toMember),
  ])
}

export const useBoardStore = create<BoardState>((set, get) => ({
  templates: [],
  projects: [],
  openedProject: null,
  projectPage: 0,
  projectTotalPages: 1,
  projectTotalItems: 0,
  states: [],
  todos: [],
  openedTask: null,
  labels: [],
  members: [],
  loading: false,
  initialized: false,
  error: null,

  initialize: async () => {
    connectionWanted = true
    if (get().loading || get().initialized) return
    set({ loading: true, error: null })
    try {
      const snapshot = await loadBoardPage(0)
      expandedProjectId = snapshot.projects[0]?.id ?? null
      set({
        ...snapshot,
        projects: snapshot.projects.map((p) => ({
          ...p,
          collapsed: p.id !== expandedProjectId,
        })),
        initialized: true,
      })
      if (connectionWanted) await connectRealtime(set)
    } catch (error) {
      const message = messageFromError(error, "Could not load the board")
      set({ error: message })
      toast.error(message)
    } finally {
      set({ loading: false })
    }
  },

  loadProjectPage: async (page) => {
    set({ loading: true, error: null })
    try {
      const snapshot = await loadBoardPage(page)
      expandedProjectId = snapshot.projects[0]?.id ?? null
      set({
        ...snapshot,
        projects: snapshot.projects.map((p) => ({
          ...p,
          collapsed: p.id !== expandedProjectId,
        })),
      })
    } catch (error) {
      const message = messageFromError(error, "Could not load the board")
      set({ error: message })
      toast.error(message)
    } finally {
      set({ loading: false })
    }
  },

  openProject: async (id) => {
    const projectId = id.trim()
    if (!projectId) return null
    const existing = get().projects.find((project) => project.id === projectId)
    if (existing) {
      set({ openedProject: null })
      return existing
    }
    try {
      const record = await pb
        .collection(COLLECTIONS.projects)
        .getOne<ProjectRecord>(projectId, {
          expand: "owner",
          requestKey: null,
        })
      const project = toProject(record)
      set({ openedProject: project })
      return project
    } catch (error) {
      const message = messageFromError(error, "Could not open the project")
      set({ error: message })
      toast.error(message)
      return null
    }
  },

  openTask: async (id) => {
    const taskId = id.trim()
    if (!taskId) return null
    const listedTask = get().todos.find((todo) => todo.id === taskId) ?? null
    let task = listedTask
    if (!task) {
      try {
        const record = await pb
          .collection(COLLECTIONS.tasks)
          .getOne<TodoRecord>(taskId, { requestKey: null })
        task = toTodo(record)
      } catch (error) {
        if (error instanceof ClientResponseError && error.status === 404) {
          return null
        }
        const message = messageFromError(error, "Could not open the task")
        set({ error: message })
        toast.error(message)
        return null
      }
    }

    const listedProject = get().projects.find(
      (project) => project.id === task.projectId
    )
    if (listedTask && listedProject) {
      set({ openedTask: null, openedProject: null })
      return listedTask
    }

    const project = await get().openProject(task.projectId)
    if (!project) return null
    set({ openedTask: task, openedProject: project })
    return task
  },

  clearOpenedRecord: () =>
    set({ openedTask: null, openedProject: null }),

  dispose: () => {
    connectionWanted = false
    realtimeUnsubscribers.forEach((unsubscribe) => unsubscribe())
    realtimeUnsubscribers = []
    set({ initialized: false })
  },

  clearError: () => set({ error: null }),

  addProject: async (input) => {
    set({ error: null })
    try {
      await pb.send("/api/board/projects", {
        method: "POST",
        body: {
          name: input.name,
          description: input.description || "",
          states: input.states,
          labels: input.labels,
          members: input.members,
        },
      })
      const snapshot = await loadBoardPage(0)
      set(snapshot)
    } catch (error) {
      const message = messageFromError(error, "Could not create the project")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  updateProject: async (id, patch) => {
    try {
      const record = await pb
        .collection(COLLECTIONS.projects)
        .update<ProjectRecord>(
          id,
          {
            name: patch.name,
            description: patch.description,
          },
          { expand: "owner", requestKey: null }
        )
      set((state) => ({
        projects: state.projects.some((project) => project.id === id)
          ? upsertById(state.projects, toProject(record))
          : state.projects,
        openedProject:
          state.openedProject?.id === id
            ? toProject(record)
            : state.openedProject,
      }))
    } catch (error) {
      const message = messageFromError(error, "Could not update the project")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  removeProject: async (id) => {
    try {
      await pb.collection(COLLECTIONS.projects).delete(id)
      set((state) => ({
        projects: state.projects.filter((project) => project.id !== id),
        openedProject:
          state.openedProject?.id === id ? null : state.openedProject,
        states: state.states.filter((item) => item.projectId !== id),
        todos: state.todos.filter((todo) => todo.projectId !== id),
        labels: state.labels.filter((label) => label.projectId !== id),
        members: state.members.filter((member) => member.projectId !== id),
      }))
    } catch (error) {
      const message = messageFromError(error, "Could not delete the project")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  transferProjectOwner: async (id, ownerId) => {
    set({ error: null })
    try {
      await pb.send(`/api/board/projects/${id}/owner`, {
        method: "PATCH",
        body: { ownerId },
      })
      const snapshot = await loadBoardPage(get().projectPage)
      set(snapshot)
    } catch (error) {
      const message = messageFromError(
        error,
        "Could not transfer project ownership"
      )
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  toggleProjectCollapse: (id) =>
    set((state) => {
      const project = state.projects.find((item) => item.id === id)
      // Accordion mode: expanding one project collapses all others.
      // Clicking an already-expanded project collapses it.
      const willExpand = project?.collapsed ?? true
      expandedProjectId = willExpand ? id : null
      return {
        projects: state.projects.map((item) => ({
          ...item,
          collapsed: item.id !== expandedProjectId,
        })),
      }
    }),

  addState: async (projectId, input) => {
    const sameProject = get().states.filter(
      (state) => state.projectId === projectId
    )
    const sortOrder =
      Math.max(0, ...sameProject.map((state) => state.sortOrder)) + 1024
    try {
      const record = await pb
        .collection(COLLECTIONS.states)
        .create<StateRecord>({
          project: projectId,
          name: input.name,
          color: input.color,
          category: input.category,
          sort_order: sortOrder,
        })
      set((state) => ({ states: upsertById(state.states, toState(record)) }))
    } catch (error) {
      const message = messageFromError(error, "Could not add the state")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  updateState: async (id, patch) => {
    try {
      const record = await pb
        .collection(COLLECTIONS.states)
        .update<StateRecord>(id, patch)
      set((state) => ({ states: upsertById(state.states, toState(record)) }))
    } catch (error) {
      const message = messageFromError(error, "Could not update the state")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  removeState: async (id) => {
    try {
      await pb.collection(COLLECTIONS.states).delete(id)
      set((state) => ({
        states: state.states.filter((item) => item.id !== id),
      }))
    } catch (error) {
      const message = messageFromError(
        error,
        "Move or delete the tasks in this state first"
      )
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  reorderState: async (id, direction) => {
    const state = get().states.find((item) => item.id === id)
    if (!state) return
    const ordered = get()
      .states.filter((item) => item.projectId === state.projectId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const from = ordered.findIndex((item) => item.id === id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= ordered.length) return
    ;[ordered[from], ordered[to]] = [ordered[to], ordered[from]]
    const updates = ordered.map((item, index) => ({
      ...item,
      sortOrder: (index + 1) * 1024,
    }))
    set((current) => ({
      states: current.states.map(
        (item) => updates.find((next) => next.id === item.id) || item
      ),
    }))
    try {
      await Promise.all(
        updates.map((item) =>
          pb
            .collection(COLLECTIONS.states)
            .update(item.id, { sort_order: item.sortOrder })
        )
      )
    } catch (error) {
      const snapshot = await loadBoardPage(get().projectPage)
      set({
        ...snapshot,
        error: messageFromError(error, "Could not reorder states"),
      })
    }
  },

  addLabel: async (projectId, input) => {
    try {
      const record = await pb
        .collection(COLLECTIONS.labels)
        .create<LabelRecord>({
          project: projectId,
          name: input.name,
          color: input.color,
        })
      set((state) => ({ labels: upsertById(state.labels, toLabel(record)) }))
    } catch (error) {
      const message = messageFromError(error, "Could not add the label")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  updateLabel: async (id, patch) => {
    try {
      const record = await pb
        .collection(COLLECTIONS.labels)
        .update<LabelRecord>(id, patch)
      set((state) => ({ labels: upsertById(state.labels, toLabel(record)) }))
    } catch (error) {
      const message = messageFromError(error, "Could not update the label")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  removeLabel: async (id) => {
    try {
      const affected = get().todos.filter((todo) => todo.labels.includes(id))
      await Promise.all(
        affected.map((todo) =>
          get().updateTodo(todo.id, {
            labels: todo.labels.filter((labelId) => labelId !== id),
          })
        )
      )
      await pb.collection(COLLECTIONS.labels).delete(id)
      set((state) => ({
        labels: state.labels.filter((label) => label.id !== id),
        todos: state.todos.map((todo) => ({
          ...todo,
          labels: todo.labels.filter((labelId) => labelId !== id),
        })),
      }))
    } catch (error) {
      const message = messageFromError(error, "Could not delete the label")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  addMember: async (projectId, input) => {
    try {
      const record = await pb
        .collection(COLLECTIONS.members)
        .create<MemberRecord>(
          {
            project: projectId,
            user: input.userId,
            role: input.role,
          },
          { expand: "user", requestKey: null }
        )
      set((state) => ({ members: upsertById(state.members, toMember(record)) }))
    } catch (error) {
      const message = messageFromError(error, "Could not add the member")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  updateMember: async (id, patch) => {
    try {
      const record = await pb
        .collection(COLLECTIONS.members)
        .update<MemberRecord>(
          id,
          { role: patch.role },
          { expand: "user", requestKey: null }
        )
      set((state) => ({ members: upsertById(state.members, toMember(record)) }))
    } catch (error) {
      const message = messageFromError(error, "Could not update the member")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  removeMember: async (id) => {
    try {
      await pb.collection(COLLECTIONS.members).delete(id)
      set((state) => ({
        members: state.members.filter((member) => member.id !== id),
      }))
    } catch (error) {
      const message = messageFromError(error, "Could not remove the member")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  addTodo: async (todo) => {
    const sameState = get().todos.filter(
      (item) =>
        item.projectId === todo.projectId && item.stateId === todo.stateId
    )
    const rank = Math.max(0, ...sameState.map((item) => item.rank)) + 1024
    try {
      const record = await pb.collection(COLLECTIONS.tasks).create<TodoRecord>({
        project: todo.projectId,
        state: todo.stateId,
        title: todo.title,
        description: todo.description || "",
        priority: todo.priority,
        labels: todo.labels,
        assignees: todo.members,
        due_date: todo.dueDate || "",
        rank,
      })
      set((state) => ({ todos: upsertById(state.todos, toTodo(record)) }))
    } catch (error) {
      const message = messageFromError(error, "Could not create the task")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  updateTodo: async (id, patch) => {
    try {
      const record = await pb
        .collection(COLLECTIONS.tasks)
        .update<TodoRecord>(id, todoPatchToRecord(patch))
      const updated = toTodo(record)
      set((state) => ({
        todos: state.todos.some((todo) => todo.id === id)
          ? upsertById(state.todos, updated)
          : state.todos,
        openedTask:
          state.openedTask?.id === id ? updated : state.openedTask,
      }))
    } catch (error) {
      const message = messageFromError(error, "Could not update the task")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  removeTodo: async (id) => {
    try {
      await pb.collection(COLLECTIONS.tasks).delete(id)
      set((state) => ({
        todos: state.todos.filter((item) => item.id !== id),
        openedTask: state.openedTask?.id === id ? null : state.openedTask,
      }))
    } catch (error) {
      const message = messageFromError(error, "Could not delete the task")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  moveTodo: async (id, toStateId, toIndex) => {
    const dragged = get().todos.find((todo) => todo.id === id)
    if (!dragged) return
    const target = get()
      .todos.filter((todo) => todo.stateId === toStateId && todo.id !== id)
      .sort((a, b) => a.rank - b.rank)
    const before = target[toIndex - 1]
    const after = target[toIndex]
    const rank =
      before && after
        ? (before.rank + after.rank) / 2
        : before
          ? before.rank + 1024
          : after
            ? after.rank - 1024
            : 1024
    const optimistic = { ...dragged, stateId: toStateId, rank }
    set((state) => ({ todos: upsertById(state.todos, optimistic) }))
    try {
      const record = await pb
        .collection(COLLECTIONS.tasks)
        .update<TodoRecord>(id, {
          state: toStateId,
          rank,
        })
      set((state) => ({ todos: upsertById(state.todos, toTodo(record)) }))
    } catch (error) {
      set((state) => ({
        todos: upsertById(state.todos, dragged),
        error: messageFromError(error, "Could not move the task"),
      }))
    }
  },
}))

export const PRIORITY_META: {
  value: Priority
  label: string
  color: string
}[] = [
  { value: "none", label: "None", color: "#94a3b8" },
  { value: "low", label: "Low", color: "#64748b" },
  { value: "medium", label: "Medium", color: "#3b82f6" },
  { value: "high", label: "High", color: "#f59e0b" },
  { value: "urgent", label: "Urgent", color: "#ef4444" },
]

export const STATE_CATEGORY_META: {
  value: StateCategory
  label: string
}[] = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
]
