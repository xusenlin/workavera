import { create } from "zustand"
import { ClientResponseError, type RecordModel } from "pocketbase"

import { pb } from "@/lib/pocketbase"

export type Priority = "low" | "medium" | "high" | "urgent"
export type StateCategory = "pending" | "active" | "completed"
export type ProjectRole = "owner" | "admin" | "member" | "viewer"

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
  role: ProjectRole
  name: string
  avatar?: string
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

type BoardState = {
  templates: BoardTemplate[]
  projects: Project[]
  states: ProjectState[]
  todos: Todo[]
  labels: Label[]
  members: Member[]
  loading: boolean
  initialized: boolean
  error: string | null
  initialize: () => Promise<void>
  dispose: () => void
  clearError: () => void
  addProject: (input: {
    name: string
    description?: string
    templateId?: string
  }) => Promise<void>
  removeProject: (id: string) => Promise<void>
  toggleProjectCollapse: (id: string) => void
  addState: (projectId: string, input: StateInput) => Promise<void>
  updateState: (id: string, patch: Partial<StateInput>) => Promise<void>
  removeState: (id: string) => Promise<void>
  reorderState: (id: string, direction: -1 | 1) => Promise<void>
  addLabel: (projectId: string, input: LabelInput) => Promise<void>
  updateLabel: (id: string, patch: Partial<LabelInput>) => Promise<void>
  removeLabel: (id: string) => Promise<void>
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
  role: ProjectRole
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

const collapsedProjects = new Set<string>()
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
  return {
    id: record.id,
    name: record.name,
    description: record.description || undefined,
    ownerId: record.owner,
    archived: record.archived,
    collapsed: collapsedProjects.has(record.id),
  }
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
      user?.avatar && user
        ? pb.files.getURL(user, user.avatar)
        : undefined,
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
  if (patch.description !== undefined) body.description = patch.description || ""
  if (patch.priority !== undefined) body.priority = patch.priority
  if (patch.labels !== undefined) body.labels = patch.labels
  if (patch.members !== undefined) body.assignees = patch.members
  if (patch.dueDate !== undefined) body.due_date = patch.dueDate || ""
  if (patch.rank !== undefined) body.rank = patch.rank
  return body
}

async function loadBoardSnapshot() {
  const [templates, projects, states, todos, labels, members] = await Promise.all([
    pb.collection(COLLECTIONS.templates).getFullList<TemplateRecord>({ sort: "name" }, { requestKey: null }),
    pb.collection(COLLECTIONS.projects).getFullList<ProjectRecord>({
      filter: "archived = false",
      sort: "created",
    }, { requestKey: null }),
    pb.collection(COLLECTIONS.states).getFullList<StateRecord>({ sort: "sort_order" }, { requestKey: null }),
    pb.collection(COLLECTIONS.tasks).getFullList<TodoRecord>({ sort: "rank" }, { requestKey: null }),
    pb.collection(COLLECTIONS.labels).getFullList<LabelRecord>({ sort: "name" }, { requestKey: null }),
    pb.collection(COLLECTIONS.members).getFullList<MemberRecord>({
      expand: "user",
      sort: "created",
    }, { requestKey: null }),
  ])

  return {
    templates: templates.map(toTemplate),
    projects: projects.map(toProject),
    states: states.map(toState),
    todos: todos.map(toTodo),
    labels: labels.map(toLabel),
    members: members.map(toMember),
  }
}

async function connectRealtime(set: (patch: Partial<BoardState> | ((state: BoardState) => Partial<BoardState>)) => void) {
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
            ? { filter: "archived = false", requestKey: null }
            : { requestKey: null }
      const unsubscribe = await pb.collection(collection).subscribe<T>("*", (event) => {
        set((state) => {
          const current = state[key] as Array<{ id: string }>
          if (event.action === "delete") {
            return { [key]: current.filter((item) => item.id !== event.record.id) } as Partial<BoardState>
          }
          return { [key]: upsertById(current, mapRecord(event.record)) } as Partial<BoardState>
        })
      }, options)
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
  states: [],
  todos: [],
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
      const snapshot = await loadBoardSnapshot()
      set({ ...snapshot, initialized: true })
      if (connectionWanted) await connectRealtime(set)
    } catch (error) {
      set({ error: messageFromError(error, "Could not load the board") })
    } finally {
      set({ loading: false })
    }
  },

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
          templateId: input.templateId || "",
        },
      })
      const snapshot = await loadBoardSnapshot()
      set(snapshot)
    } catch (error) {
      const message = messageFromError(error, "Could not create the project")
      set({ error: message })
      throw new Error(message, { cause: error })
    }
  },

  removeProject: async (id) => {
    try {
      await pb.collection(COLLECTIONS.projects).delete(id)
      set((state) => ({
        projects: state.projects.filter((project) => project.id !== id),
        states: state.states.filter((item) => item.projectId !== id),
        todos: state.todos.filter((todo) => todo.projectId !== id),
        labels: state.labels.filter((label) => label.projectId !== id),
        members: state.members.filter((member) => member.projectId !== id),
      }))
    } catch (error) {
      const message = messageFromError(error, "Could not delete the project")
      set({ error: message })
      throw new Error(message, { cause: error })
    }
  },

  toggleProjectCollapse: (id) =>
    set((state) => {
      const project = state.projects.find((item) => item.id === id)
      if (project?.collapsed) collapsedProjects.delete(id)
      else collapsedProjects.add(id)
      return {
        projects: state.projects.map((item) =>
          item.id === id ? { ...item, collapsed: !item.collapsed } : item
        ),
      }
    }),

  addState: async (projectId, input) => {
    const sameProject = get().states.filter((state) => state.projectId === projectId)
    const sortOrder = Math.max(0, ...sameProject.map((state) => state.sortOrder)) + 1024
    try {
      const record = await pb.collection(COLLECTIONS.states).create<StateRecord>({
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
      throw new Error(message, { cause: error })
    }
  },

  updateState: async (id, patch) => {
    try {
      const record = await pb.collection(COLLECTIONS.states).update<StateRecord>(id, patch)
      set((state) => ({ states: upsertById(state.states, toState(record)) }))
    } catch (error) {
      const message = messageFromError(error, "Could not update the state")
      set({ error: message })
      throw new Error(message, { cause: error })
    }
  },

  removeState: async (id) => {
    try {
      await pb.collection(COLLECTIONS.states).delete(id)
      set((state) => ({ states: state.states.filter((item) => item.id !== id) }))
    } catch (error) {
      const message = messageFromError(error, "Move or delete the tasks in this state first")
      set({ error: message })
      throw new Error(message, { cause: error })
    }
  },

  reorderState: async (id, direction) => {
    const state = get().states.find((item) => item.id === id)
    if (!state) return
    const ordered = get().states
      .filter((item) => item.projectId === state.projectId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const from = ordered.findIndex((item) => item.id === id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= ordered.length) return
    ;[ordered[from], ordered[to]] = [ordered[to], ordered[from]]
    const updates = ordered.map((item, index) => ({ ...item, sortOrder: (index + 1) * 1024 }))
    set((current) => ({
      states: current.states.map((item) => updates.find((next) => next.id === item.id) || item),
    }))
    try {
      await Promise.all(
        updates.map((item) =>
          pb.collection(COLLECTIONS.states).update(item.id, { sort_order: item.sortOrder })
        )
      )
    } catch (error) {
      const snapshot = await loadBoardSnapshot()
      set({ ...snapshot, error: messageFromError(error, "Could not reorder states") })
    }
  },

  addLabel: async (projectId, input) => {
    try {
      const record = await pb.collection(COLLECTIONS.labels).create<LabelRecord>({
        project: projectId,
        name: input.name,
        color: input.color,
      })
      set((state) => ({ labels: upsertById(state.labels, toLabel(record)) }))
    } catch (error) {
      const message = messageFromError(error, "Could not add the label")
      set({ error: message })
      throw new Error(message, { cause: error })
    }
  },

  updateLabel: async (id, patch) => {
    try {
      const record = await pb.collection(COLLECTIONS.labels).update<LabelRecord>(id, patch)
      set((state) => ({ labels: upsertById(state.labels, toLabel(record)) }))
    } catch (error) {
      const message = messageFromError(error, "Could not update the label")
      set({ error: message })
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
      throw new Error(message, { cause: error })
    }
  },

  addTodo: async (todo) => {
    const sameState = get().todos.filter(
      (item) => item.projectId === todo.projectId && item.stateId === todo.stateId
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
      throw new Error(message, { cause: error })
    }
  },

  updateTodo: async (id, patch) => {
    try {
      const record = await pb
        .collection(COLLECTIONS.tasks)
        .update<TodoRecord>(id, todoPatchToRecord(patch))
      set((state) => ({ todos: upsertById(state.todos, toTodo(record)) }))
    } catch (error) {
      const message = messageFromError(error, "Could not update the task")
      set({ error: message })
      throw new Error(message, { cause: error })
    }
  },

  removeTodo: async (id) => {
    try {
      await pb.collection(COLLECTIONS.tasks).delete(id)
      set((state) => ({ todos: state.todos.filter((item) => item.id !== id) }))
    } catch (error) {
      const message = messageFromError(error, "Could not delete the task")
      set({ error: message })
      throw new Error(message, { cause: error })
    }
  },

  moveTodo: async (id, toStateId, toIndex) => {
    const dragged = get().todos.find((todo) => todo.id === id)
    if (!dragged) return
    const target = get().todos
      .filter((todo) => todo.stateId === toStateId && todo.id !== id)
      .sort((a, b) => a.rank - b.rank)
    const before = target[toIndex - 1]
    const after = target[toIndex]
    const rank = before && after
      ? (before.rank + after.rank) / 2
      : before
        ? before.rank + 1024
        : after
          ? after.rank - 1024
          : 1024
    const optimistic = { ...dragged, stateId: toStateId, rank }
    set((state) => ({ todos: upsertById(state.todos, optimistic) }))
    try {
      const record = await pb.collection(COLLECTIONS.tasks).update<TodoRecord>(id, {
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
