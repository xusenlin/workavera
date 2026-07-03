import { create } from "zustand"
import { persist } from "zustand/middleware"

export type Priority = "low" | "medium" | "high" | "urgent"

export type TodoStatus = "todo" | "in_progress" | "testing" | "done"

export type Label = {
  id: string
  name: string
  color: string
}

export type Member = {
  id: string
  name: string
  avatar?: string
}

export type Todo = {
  id: string
  projectId: string
  status: TodoStatus
  title: string
  description?: string
  priority: Priority
  labels: string[]
  members: string[]
  dueDate?: string
  order: number
}

export type Project = {
  id: string
  name: string
  collapsed: boolean
}

type TodoState = {
  projects: Project[]
  todos: Todo[]
  labels: Label[]
  members: Member[]
  addProject: (name: string) => void
  removeProject: (id: string) => void
  toggleProjectCollapse: (id: string) => void
  addTodo: (todo: Omit<Todo, "id" | "order">) => void
  updateTodo: (id: string, patch: Partial<Omit<Todo, "id">>) => void
  removeTodo: (id: string) => void
  moveTodo: (id: string, toStatus: TodoStatus, toIndex: number) => void
}

function generateId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// Seed data for first-time users
const seedLabels: Label[] = [
  { id: "label_bug", name: "Bug", color: "#ef4444" },
  { id: "label_feature", name: "Feature", color: "#3b82f6" },
  { id: "label_design", name: "Design", color: "#a855f7" },
  { id: "label_urgent", name: "Urgent", color: "#f59e0b" },
  { id: "label_docs", name: "Docs", color: "#14b8a6" },
  { id: "label_refactor", name: "Refactor", color: "#6366f1" },
  { id: "label_api", name: "API", color: "#ec4899" },
  { id: "label_perf", name: "Performance", color: "#22c55e" },
]

const seedMembers: Member[] = [
  { id: "member_1", name: "Senlin Xu" },
  { id: "member_2", name: "Alice Chen" },
  { id: "member_3", name: "Bob Wang" },
  { id: "member_4", name: "Diana Liu" },
  { id: "member_5", name: "Eric Zhang" },
]

const seedProjects: Project[] = [
  {
    id: "project_seed",
    name: "Workavera Platform",
    collapsed: false,
  },
  {
    id: "project_mobile",
    name: "Mobile App",
    collapsed: false,
  },
  {
    id: "project_infra",
    name: "Infrastructure",
    collapsed: false,
  },
]

const day = 86400000
const today = Date.now()
const dateIn = (days: number) => new Date(today + day * days).toISOString().slice(0, 10)

const seedTodos: Todo[] = [
  // === Workavera Platform ===
  {
    id: "todo_1",
    projectId: "project_seed",
    status: "todo",
    title: "Design landing page hero",
    description: "Create a hero section with the new brand identity and CTA.",
    priority: "high",
    labels: ["label_design", "label_feature"],
    members: ["member_1"],
    dueDate: dateIn(3),
    order: 0,
  },
  {
    id: "todo_2",
    projectId: "project_seed",
    status: "todo",
    title: "Fix login redirect loop",
    description: "Users get stuck in a redirect loop after OAuth callback.",
    priority: "urgent",
    labels: ["label_bug"],
    members: ["member_2"],
    dueDate: dateIn(1),
    order: 1,
  },
  {
    id: "todo_3",
    projectId: "project_seed",
    status: "todo",
    title: "Write API documentation for v2 endpoints",
    priority: "low",
    labels: ["label_docs", "label_api"],
    members: ["member_4"],
    dueDate: dateIn(10),
    order: 2,
  },
  {
    id: "todo_2b",
    projectId: "project_seed",
    status: "todo",
    title: "Add dark mode toggle to settings page",
    description: "Wire up the existing theme toggle into the settings UI.",
    priority: "medium",
    labels: ["label_feature", "label_design"],
    members: ["member_3"],
    dueDate: dateIn(8),
    order: 3,
  },
  {
    id: "todo_2c",
    projectId: "project_seed",
    status: "todo",
    title: "Implement search across all pages",
    description: "Global search with keyboard shortcut Cmd+K.",
    priority: "medium",
    labels: ["label_feature"],
    members: ["member_1", "member_4"],
    dueDate: dateIn(12),
    order: 4,
  },
  {
    id: "todo_2d",
    projectId: "project_seed",
    status: "todo",
    title: "Add email notification preferences",
    priority: "low",
    labels: ["label_feature", "label_api"],
    members: ["member_2"],
    order: 5,
  },
  {
    id: "todo_2e",
    projectId: "project_seed",
    status: "todo",
    title: "Fix avatar fallback initials",
    description: "Single-letter initial shows but should be capitalized consistently.",
    priority: "low",
    labels: ["label_bug", "label_design"],
    members: ["member_4"],
    dueDate: dateIn(2),
    order: 6,
  },
  {
    id: "todo_4",
    projectId: "project_seed",
    status: "in_progress",
    title: "Implement Kanban drag-and-drop",
    description: "Use @dnd-kit for cross-column card movement.",
    priority: "high",
    labels: ["label_feature"],
    members: ["member_1", "member_3"],
    dueDate: dateIn(5),
    order: 0,
  },
  {
    id: "todo_5",
    projectId: "project_seed",
    status: "in_progress",
    title: "Refactor auth middleware",
    description: "Simplify token refresh logic and extract shared guards.",
    priority: "medium",
    labels: ["label_refactor"],
    members: ["member_2"],
    order: 1,
  },
  {
    id: "todo_6",
    projectId: "project_seed",
    status: "testing",
    title: "Test model settings persistence",
    priority: "medium",
    labels: ["label_bug"],
    members: ["member_2"],
    order: 0,
  },
  {
    id: "todo_7",
    projectId: "project_seed",
    status: "testing",
    title: "E2E test for settings flow",
    description: "Cover add/edit/remove model scenarios.",
    priority: "medium",
    labels: ["label_docs", "label_feature"],
    members: ["member_3"],
    order: 1,
  },
  {
    id: "todo_8",
    projectId: "project_seed",
    status: "done",
    title: "Set up project scaffolding",
    priority: "medium",
    labels: ["label_feature"],
    members: ["member_1"],
    order: 0,
  },
  {
    id: "todo_9",
    projectId: "project_seed",
    status: "done",
    title: "Configure CI/CD pipeline",
    priority: "high",
    labels: ["label_feature", "label_api"],
    members: ["member_5"],
    order: 1,
  },

  // === Mobile App ===
  {
    id: "todo_10",
    projectId: "project_mobile",
    status: "todo",
    title: "Design onboarding flow",
    description: "3-step onboarding with animated illustrations.",
    priority: "high",
    labels: ["label_design"],
    members: ["member_4"],
    dueDate: dateIn(4),
    order: 0,
  },
  {
    id: "todo_11",
    projectId: "project_mobile",
    status: "todo",
    title: "Push notification service",
    description: "Integrate FCM for Android and APNs for iOS.",
    priority: "medium",
    labels: ["label_feature", "label_api"],
    members: ["member_3", "member_5"],
    dueDate: dateIn(7),
    order: 1,
  },
  {
    id: "todo_12",
    projectId: "project_mobile",
    status: "in_progress",
    title: "Offline mode sync logic",
    description: "Queue mutations and sync when connection restores.",
    priority: "urgent",
    labels: ["label_feature", "label_perf"],
    members: ["member_5"],
    dueDate: dateIn(2),
    order: 0,
  },
  {
    id: "todo_13",
    projectId: "project_mobile",
    status: "in_progress",
    title: "Dark mode theme tokens",
    priority: "low",
    labels: ["label_design", "label_refactor"],
    members: ["member_4"],
    order: 1,
  },
  {
    id: "todo_14",
    projectId: "project_mobile",
    status: "testing",
    title: "Crash on Android 12 startup",
    priority: "urgent",
    labels: ["label_bug"],
    members: ["member_5"],
    dueDate: dateIn(1),
    order: 0,
  },
  {
    id: "todo_15",
    projectId: "project_mobile",
    status: "done",
    title: "App icon and splash screen",
    priority: "low",
    labels: ["label_design"],
    members: ["member_4"],
    order: 0,
  },

  // === Infrastructure ===
  {
    id: "todo_16",
    projectId: "project_infra",
    status: "todo",
    title: "Migrate database to PostgreSQL 16",
    description: "Plan downtime window and run migration scripts.",
    priority: "high",
    labels: ["label_feature", "label_perf"],
    members: ["member_2", "member_5"],
    dueDate: dateIn(14),
    order: 0,
  },
  {
    id: "todo_17",
    projectId: "project_infra",
    status: "todo",
    title: "Set up monitoring dashboards",
    description: "Grafana panels for CPU, memory, and request latency.",
    priority: "medium",
    labels: ["label_feature", "label_docs"],
    members: ["member_3"],
    dueDate: dateIn(6),
    order: 1,
  },
  {
    id: "todo_18",
    projectId: "project_infra",
    status: "in_progress",
    title: "Optimize CDN cache rules",
    description: "Reduce cache miss rate for static assets.",
    priority: "medium",
    labels: ["label_perf"],
    members: ["member_5"],
    dueDate: dateIn(3),
    order: 0,
  },
  {
    id: "todo_19",
    projectId: "project_infra",
    status: "testing",
    title: "Load test API gateway",
    description: "Run 10k concurrent requests and measure p99 latency.",
    priority: "high",
    labels: ["label_perf", "label_api"],
    members: ["member_2"],
    dueDate: dateIn(2),
    order: 0,
  },
  {
    id: "todo_20",
    projectId: "project_infra",
    status: "done",
    title: "Provision staging environment",
    priority: "medium",
    labels: ["label_feature"],
    members: ["member_5"],
    order: 0,
  },
  {
    id: "todo_21",
    projectId: "project_infra",
    status: "done",
    title: "Configure secrets management",
    description: "Set up Vault for storing API keys and certificates.",
    priority: "high",
    labels: ["label_feature", "label_refactor"],
    members: ["member_2"],
    order: 1,
  },
]

export const useBoardStore = create<TodoState>()(
  persist(
    (set) => ({
      projects: seedProjects,
      todos: seedTodos,
      labels: seedLabels,
      members: seedMembers,

      addProject: (name) =>
        set((state) => ({
          projects: [
            ...state.projects,
            {
              id: generateId("project"),
              name,
              collapsed: false,
            },
          ],
        })),

      removeProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          todos: state.todos.filter((t) => t.projectId !== id),
        })),

      toggleProjectCollapse: (id) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, collapsed: !p.collapsed } : p
          ),
        })),

      addTodo: (todo) =>
        set((state) => {
          const sameColumn = state.todos.filter(
            (t) => t.projectId === todo.projectId && t.status === todo.status
          )
          const order = sameColumn.length
          return {
            todos: [
              ...state.todos,
              { ...todo, id: generateId("todo"), order },
            ],
          }
        }),

      updateTodo: (id, patch) =>
        set((state) => ({
          todos: state.todos.map((t) =>
            t.id === id ? { ...t, ...patch } : t
          ),
        })),

      removeTodo: (id) =>
        set((state) => ({
          todos: state.todos
            .filter((t) => t.id !== id)
            .map((t) => ({ ...t })),
        })),

      moveTodo: (id, toStatus, toIndex) =>
        set((state) => {
          const dragged = state.todos.find((t) => t.id === id)
          if (!dragged) return state

          const fromStatus = dragged.status
          const projectId = dragged.projectId

          // Get all todos in the target column (excluding the dragged one)
          const targetColumn = state.todos
            .filter(
              (t) =>
                t.projectId === projectId &&
                t.status === toStatus &&
                t.id !== id
            )
            .sort((a, b) => a.order - b.order)

          // Insert at the target index
          targetColumn.splice(toIndex, 0, {
            ...dragged,
            status: toStatus,
          })

          // Reassign orders in target column
          const updatedTarget = targetColumn.map((t, idx) => ({
            ...t,
            order: idx,
          }))

          // Reassign orders in source column if different
          let updatedTodos = state.todos
          if (fromStatus !== toStatus) {
            const sourceColumn = state.todos
              .filter(
                (t) =>
                  t.projectId === projectId &&
                  t.status === fromStatus &&
                  t.id !== id
              )
              .sort((a, b) => a.order - b.order)
              .map((t, idx) => ({ ...t, order: idx }))

            updatedTodos = state.todos.map((t) => {
              if (t.id === id) {
                return updatedTarget.find((u) => u.id === id)!
              }
              const sourceUpdated = sourceColumn.find((s) => s.id === t.id)
              if (sourceUpdated) return sourceUpdated
              const targetUpdated = updatedTarget.find((u) => u.id === t.id)
              if (targetUpdated) return targetUpdated
              return t
            })
          } else {
            updatedTodos = state.todos.map((t) => {
              const targetUpdated = updatedTarget.find((u) => u.id === t.id)
              return targetUpdated ?? t
            })
          }

          return { todos: updatedTodos }
        }),
    }),
    {
      name: "todo-storage",
      version: 3,
      migrate: () => ({
        projects: seedProjects,
        todos: seedTodos,
        labels: seedLabels,
        members: seedMembers,
      }),
    }
  )
)

export const STATUS_META: {
  value: TodoStatus
  label: string
  color: string
}[] = [
  { value: "todo", label: "Todo", color: "#64748b" },
  { value: "in_progress", label: "In Progress", color: "#3b82f6" },
  { value: "testing", label: "Testing", color: "#f59e0b" },
  { value: "done", label: "Done", color: "#22c55e" },
]

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
