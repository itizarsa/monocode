import { pathKey, projectName } from "../../shared/lib/paths";

/** Prototype store: tasks live in this window's local storage. */
const STORAGE_KEY = "monocode.tasks.v1";
export const TASKS_CHANGED_EVENT = "monocode:tasks-changed";

export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "done",
  "canceled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  canceled: "Canceled",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

/** A task belongs to one project, or to no project at all. */
export type TaskScope = { kind: "global" } | { kind: "project"; cwd: string };

export type Task = {
  id: string;
  /** Short readable key such as MONO-12, unique per scope. */
  key: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  /** Absent for global tasks. */
  projectCwd?: string;
  /** Session that created the task through /operator. */
  sourceSessionId?: string;
  /** Session that last changed the task through /operator. */
  updatedBySessionId?: string;
  createdAt: number;
  updatedAt: number;
};

export type TaskInput = {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  labels?: string[];
};

type Stored = { tasks: Task[]; counters: Record<string, number> };

export const MAX_TASK_TITLE = 200;
export const MAX_TASK_LABELS = 10;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read(): Stored {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return { tasks: [], counters: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      counters: parsed.counters ?? {},
    };
  } catch {
    return { tasks: [], counters: {} };
  }
}

function write(next: Stored) {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(next));
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
}

export function scopeKey(scope: TaskScope): string {
  return scope.kind === "global" ? "global" : pathKey(scope.cwd);
}

export function taskScope(task: Task): TaskScope {
  return task.projectCwd
    ? { kind: "project", cwd: task.projectCwd }
    : { kind: "global" };
}

export function sameScope(a: TaskScope, b: TaskScope): boolean {
  return scopeKey(a) === scopeKey(b);
}

/** MONO for /src/monocode, TASK for global tasks. */
export function scopePrefix(scope: TaskScope): string {
  if (scope.kind === "global") return "TASK";
  const letters = projectName(scope.cwd)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return letters.slice(0, 4) || "PROJ";
}

export function listTasks(scope?: TaskScope): Task[] {
  const { tasks } = read();
  const scoped = scope
    ? tasks.filter((task) => sameScope(taskScope(task), scope))
    : tasks;
  return [...scoped].sort(
    (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
  );
}

export function getTask(idOrKey: string): Task | null {
  const needle = idOrKey.trim();
  return (
    read().tasks.find(
      (task) =>
        task.id === needle || task.key.toLowerCase() === needle.toLowerCase(),
    ) ?? null
  );
}

export function normalizeTaskLabels(labels: readonly string[]): string[] {
  const out: string[] = [];
  for (const input of labels) {
    const label = input.trim().replace(/^#+/, "").replace(/\s+/g, "-");
    const lower = label.toLowerCase().slice(0, 32);
    if (!lower || out.includes(lower)) continue;
    out.push(lower);
    if (out.length === MAX_TASK_LABELS) break;
  }
  return out;
}

export function createTask(
  scope: TaskScope,
  input: TaskInput & { title: string },
  meta: { id?: string; sourceSessionId?: string; now?: number } = {},
): Task {
  const stored = read();
  const counterKey = scopeKey(scope);
  const number = (stored.counters[counterKey] ?? 0) + 1;
  const now = meta.now ?? Date.now();
  const task: Task = {
    id: meta.id ?? crypto.randomUUID(),
    key: `${scopePrefix(scope)}-${number}`,
    title: input.title.trim().slice(0, MAX_TASK_TITLE) || "Untitled task",
    description: (input.description ?? "").replace(/\r\n?/g, "\n"),
    status: input.status ?? "todo",
    priority: input.priority ?? "none",
    labels: normalizeTaskLabels(input.labels ?? []),
    ...(scope.kind === "project" ? { projectCwd: scope.cwd } : {}),
    ...(meta.sourceSessionId ? { sourceSessionId: meta.sourceSessionId } : {}),
    createdAt: now,
    updatedAt: now,
  };
  write({
    tasks: [...stored.tasks, task],
    counters: { ...stored.counters, [counterKey]: number },
  });
  return task;
}

export function updateTask(
  id: string,
  patch: TaskInput,
  meta: { sessionId?: string; now?: number } = {},
): Task {
  const stored = read();
  const current = stored.tasks.find((task) => task.id === id);
  if (!current) throw new Error("Task was not found");
  const next: Task = {
    ...current,
    ...(patch.title !== undefined
      ? { title: patch.title.trim().slice(0, MAX_TASK_TITLE) || current.title }
      : {}),
    ...(patch.description !== undefined
      ? { description: patch.description.replace(/\r\n?/g, "\n") }
      : {}),
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.priority ? { priority: patch.priority } : {}),
    ...(patch.labels ? { labels: normalizeTaskLabels(patch.labels) } : {}),
    ...(meta.sessionId ? { updatedBySessionId: meta.sessionId } : {}),
    updatedAt: meta.now ?? Date.now(),
  };
  write({
    ...stored,
    tasks: stored.tasks.map((task) => (task.id === id ? next : task)),
  });
  return next;
}

export function deleteTask(id: string) {
  const stored = read();
  write({ ...stored, tasks: stored.tasks.filter((task) => task.id !== id) });
}

/** Projects that already hold tasks, for the scope list. */
export function taskProjects(): string[] {
  const seen = new Map<string, string>();
  for (const task of read().tasks)
    if (task.projectCwd && !seen.has(pathKey(task.projectCwd)))
      seen.set(pathKey(task.projectCwd), task.projectCwd);
  return [...seen.values()];
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus);
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return TASK_PRIORITIES.includes(value as TaskPriority);
}

/** Stable label colors, in the spirit of tracker label dots. */
const LABEL_COLORS = [
  "#8b5cf6",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
  "#ef4444",
];

export function labelColor(label: string): string {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return LABEL_COLORS[Math.abs(hash) % LABEL_COLORS.length]!;
}
