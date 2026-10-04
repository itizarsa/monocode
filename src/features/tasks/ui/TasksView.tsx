import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import {
  Bot,
  ChevronLeft,
  Globe,
  Kanban,
  ListBullet,
  MessageSquare,
  Plus,
  Search,
  TaskDone,
  Trash2,
  X,
} from "../../../shared/ui/icons";
import { OverlayNav } from "../../../app/shell/TitleBar";
import { WindowControls } from "../../../app/shell/WindowControls";
import { IS_MAC, MOD } from "../../../platform/tauri/platform";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";
import { pathKey, projectKey, projectName } from "../../../shared/lib/paths";
import { formatRelativeTime } from "../../inbox/model/githubTasks";
import { ProjectLogoIcon } from "../../projects/ui/ProjectLogoIcon";
import { ProjectMascot } from "../../projects/ui/ProjectMascot";
import { useTabGroupLogos } from "../../projects/hooks/useTabGroupLogos";
import {
  looksLikeProject,
  type RecentProject,
} from "../../projects/model/recents";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupMascots,
  resolveTabGroupColor,
  resolveTabGroupLogo,
  resolveTabGroupMascot,
} from "../../workspace/model/tabGroups";
import { AgentMarkdown } from "../../sessions/ui/AgentMarkdown";
import {
  addTaskComment,
  createTask,
  deleteTask,
  deleteTaskComment,
  restoreTask,
  taskComments,
  labelColor,
  listTasks,
  sameScope,
  scopeKey,
  taskProjects,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  TASKS_CHANGED_EVENT,
  updateTask,
  type Task,
  type TaskPriority,
  type TaskScope,
  type TaskComment,
  type TaskStatus,
} from "../tasks";

type Props = {
  besideRail?: boolean;
  compactRail?: boolean;
  cwd: string;
  recents: RecentProject[];
  onClose: () => void;
  onToggleSidebar?: () => void;
};

type Layout = "board" | "list";

/** Kept per project, so Tasks opens on the project you are in. */
let rememberedScope: { cwd: string; scope: TaskScope } | null = null;
let rememberedLayout: Layout = "board";
let rememberedCollapsed: TaskStatus[] = ["canceled"];

export function TasksView({
  besideRail = false,
  compactRail = false,
  cwd,
  recents,
  onClose,
  onToggleSidebar,
}: Props) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [scope, setScope] = useState<TaskScope>(() =>
    rememberedScope && pathKey(rememberedScope.cwd) === pathKey(cwd)
      ? rememberedScope.scope
      : looksLikeProject(cwd)
        ? { kind: "project", cwd }
        : { kind: "global" },
  );
  const [layout, setLayout] = useState<Layout>(rememberedLayout);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState<TaskStatus | null>(null);
  const [deleteAsked, setDeleteAsked] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<Task | null>(null);

  useEffect(() => {
    if (!deleted) return;
    const timer = window.setTimeout(() => setDeleted(null), 8000);
    return () => window.clearTimeout(timer);
  }, [deleted]);

  const requestDelete = useCallback((id: string) => {
    setSelectedId(id);
    setDeleteAsked(id);
  }, []);

  const [openedFrom] = useState(cwd);
  useEffect(() => {
    rememberedScope = { cwd: openedFrom, scope };
  }, [openedFrom, scope]);
  useEffect(() => {
    rememberedLayout = layout;
  }, [layout]);

  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    window.addEventListener(TASKS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(TASKS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      event.preventDefault();
      event.stopPropagation();
      if (selectedIdRef.current) setSelectedId(null);
      else onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => listTasks(), [version]);
  const projects = useMemo(() => {
    const seen = new Map<string, string>();
    const add = (path: string) => {
      if (looksLikeProject(path) && !seen.has(pathKey(path)))
        seen.set(pathKey(path), path);
    };
    if (cwd) add(cwd);
    for (const recent of recents.slice(0, 8)) add(recent.path);
    for (const path of taskProjects()) add(path);
    return [...seen.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, recents, version]);

  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const task of all) {
      if (task.status === "done" || task.status === "canceled") continue;
      const key = task.projectCwd ? pathKey(task.projectCwd) : "global";
      out.set(key, (out.get(key) ?? 0) + 1);
    }
    return out;
  }, [all]);

  const scoped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((task) => {
      const inScope = task.projectCwd
        ? scope.kind === "project" &&
          sameScope(scope, {
            kind: "project",
            cwd: task.projectCwd,
          })
        : scope.kind === "global";
      if (!inScope) return false;
      if (!needle) return true;
      return (
        task.title.toLowerCase().includes(needle) ||
        task.key.toLowerCase().includes(needle) ||
        task.labels.some((label) => label.includes(needle.replace(/^#/, "")))
      );
    });
  }, [all, scope, query]);

  const selected = all.find((task) => task.id === selectedId) ?? null;

  const onMove = useCallback((id: string, status: TaskStatus) => {
    updateTask(id, { status });
  }, []);

  const onCreate = useCallback(
    (status: TaskStatus, title: string) => {
      const task = createTask(scope, { title, status });
      return task;
    },
    [scope],
  );

  const marks = useProjectMarks();
  const scopeLabel =
    scope.kind === "global" ? "Global" : projectName(scope.cwd);

  return (
    <div
      role="region"
      aria-label="Tasks"
      data-app-tasks
      className="flex min-h-0 min-w-0 flex-1 flex-col text-content"
    >
      <div
        className="flex h-10 shrink-0 select-none items-center border-b border-stroke"
        data-tauri-drag-region="deep"
      >
        {IS_MAC && compactRail ? <div className="w-4 shrink-0" /> : null}
        {IS_MAC && !besideRail ? <div className="w-[78px] shrink-0" /> : null}
        {besideRail ? null : (
          <OverlayNav onBack={onClose} onToggleSidebar={onToggleSidebar} />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[13px]">
          <TaskDone
            className="size-3.5 shrink-0 text-content/45"
            strokeWidth={1.75}
          />
          <span className="text-content/50">Tasks</span>
          <span className="text-content/25">/</span>
          <span className="min-w-0 truncate text-content">{scopeLabel}</span>
        </div>
        {IS_MAC ? null : <WindowControls />}
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <ScopeList
          scope={scope}
          projects={projects}
          counts={counts}
          marks={marks}
          onSelect={(next) => {
            setScope(next);
            setSelectedId(null);
            setComposing(null);
          }}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Toolbar
            layout={layout}
            query={query}
            onLayout={setLayout}
            onQuery={setQuery}
            onNew={() => setComposing("todo")}
            total={scoped.length}
          />
          {layout === "board" ? (
            <Board
              tasks={scoped}
              selectedId={selectedId}
              composing={composing}
              onCompose={setComposing}
              onCreate={(status, title) => {
                onCreate(status, title);
              }}
              onSelect={setSelectedId}
              onRequestDelete={requestDelete}
              onMove={onMove}
            />
          ) : (
            <ListLayout
              tasks={scoped}
              selectedId={selectedId}
              composing={composing}
              onCompose={setComposing}
              onCreate={(status, title) => {
                onCreate(status, title);
              }}
              onSelect={setSelectedId}
              onRequestDelete={requestDelete}
            />
          )}
        </div>
        {selected ? (
          <TaskDetail
            key={selected.id}
            task={selected}
            marks={marks}
            confirmDelete={deleteAsked === selected.id}
            onConfirmDelete={(ask) => setDeleteAsked(ask ? selected.id : null)}
            onClose={() => setSelectedId(null)}
            onDelete={() => {
              deleteTask(selected.id);
              setDeleted(selected);
              setDeleteAsked(null);
              setSelectedId(null);
            }}
          />
        ) : null}
        {deleted ? (
          <div
            role="status"
            className="pointer-events-auto absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-stroke bg-background-base px-3 py-2 text-[12.5px] shadow-lg"
          >
            <span>
              Deleted{" "}
              <span className="font-mono text-[11.5px]">{deleted.key}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                restoreTask(deleted);
                setDeleted(null);
              }}
              className="font-medium text-accent hover:underline"
            >
              Undo
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- Scope list ---------- */

type ProjectMarks = {
  logos: Record<string, string>;
  mascots: Record<string, string>;
  colors: Record<string, number>;
  customColors: Record<string, string>;
};

function useProjectMarks(): ProjectMarks {
  const logos = useTabGroupLogos();
  const [mascots] = useState(loadTabGroupMascots);
  const [colors] = useState(loadTabGroupColors);
  const [customColors] = useState(loadTabGroupCustomColors);
  return { logos, mascots, colors, customColors };
}

function ProjectMark({ cwd, marks }: { cwd: string; marks: ProjectMarks }) {
  const project = projectName(cwd);
  const key = projectKey(cwd);
  const logoPath = resolveTabGroupLogo(key, marks.logos);
  if (logoPath)
    return (
      <ProjectLogoIcon
        path={logoPath}
        className="size-3.5 shrink-0 rounded-sm"
        imageClassName="size-3.5"
      />
    );
  return (
    <ProjectMascot
      project={project}
      color={resolveTabGroupColor(
        key,
        marks.colors,
        marks.customColors,
        project,
      )}
      name={resolveTabGroupMascot(key, marks.mascots)}
      className="size-3 shrink-0"
    />
  );
}

function ScopeList({
  scope,
  projects,
  counts,
  marks,
  onSelect,
}: {
  scope: TaskScope;
  projects: string[];
  counts: Map<string, number>;
  marks: ProjectMarks;
  onSelect: (scope: TaskScope) => void;
}) {
  const lock = useLockOverscroll<HTMLDivElement>();
  const active = scopeKey(scope);
  const row = (
    key: string,
    label: string,
    icon: React.ReactNode,
    next: TaskScope,
  ) => (
    <button
      key={key}
      type="button"
      aria-current={active === key ? "true" : undefined}
      onClick={() => onSelect(next)}
      className={`flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] ${
        active === key
          ? "bg-selection text-content"
          : "text-content/70 hover:bg-content/5 hover:text-content"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {counts.get(key) ? (
        <span className="text-[11px] tabular-nums text-content/40">
          {counts.get(key)}
        </span>
      ) : null}
    </button>
  );
  return (
    <div
      ref={lock}
      className="flex w-44 shrink-0 flex-col gap-px overflow-y-auto overscroll-none border-r border-stroke p-1.5"
    >
      {row(
        "global",
        "Global",
        <Globe className="size-3.5 shrink-0 text-content/50" />,
        { kind: "global" },
      )}
      <div className="px-2 pb-1 pt-3 text-[11px] font-medium text-content/40">
        Projects
      </div>
      {projects.map((path) =>
        row(
          pathKey(path),
          projectName(path),
          <ProjectMark cwd={path} marks={marks} />,
          { kind: "project", cwd: path },
        ),
      )}
    </div>
  );
}

/* ---------- Toolbar ---------- */

function Toolbar({
  layout,
  query,
  total,
  onLayout,
  onQuery,
  onNew,
}: {
  layout: Layout;
  query: string;
  total: number;
  onLayout: (layout: Layout) => void;
  onQuery: (query: string) => void;
  onNew: () => void;
}) {
  const seg = (value: Layout, label: string, Icon: typeof Kanban) => (
    <button
      type="button"
      aria-pressed={layout === value}
      onClick={() => onLayout(value)}
      className={`flex h-6 items-center gap-1.5 rounded-[5px] px-2 text-[12px] ${
        layout === value
          ? "bg-content/10 text-content"
          : "text-content/50 hover:text-content"
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-stroke px-3">
      <div className="flex items-center gap-0.5 rounded-md border border-stroke p-0.5">
        {seg("board", "Board", Kanban)}
        {seg("list", "List", ListBullet)}
      </div>
      <div className="relative flex h-7 w-56 min-w-0 shrink items-center">
        <Search className="pointer-events-none absolute left-2 size-3 opacity-50" />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Filter tasks"
          aria-label="Filter tasks"
          spellCheck={false}
          autoComplete="off"
          className="h-7 w-full rounded-md bg-transparent pl-7 pr-2 text-[12px] text-content outline-none placeholder:text-content/40"
        />
      </div>
      <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-content/40">
        {total} {total === 1 ? "task" : "tasks"}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onNew}
        className="flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-content px-2.5 text-[12px] font-medium text-background-base hover:opacity-90"
      >
        <Plus className="size-3.5" strokeWidth={2} />
        New task
      </button>
    </div>
  );
}

/* ---------- Glyphs (tracker-style status and priority marks) ---------- */

export function StatusIcon({
  status,
  className = "size-4",
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 16 16" className={`shrink-0 ${className}`} aria-hidden>
      {status === "backlog" ? (
        <circle
          cx="8"
          cy="8"
          r="6.4"
          fill="none"
          stroke="#94a3b8"
          strokeWidth="1.5"
          strokeDasharray="2.4 2.4"
        />
      ) : status === "todo" ? (
        <circle
          cx="8"
          cy="8"
          r="6.4"
          fill="none"
          stroke="#64748b"
          strokeWidth="1.5"
        />
      ) : status === "in_progress" ? (
        <>
          <circle
            cx="8"
            cy="8"
            r="6.4"
            fill="none"
            stroke="#eab308"
            strokeWidth="1.5"
          />
          <path d="M8 8 8 2.4 A5.6 5.6 0 0 1 13.6 8 Z" fill="#eab308" />
        </>
      ) : status === "done" ? (
        <>
          <circle cx="8" cy="8" r="7" fill="#22c55e" />
          <path
            d="m5 8 2 2 4-4.2"
            stroke="var(--color-background-base)"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="7" fill="#94a3b8" />
          <path
            d="m5.6 5.6 4.8 4.8m0-4.8-4.8 4.8"
            stroke="var(--color-background-base)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

export function PriorityIcon({ priority }: { priority: TaskPriority }) {
  if (priority === "urgent")
    return (
      <svg
        viewBox="0 0 14 14"
        className="size-3.5 shrink-0"
        aria-label="Urgent"
      >
        <rect x="1" y="1" width="12" height="12" rx="3" fill="#f97316" />
        <path
          d="M7 3.8v3.8"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="7" cy="10" r="0.9" fill="#fff" />
      </svg>
    );
  if (priority === "none")
    return (
      <svg
        viewBox="0 0 14 14"
        className="size-3.5 shrink-0"
        aria-label="No priority"
      >
        {[2.5, 6, 9.5].map((x) => (
          <rect
            key={x}
            x={x}
            y="6.3"
            width="2"
            height="1.4"
            rx="0.7"
            fill="currentColor"
            opacity="0.35"
          />
        ))}
      </svg>
    );
  const level = priority === "low" ? 1 : priority === "medium" ? 2 : 3;
  const bars: [number, number, number][] = [
    [1.5, 8.5, 3.5],
    [5.75, 5.5, 6.5],
    [10, 2.5, 9.5],
  ];
  return (
    <svg
      viewBox="0 0 14 14"
      className="size-3.5 shrink-0"
      aria-label={`${TASK_PRIORITY_LABEL[priority]} priority`}
    >
      {bars.map(([x, y, h], index) => (
        <rect
          key={x}
          x={x}
          y={y}
          width="2.5"
          height={h}
          rx="1"
          fill="currentColor"
          opacity={index < level ? 0.9 : 0.25}
        />
      ))}
    </svg>
  );
}

function LabelPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-stroke px-1.5 py-0.5 text-[10.5px] leading-none text-content/60">
      <span
        className="size-1.5 rounded-full"
        style={{ background: labelColor(label) }}
      />
      {label}
    </span>
  );
}

function AgentChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-content/[0.06] px-1.5 py-0.5 text-[10.5px] text-content/55">
      <Bot className="size-3" />
      Agent
    </span>
  );
}

function shortDate(time: number) {
  return new Date(time).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/* ---------- Board ---------- */

const DRAG_TYPE = "application/x-monocode-task";

function Board({
  tasks,
  selectedId,
  composing,
  onCompose,
  onCreate,
  onSelect,
  onRequestDelete,
  onMove,
}: {
  tasks: Task[];
  selectedId: string | null;
  composing: TaskStatus | null;
  onCompose: (status: TaskStatus | null) => void;
  onCreate: (status: TaskStatus, title: string) => void;
  onSelect: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onMove: (id: string, status: TaskStatus) => void;
}) {
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [collapsed, setCollapsed] = useState<TaskStatus[]>(
    () => rememberedCollapsed,
  );
  useEffect(() => {
    rememberedCollapsed = collapsed;
  }, [collapsed]);
  useEffect(() => {
    if (composing)
      setCollapsed((current) => current.filter((item) => item !== composing));
  }, [composing]);
  const lock = useLockOverscroll<HTMLDivElement>();
  return (
    <div
      ref={lock}
      className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto overscroll-none p-3"
    >
      {TASK_STATUSES.map((status) => {
        const column = tasks.filter((task) => task.status === status);
        const folded = collapsed.includes(status);
        const drop = {
          onDragOver: (event: ReactDragEvent) => {
            if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setOver(status);
          },
          onDragLeave: () =>
            setOver((current) => (current === status ? null : current)),
          onDrop: (event: ReactDragEvent) => {
            const id = event.dataTransfer.getData(DRAG_TYPE);
            setOver(null);
            if (id) onMove(id, status);
          },
        };
        if (folded)
          return (
            <button
              key={status}
              type="button"
              title={`Show ${TASK_STATUS_LABEL[status]}`}
              onClick={() =>
                setCollapsed((current) =>
                  current.filter((item) => item !== status),
                )
              }
              {...drop}
              className={`flex w-9 shrink-0 flex-col items-center gap-2 rounded-lg py-1.5 hover:bg-content/[0.04] ${
                over === status ? "bg-content/[0.06]" : ""
              }`}
            >
              <StatusIcon status={status} />
              <span className="flex items-center gap-1.5 text-[12px] font-medium [writing-mode:vertical-rl]">
                {TASK_STATUS_LABEL[status]}
                <span className="font-normal text-content/40">
                  {column.length}
                </span>
              </span>
            </button>
          );
        return (
          <div
            key={status}
            className={`flex min-h-0 w-[248px] min-w-[190px] flex-1 shrink-0 flex-col rounded-lg ${
              over === status ? "bg-content/[0.04]" : ""
            }`}
            {...drop}
          >
            <div className="mb-2 flex h-7 items-center justify-between px-1">
              <div className="flex items-center gap-2 text-[12.5px] font-medium">
                <StatusIcon status={status} />
                <span>{TASK_STATUS_LABEL[status]}</span>
                <span className="text-[11.5px] font-normal tabular-nums text-content/40">
                  {column.length}
                </span>
              </div>
              <div className="flex items-center">
                <button
                  type="button"
                  title={`Hide ${TASK_STATUS_LABEL[status]}`}
                  aria-label={`Hide ${TASK_STATUS_LABEL[status]}`}
                  onClick={() =>
                    setCollapsed((current) => [...current, status])
                  }
                  className="grid size-6 place-items-center rounded-md text-content/40 hover:bg-content/10 hover:text-content"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <button
                  type="button"
                  title={`Add to ${TASK_STATUS_LABEL[status]}`}
                  aria-label={`Add to ${TASK_STATUS_LABEL[status]}`}
                  onClick={() => onCompose(status)}
                  className="grid size-6 place-items-center rounded-md text-content/40 hover:bg-content/10 hover:text-content"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
              {composing === status ? (
                <InlineComposer
                  onCancel={() => onCompose(null)}
                  onSubmit={(title) => onCreate(status, title)}
                />
              ) : null}
              {column.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  active={task.id === selectedId}
                  onSelect={() => onSelect(task.id)}
                  onRequestDelete={() => onRequestDelete(task.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({
  task,
  active,
  onSelect,
  onRequestDelete,
}: {
  task: Task;
  active: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
}) {
  const comments = taskComments(task).length;
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={onSelect}
      onContextMenu={(event) => {
        event.preventDefault();
        onRequestDelete();
      }}
      onKeyDown={(event) => {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          onRequestDelete();
        }
      }}
      aria-current={active ? "true" : undefined}
      className={`flex w-full flex-col rounded-lg border p-3 text-left transition-colors ${
        active
          ? "border-content/25 bg-content/[0.07]"
          : "border-stroke bg-content/[0.025] hover:bg-content/[0.05]"
      }`}
    >
      <div className="mb-2 flex items-center justify-between text-content/50">
        <span className="font-mono text-[11px] text-content/45">
          {task.key}
        </span>
        <PriorityIcon priority={task.priority} />
      </div>
      <div className="flex items-start gap-2">
        <span className="mt-px">
          <StatusIcon status={task.status} className="size-[15px]" />
        </span>
        <p
          className={`line-clamp-2 text-[13px] leading-snug ${
            task.status === "done" || task.status === "canceled"
              ? "text-content/55"
              : "text-content"
          }`}
        >
          {task.title}
        </p>
      </div>
      {task.labels.length || task.sourceSessionId ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {task.sourceSessionId ? <AgentChip /> : null}
          {task.labels.map((label) => (
            <LabelPill key={label} label={label} />
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-content/35">
        <span className="truncate">Updated {shortDate(task.updatedAt)}</span>
        {comments ? <CommentCount count={comments} /> : null}
      </div>
    </button>
  );
}

function InlineComposer({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="rounded-lg border border-content/20 bg-content/[0.04] p-2">
      <input
        autoFocus
        value={value}
        placeholder="Task title"
        aria-label="New task title"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && value.trim()) {
            onSubmit(value.trim());
            setValue("");
          } else if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
        }}
        onBlur={() => {
          if (!value.trim()) onCancel();
        }}
        className="h-7 w-full bg-transparent px-1 text-[13px] text-content outline-none placeholder:text-content/35"
      />
      <p className="px-1 text-[10.5px] text-content/35">
        Enter to add · Esc to cancel
      </p>
    </div>
  );
}

/* ---------- List ---------- */

function ListLayout({
  tasks,
  selectedId,
  composing,
  onCompose,
  onCreate,
  onSelect,
  onRequestDelete,
}: {
  tasks: Task[];
  selectedId: string | null;
  composing: TaskStatus | null;
  onCompose: (status: TaskStatus | null) => void;
  onCreate: (status: TaskStatus, title: string) => void;
  onSelect: (id: string) => void;
  onRequestDelete: (id: string) => void;
}) {
  const lock = useLockOverscroll<HTMLDivElement>();
  return (
    <div ref={lock} className="min-h-0 flex-1 overflow-y-auto overscroll-none">
      {TASK_STATUSES.map((status) => {
        const group = tasks.filter((task) => task.status === status);
        if (!group.length && composing !== status) return null;
        return (
          <section key={status}>
            <div className="sticky top-0 z-[1] flex h-8 items-center gap-2 border-b border-stroke bg-background-base px-4 text-[12.5px] font-medium">
              <StatusIcon status={status} />
              {TASK_STATUS_LABEL[status]}
              <span className="font-normal tabular-nums text-content/40">
                {group.length}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                aria-label={`Add to ${TASK_STATUS_LABEL[status]}`}
                onClick={() => onCompose(status)}
                className="grid size-6 place-items-center rounded-md text-content/40 hover:bg-content/10 hover:text-content"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            {composing === status ? (
              <div className="px-3 py-2">
                <InlineComposer
                  onCancel={() => onCompose(null)}
                  onSubmit={(title) => onCreate(status, title)}
                />
              </div>
            ) : null}
            {group.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onSelect(task.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onRequestDelete(task.id);
                }}
                className={`flex h-9 w-full items-center gap-3 border-b border-stroke px-4 text-left text-[13px] ${
                  task.id === selectedId
                    ? "bg-content/[0.06]"
                    : "hover:bg-content/[0.03]"
                }`}
              >
                <span className="text-content/50">
                  <PriorityIcon priority={task.priority} />
                </span>
                <span className="w-16 shrink-0 font-mono text-[11px] text-content/45">
                  {task.key}
                </span>
                <StatusIcon status={task.status} className="size-[15px]" />
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                {taskComments(task).length ? (
                  <CommentCount count={taskComments(task).length} />
                ) : null}
                {task.sourceSessionId ? <AgentChip /> : null}
                {task.labels.map((label) => (
                  <LabelPill key={label} label={label} />
                ))}
                <span className="w-14 shrink-0 text-right text-[11px] text-content/35">
                  {shortDate(task.updatedAt)}
                </span>
              </button>
            ))}
          </section>
        );
      })}
      {tasks.length === 0 && !composing ? (
        <p className="px-4 py-6 text-[12.5px] text-content/45">
          No tasks here yet. Add one, or ask an agent with /operator to plan the
          work here.
        </p>
      ) : null}
    </div>
  );
}

/* ---------- Detail ---------- */

/**
 * Shows the stored value until the field is focused, then the user's draft.
 * `end` returns the draft only when the user changed it, so blurring a field
 * never writes back text that an agent has since replaced.
 */
function useFieldDraft(stored: string) {
  const [draft, setDraft] = useState<string | null>(null);
  const base = useRef(stored);
  return {
    value: draft ?? stored,
    begin: () => {
      if (draft !== null) return;
      base.current = stored;
      setDraft(stored);
    },
    change: setDraft,
    end: () => {
      setDraft(null);
      return draft !== null && draft !== base.current ? draft : null;
    },
  };
}

function TaskDetail({
  task,
  marks,
  confirmDelete,
  onConfirmDelete,
  onClose,
  onDelete,
}: {
  task: Task;
  marks: ProjectMarks;
  confirmDelete: boolean;
  onConfirmDelete: (ask: boolean) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const comments = taskComments(task);
  useEffect(() => {
    if (!confirmDelete) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onConfirmDelete(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [confirmDelete, onConfirmDelete]);
  const title = useFieldDraft(task.title);
  const description = useFieldDraft(task.description);
  const [editing, setEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const lock = useLockOverscroll<HTMLDivElement>();

  const save = (patch: Parameters<typeof updateTask>[1]) =>
    updateTask(task.id, patch);

  return (
    <aside
      aria-label={`Task ${task.key}`}
      className="flex w-[360px] shrink-0 flex-col border-l border-stroke"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-stroke px-3">
        <span className="font-mono text-[11.5px] text-content/50">
          {task.key}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          title="Delete task"
          aria-label="Delete task"
          aria-pressed={confirmDelete}
          onClick={() => onConfirmDelete(!confirmDelete)}
          className={`grid size-6 place-items-center rounded-md hover:bg-content/10 ${
            confirmDelete
              ? "bg-content/10 text-red-400"
              : "text-content/40 hover:text-content"
          }`}
        >
          <Trash2 className="size-3.5" />
        </button>
        <button
          type="button"
          title="Close"
          aria-label="Close task"
          onClick={onClose}
          className="grid size-6 place-items-center rounded-md text-content/40 hover:bg-content/10 hover:text-content"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {confirmDelete ? (
        <div
          role="alertdialog"
          aria-label={`Delete ${task.key}`}
          className="flex shrink-0 flex-col gap-2 border-b border-stroke bg-red-500/[0.07] px-4 py-3"
        >
          <p className="text-[12.5px] text-content">
            Delete <span className="font-mono text-[11.5px]">{task.key}</span>
            {comments.length
              ? ` and its ${comments.length} ${comments.length === 1 ? "comment" : "comments"}?`
              : "?"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              autoFocus
              onClick={onDelete}
              className="h-7 rounded-md bg-red-500 px-2.5 text-[12px] font-medium text-white hover:bg-red-500/90"
            >
              Delete task
            </button>
            <button
              type="button"
              onClick={() => onConfirmDelete(false)}
              className="h-7 rounded-md px-2.5 text-[12px] text-content/70 hover:bg-content/10 hover:text-content"
            >
              Cancel
            </button>
            <span className="ml-auto text-[11px] text-content/40">
              You can undo right after
            </span>
          </div>
        </div>
      ) : null}
      <div
        ref={lock}
        className="min-h-0 flex-1 overflow-y-auto overscroll-none p-4"
      >
        <textarea
          value={title.value}
          rows={1}
          aria-label="Task title"
          onFocus={title.begin}
          onChange={(event) =>
            title.change(event.target.value.replace(/\n/g, " "))
          }
          onBlur={() => {
            const next = title.end();
            if (next?.trim()) save({ title: next });
          }}
          className="field-sizing-content w-full resize-none bg-transparent text-[16px] font-semibold leading-snug text-content outline-none"
        />
        <dl className="mt-3 grid grid-cols-[84px_1fr] items-center gap-y-1.5 text-[12px]">
          <dt className="text-content/45">Status</dt>
          <dd>
            <PropertySelect
              value={task.status}
              options={TASK_STATUSES.map((status) => ({
                value: status,
                label: TASK_STATUS_LABEL[status],
              }))}
              icon={<StatusIcon status={task.status} className="size-3.5" />}
              onChange={(status) => save({ status: status as TaskStatus })}
            />
          </dd>
          <dt className="text-content/45">Priority</dt>
          <dd>
            <PropertySelect
              value={task.priority}
              options={TASK_PRIORITIES.map((priority) => ({
                value: priority,
                label: TASK_PRIORITY_LABEL[priority],
              }))}
              icon={
                <span className="text-content/60">
                  <PriorityIcon priority={task.priority} />
                </span>
              }
              onChange={(priority) =>
                save({ priority: priority as TaskPriority })
              }
            />
          </dd>
          <dt className="text-content/45">Scope</dt>
          <dd className="flex items-center gap-1.5 px-1.5 text-content/80">
            {task.projectCwd ? (
              <>
                <ProjectMark cwd={task.projectCwd} marks={marks} />
                {projectName(task.projectCwd)}
              </>
            ) : (
              <>
                <Globe className="size-3.5 text-content/50" />
                Global
              </>
            )}
          </dd>
          <dt className="self-start pt-1 text-content/45">Labels</dt>
          <dd className="flex flex-wrap items-center gap-1 px-1.5 py-0.5">
            {task.labels.map((label) => (
              <button
                key={label}
                type="button"
                title="Remove label"
                onClick={() =>
                  save({ labels: task.labels.filter((item) => item !== label) })
                }
              >
                <LabelPill label={label} />
              </button>
            ))}
            <input
              value={labelDraft}
              placeholder="Add label"
              aria-label="Add label"
              onChange={(event) => setLabelDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && labelDraft.trim()) {
                  save({ labels: [...task.labels, labelDraft] });
                  setLabelDraft("");
                }
              }}
              className="h-5 w-20 bg-transparent text-[11.5px] text-content outline-none placeholder:text-content/35"
            />
          </dd>
        </dl>
        <div className="mt-4 border-t border-stroke pt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-content/50">
              Description
            </span>
            {!editing && task.description ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-[11.5px] text-content/45 hover:text-content"
              >
                Edit
              </button>
            ) : null}
          </div>
          {editing || !task.description ? (
            <textarea
              autoFocus={editing}
              value={description.value}
              placeholder="Add details in Markdown"
              aria-label="Task description"
              onFocus={description.begin}
              onChange={(event) => description.change(event.target.value)}
              onBlur={() => {
                const next = description.end();
                if (next !== null) save({ description: next });
                setEditing(false);
              }}
              className="min-h-[140px] w-full resize-y rounded-md border border-stroke bg-transparent p-2 text-[12.5px] leading-relaxed text-content outline-none placeholder:text-content/35"
            />
          ) : (
            <div className="text-[12.5px] leading-relaxed text-content/85">
              <AgentMarkdown text={task.description} />
            </div>
          )}
        </div>
        <div className="mt-4 space-y-1 border-t border-stroke pt-3 text-[11.5px] text-content/40">
          {task.sourceSessionId ? (
            <p className="flex items-center gap-1.5">
              <Bot className="size-3" /> Created by an agent through /operator
            </p>
          ) : null}
          <p>
            Created {shortDate(task.createdAt)} · Updated{" "}
            {formatRelativeTime(new Date(task.updatedAt).toISOString())}
          </p>
        </div>
        <TaskComments task={task} comments={comments} />
      </div>
    </aside>
  );
}

function PropertySelect({
  value,
  options,
  icon,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  icon: React.ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative flex h-7 w-fit items-center gap-1.5 rounded-md px-1.5 text-content/85 hover:bg-content/[0.06]">
      {icon}
      <span>{options.find((option) => option.value === value)?.label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CommentCount({ count }: { count: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-[11px] text-content/45"
      aria-label={`${count} ${count === 1 ? "comment" : "comments"}`}
    >
      <MessageSquare className="size-3" />
      {count}
    </span>
  );
}

function TaskComments({
  task,
  comments,
}: {
  task: Task;
  comments: TaskComment[];
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const send = () => {
    if (!draft.trim()) return;
    try {
      addTaskComment(task.id, draft);
      setDraft("");
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <section aria-label="Comments" className="mt-4 border-t border-stroke pt-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium text-content/50">
        Comments
        {comments.length ? (
          <span className="font-normal tabular-nums text-content/35">
            {comments.length}
          </span>
        ) : null}
      </div>
      {comments.length ? (
        <ol className="mb-3 flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="group flex gap-2">
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
                  comment.sessionId
                    ? "bg-content/10 text-content/70"
                    : "bg-accent/20 text-accent"
                }`}
                aria-hidden
              >
                {comment.sessionId ? <Bot className="size-3" /> : "Y"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11.5px]">
                  <span className="font-medium text-content/85">
                    {comment.sessionId ? "Agent" : "You"}
                  </span>
                  <span className="text-content/35">
                    {formatRelativeTime(
                      new Date(comment.createdAt).toISOString(),
                    )}
                  </span>
                  <button
                    type="button"
                    title="Delete comment"
                    aria-label="Delete comment"
                    onClick={() => deleteTaskComment(task.id, comment.id)}
                    className="ml-auto grid size-5 place-items-center rounded text-content/35 opacity-0 hover:bg-content/10 hover:text-content group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </div>
                <div className="text-[12.5px] leading-relaxed text-content/85">
                  <AgentMarkdown text={comment.body} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="rounded-md border border-stroke focus-within:border-content/25">
        <textarea
          value={draft}
          rows={2}
          placeholder="Leave a comment"
          aria-label="New comment"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              send();
            }
          }}
          className="field-sizing-content block max-h-60 min-h-[52px] w-full resize-none bg-transparent px-2 pt-2 text-[12.5px] leading-relaxed text-content outline-none placeholder:text-content/35"
        />
        <div className="flex items-center justify-between px-2 pb-1.5">
          <span className="text-[10.5px] text-content/35">
            {error ?? `${MOD}Enter to send`}
          </span>
          <button
            type="button"
            disabled={!draft.trim()}
            onClick={send}
            className="h-6 rounded-md bg-content/10 px-2 text-[11.5px] font-medium text-content hover:bg-content/15 disabled:opacity-40"
          >
            Comment
          </button>
        </div>
      </div>
    </section>
  );
}
