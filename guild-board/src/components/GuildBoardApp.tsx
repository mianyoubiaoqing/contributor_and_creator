"use client";

import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  Copy,
  FileText,
  GanttChartSquare,
  GitBranch,
  GitPullRequest,
  GripVertical,
  KeyRound,
  ListChecks,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Scale,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  getDifficultyDelta,
  getMemberName,
  getTaskDifficulty,
} from "@/lib/calculations";
import { createLiveProjectState, initialState } from "@/lib/sample-data";
import { getCloudConfig } from "@/lib/cloud-config";
import {
  clearLocalState,
  loadProjectState,
  saveProjectState,
  type PersistenceStatus,
} from "@/lib/persistence";
import {
  claimProjectInvite,
  createProjectInvite,
  listCloudMembers,
  listProjectInvites,
  updateCloudMember,
} from "@/lib/project-admin";
import { useSupabaseAuth } from "@/lib/useSupabaseAuth";
import {
  disciplines,
  taskStatuses,
  type Appeal,
  type CloudProjectMember,
  type Discipline,
  type Member,
  type ProjectAccessLevel,
  type ProjectInvite,
  type ProjectState,
  type Task,
  type TaskStatus,
} from "@/lib/types";

type Tab =
  | "overview"
  | "tasks"
  | "members"
  | "github"
  | "settlement"
  | "appeals";

type NewTaskForm = {
  title: string;
  discipline: Discipline;
  module: string;
  ownerId: string;
  reviewerId: string;
  difficultyPlanner: number;
  difficultyAi: number;
  difficultyMember: number;
  dueAt: string;
  description: string;
};

const statusTone: Record<TaskStatus, string> = {
  开放领取: "border-stone-300 bg-stone-50 text-stone-700",
  已领取: "border-sky-300 bg-sky-50 text-sky-800",
  进行中: "border-indigo-300 bg-indigo-50 text-indigo-800",
  提交验收: "border-amber-300 bg-amber-50 text-amber-800",
  返工: "border-rose-300 bg-rose-50 text-rose-800",
  已通过: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

const tabItems: Array<{ id: Tab; label: string; icon: typeof GanttChartSquare }> = [
  { id: "overview", label: "项目大厅", icon: GanttChartSquare },
  { id: "tasks", label: "任务告示板", icon: ListChecks },
  { id: "members", label: "成员与邀请", icon: UserPlus },
  { id: "github", label: "仓库证据", icon: GitBranch },
  { id: "settlement", label: "结算暂存", icon: Scale },
  { id: "appeals", label: "申诉", icon: ShieldCheck },
];

const accessLevels: ProjectAccessLevel[] = [
  "owner",
  "planner",
  "reviewer",
  "member",
  "viewer",
];

export default function GuildBoardApp() {
  const [state, setState] = useState<ProjectState>(initialState);
  const [tab, setTab] = useState<Tab>("overview");
  const auth = useSupabaseAuth();
  const accessToken = auth.session?.access_token;
  const [isLoaded, setIsLoaded] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>({
    mode: "local",
    state: "loading",
    message: "正在加载项目状态",
  });
  const [appealForm, setAppealForm] = useState({
    memberId: initialState.members[0]?.id ?? "",
    taskId: initialState.tasks[0]?.id ?? "",
    reason: "",
  });
  const [newTask, setNewTask] = useState<NewTaskForm>(() => ({
    title: "",
    discipline: "设计",
    module: "",
    ownerId: initialState.members[0]?.id ?? "",
    reviewerId: initialState.members[0]?.id ?? "",
    difficultyPlanner: 3,
    difficultyAi: 3,
    difficultyMember: 3,
    dueAt: "2026-07-04 18:00",
    description: "",
  }));

  useEffect(() => {
    let alive = true;

    loadProjectState(initialState, accessToken).then((result) => {
      if (!alive) {
        return;
      }
      setState(result.state);
      setPersistenceStatus(result.status);
      setIsLoaded(true);
    });

    return () => {
      alive = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (isLoaded) {
      const timeoutId = window.setTimeout(() => {
        saveProjectState(state, accessToken).then(setPersistenceStatus);
      }, 400);

      return () => window.clearTimeout(timeoutId);
    }
  }, [accessToken, isLoaded, state]);

  const totalTasks = state.tasks.length;
  const doneTasks = state.tasks.filter((task) => task.status === "已通过").length;
  const totalEvidence = state.tasks.reduce((sum, task) => sum + task.evidence.length, 0);
  const pendingAppeals = state.appeals.filter((appeal) => appeal.status === "待复核").length;

  const addAudit = (actor: string, action: string, target: string) => {
    setState((current) => ({
      ...current,
      auditLog: [
        {
          id: createId("log"),
          actor,
          action,
          target,
          createdAt: nowLabel(),
        },
        ...current.auditLog,
      ],
    }));
  };

  const updateProject = (
    field: keyof ProjectState["project"],
    value: ProjectState["project"][keyof ProjectState["project"]],
  ) => {
    setState((current) => ({
      ...current,
      project: {
        ...current.project,
        [field]: value,
      },
    }));
  };

  const addTask = () => {
    if (!newTask.title.trim()) {
      return;
    }

    const task: Task = {
      id: createId("task"),
      title: newTask.title.trim(),
      discipline: newTask.discipline,
      module: newTask.module.trim() || "未归类模块",
      status: "开放领取",
      ownerId: newTask.ownerId,
      collaboratorIds: [],
      reviewerId: newTask.reviewerId,
      difficultyPlanner: newTask.difficultyPlanner,
      difficultyAi: newTask.difficultyAi,
      difficultyMember: newTask.difficultyMember,
      completion: 0,
      quality: 1,
      timeliness: 1,
      evidenceStrength: 0.3,
      dueAt: newTask.dueAt,
      description: newTask.description.trim(),
      evidence: [],
    };

    setState((current) => ({
      ...current,
      tasks: [task, ...current.tasks],
      auditLog: [
        {
          id: createId("log"),
          actor: getMemberName(current.members, newTask.ownerId),
          action: "创建任务",
          target: task.title,
          createdAt: nowLabel(),
        },
        ...current.auditLog,
      ],
    }));
    setNewTask((current) => ({
      ...current,
      title: "",
      module: "",
      description: "",
    }));
  };

  const updateTask = <K extends keyof Task>(taskId: string, field: K, value: Task[K]) => {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              [field]: value,
            }
          : task,
      ),
    }));
  };

  const updateTaskStatus = (taskId: string, status: TaskStatus) => {
    const task = state.tasks.find((item) => item.id === taskId);
    updateTask(taskId, "status", status);
    if (task) {
      addAudit("系统", "移动任务状态", `${task.title} → ${status}`);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const taskId = String(event.active.id);
    const status = event.over?.id as TaskStatus | undefined;
    if (status && taskStatuses.includes(status)) {
      updateTaskStatus(taskId, status);
    }
  };

  const submitAppeal = () => {
    if (!appealForm.reason.trim()) {
      return;
    }

    const appeal: Appeal = {
      id: createId("appeal"),
      memberId: appealForm.memberId,
      taskId: appealForm.taskId,
      reason: appealForm.reason.trim(),
      status: "待复核",
      createdAt: nowLabel(),
    };

    setState((current) => ({
      ...current,
      appeals: [appeal, ...current.appeals],
      auditLog: [
        {
          id: createId("log"),
          actor: getMemberName(current.members, appeal.memberId),
          action: "提交申诉",
          target: current.tasks.find((task) => task.id === appeal.taskId)?.title ?? "任务",
          createdAt: nowLabel(),
        },
        ...current.auditLog,
      ],
    }));
    setAppealForm((current) => ({ ...current, reason: "" }));
  };

  const resolveAppeal = (appealId: string, status: Appeal["status"]) => {
    setState((current) => ({
      ...current,
      appeals: current.appeals.map((appeal) =>
        appeal.id === appealId
          ? {
              ...appeal,
              status,
              reviewerId: current.members.find((member) => member.conflictReviewer)?.id,
              resolution:
                status === "已接受"
                  ? "复核通过，后续应创建任务变更记录。"
                  : "证据不足，本轮不调整任务记录。",
            }
          : appeal,
      ),
      auditLog: [
        {
          id: createId("log"),
          actor: "复核组",
          action: "处理申诉",
          target: status,
          createdAt: nowLabel(),
        },
        ...current.auditLog,
      ],
    }));
  };

  const enterLiveMode = () => {
    setState((current) => createLiveProjectState(current));
    clearLocalState();
  };
  const activeTab = tabItems.find((item) => item.id === tab) ?? tabItems[0];

  return (
    <main className="min-h-screen bg-[#f6f3ee] text-stone-950">
      <div className="mx-auto grid w-full max-w-[1480px] gap-4 px-3 py-3 md:px-5 md:py-5 lg:grid-cols-[244px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-40px)] rounded-lg border border-stone-300 bg-white p-4 lg:flex lg:flex-col">
          <div>
            <p className="text-xs font-medium text-teal-700">{state.project.eventName}</p>
            <h1 className="mt-2 text-xl font-semibold leading-7">{state.project.name}</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Game Jam 协作服务台
            </p>
          </div>

          <nav className="mt-6 grid gap-1">
            {tabItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={clsx(
                    "flex min-h-11 items-center gap-3 rounded-md border px-3 text-left text-sm font-medium transition",
                    active
                      ? "border-teal-200 bg-teal-50 text-teal-900"
                      : "border-transparent text-stone-600 hover:bg-stone-50 hover:text-stone-950",
                  )}
                  onClick={() => setTab(item.id)}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto rounded-md border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            <p className="font-semibold">贡献度系统暂时隐藏</p>
            <p className="mt-1 text-xs text-amber-900">
              保留任务难度与仓库证据，评分与分成模型等待重新设计。
            </p>
          </div>
        </aside>

        <div className="grid min-w-0 gap-4">
          <header className="rounded-lg border border-stone-300 bg-white p-4 md:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
                  <span className="rounded-sm border border-stone-300 bg-stone-50 px-2 py-1">
                    {activeTab.label}
                  </span>
                  <span className="rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">
                    {state.project.phase}
                  </span>
                  <span className="rounded-sm border border-stone-300 bg-stone-50 px-2 py-1">
                    规则 {state.project.rulesVersion}
                  </span>
                  <span
                    className={clsx(
                      "inline-flex items-center gap-1 rounded-sm border px-2 py-1",
                      persistenceStatus.mode === "cloud"
                        ? "border-sky-200 bg-sky-50 text-sky-800"
                        : "border-stone-300 bg-stone-50 text-stone-600",
                    )}
                    title={persistenceStatus.message}
                  >
                    <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
                    {persistenceStatus.mode === "cloud" ? "云端" : "本地"}
                  </span>
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-normal md:text-3xl">
                  {state.project.name}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                  以任务领取、证据沉淀、验收流转为核心；贡献度、互评与奖金比例已暂时隐藏。
                </p>
              </div>

              <div className="flex flex-col gap-3 xl:items-end">
                <AuthWidget auth={auth} />
                <div className="flex flex-wrap gap-2">
                  <IconButton icon={RotateCcw} label="进入实战模式" onClick={enterLiveMode} />
                  <IconButton
                    icon={Save}
                    label={persistenceStatus.state === "error" ? "保存异常" : "已自动保存"}
                    onClick={() => addAudit("系统", "手动确认保存", "项目状态")}
                  />
                </div>
              </div>
            </div>
          </header>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="成员" value={`${state.members.length} 人`} icon={Users} />
            <Metric label="任务通过" value={`${doneTasks}/${totalTasks}`} icon={CheckCircle2} />
            <Metric label="证据记录" value={`${totalEvidence} 条`} icon={GitPullRequest} />
            <Metric label="待复核申诉" value={`${pendingAppeals} 条`} icon={AlertTriangle} />
          </section>

          <nav className="flex gap-1 overflow-x-auto rounded-lg border border-stone-300 bg-white px-2 lg:hidden">
            {tabItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={clsx(
                    "flex min-h-12 min-w-fit items-center justify-center gap-2 border-b-2 px-3 text-sm font-medium transition",
                    tab === item.id
                      ? "border-teal-700 text-teal-900"
                      : "border-transparent text-stone-500 hover:text-stone-900",
                  )}
                  onClick={() => setTab(item.id)}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {tab === "overview" && (
            <OverviewPanel state={state} updateProject={updateProject} />
          )}

          {tab === "tasks" && (
            <TaskPanel
              state={state}
              newTask={newTask}
              setNewTask={setNewTask}
              addTask={addTask}
              updateTask={updateTask}
              updateTaskStatus={updateTaskStatus}
              handleDragEnd={handleDragEnd}
            />
          )}

          {tab === "members" && (
            <MemberPanel
              auth={auth}
              onSyncMembers={(cloudMembers) =>
                setState((current) => ({
                  ...current,
                  members: cloudMembers
                    .filter((member) => member.approvalStatus === "approved")
                    .map(mapCloudMemberToProjectMember),
                }))
              }
            />
          )}

          {tab === "github" && <GitHubPanel state={state} />}

          {tab === "settlement" && <SettlementPanel state={state} />}

          {tab === "appeals" && (
            <AppealPanel
              state={state}
              appealForm={appealForm}
              setAppealForm={setAppealForm}
              submitAppeal={submitAppeal}
              resolveAppeal={resolveAppeal}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function OverviewPanel({
  state,
  updateProject,
}: {
  state: ProjectState;
  updateProject: (
    field: keyof ProjectState["project"],
    value: ProjectState["project"][keyof ProjectState["project"]],
  ) => void;
}) {
  const handleFile = (file?: File) => {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateProject("collaborationMarkdown", String(reader.result));
    };
    reader.readAsText(file);
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
      <div className="rounded-md border border-stone-300 bg-white p-4">
        <SectionTitle icon={FileText} title="项目创建与协作契约" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextField
            label="项目名"
            value={state.project.name}
            onChange={(value) => updateProject("name", value)}
          />
          <TextField
            label="活动"
            value={state.project.eventName}
            onChange={(value) => updateProject("eventName", value)}
          />
          <TextField
            label="引擎"
            value={state.project.engine}
            onChange={(value) => updateProject("engine", value)}
          />
          <TextField
            label="引擎版本"
            value={state.project.engineVersion}
            onChange={(value) => updateProject("engineVersion", value)}
          />
          <TextField
            label="目标平台"
            value={state.project.targetPlatform}
            onChange={(value) => updateProject("targetPlatform", value)}
          />
          <TextField
            label="仓库"
            value={state.project.repository}
            onChange={(value) => updateProject("repository", value)}
          />
        </div>
        <label className="mt-4 block text-sm font-medium text-stone-700">
          环境与依赖
          <textarea
            className="mt-2 min-h-24 w-full resize-y rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-stone-900"
            value={state.project.dependencies.join("\n")}
            onChange={(event) =>
              updateProject(
                "dependencies",
                event.target.value
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
      </div>

      <div className="rounded-md border border-stone-300 bg-white p-4">
        <SectionTitle icon={Archive} title="Markdown 协作文档" />
        <input
          className="mt-4 w-full rounded-md border border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-sm"
          type="file"
          accept=".md,text/markdown,text/plain"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        <textarea
          className="mt-3 min-h-64 w-full resize-y rounded-md border border-stone-300 bg-stone-50 px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-stone-900"
          value={state.project.collaborationMarkdown}
          onChange={(event) => updateProject("collaborationMarkdown", event.target.value)}
        />
      </div>

      <div className="rounded-md border border-stone-300 bg-white p-4 xl:col-span-2">
        <SectionTitle icon={Users} title="成员与治理角色" />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {state.members.map((member) => (
            <div
              key={member.id}
              className="min-h-28 rounded-md border border-stone-200 bg-stone-50 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="mt-1 text-sm text-stone-600">{member.primaryDiscipline}</p>
                </div>
                {member.conflictReviewer && (
                  <span className="rounded-sm bg-emerald-100 px-2 py-1 text-xs text-emerald-800">
                    可复核
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-stone-700">{member.role}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TaskPanel({
  state,
  newTask,
  setNewTask,
  addTask,
  updateTask,
  updateTaskStatus,
  handleDragEnd,
}: {
  state: ProjectState;
  newTask: NewTaskForm;
  setNewTask: React.Dispatch<React.SetStateAction<NewTaskForm>>;
  addTask: () => void;
  updateTask: <K extends keyof Task>(taskId: string, field: K, value: Task[K]) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  handleDragEnd: (event: DragEndEvent) => void;
}) {
  return (
    <section className="grid gap-5">
      <div className="rounded-md border border-stone-300 bg-white p-4">
        <SectionTitle icon={Plus} title="发布委托" />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <TextField
            label="任务标题"
            value={newTask.title}
            onChange={(value) => setNewTask((current) => ({ ...current, title: value }))}
          />
          <SelectField
            label="分类"
            value={newTask.discipline}
            options={disciplines}
            onChange={(value) =>
              setNewTask((current) => ({ ...current, discipline: value as Discipline }))
            }
          />
          <TextField
            label="模块"
            value={newTask.module}
            onChange={(value) => setNewTask((current) => ({ ...current, module: value }))}
          />
          <MemberSelect
            label="负责人"
            members={state.members}
            value={newTask.ownerId}
            onChange={(value) => setNewTask((current) => ({ ...current, ownerId: value }))}
          />
          <MemberSelect
            label="验收人"
            members={state.members}
            value={newTask.reviewerId}
            onChange={(value) =>
              setNewTask((current) => ({ ...current, reviewerId: value }))
            }
          />
          <TextField
            label="截止时间"
            value={newTask.dueAt}
            onChange={(value) => setNewTask((current) => ({ ...current, dueAt: value }))}
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <NumberField
            label="主策难度"
            value={newTask.difficultyPlanner}
            min={1}
            max={5}
            onChange={(value) =>
              setNewTask((current) => ({ ...current, difficultyPlanner: value }))
            }
          />
          <NumberField
            label="AI 难度"
            value={newTask.difficultyAi}
            min={1}
            max={5}
            onChange={(value) =>
              setNewTask((current) => ({ ...current, difficultyAi: value }))
            }
          />
          <NumberField
            label="成员难度"
            value={newTask.difficultyMember}
            min={1}
            max={5}
            onChange={(value) =>
              setNewTask((current) => ({ ...current, difficultyMember: value }))
            }
          />
        </div>
        <label className="mt-3 block text-sm font-medium text-stone-700">
          验收说明
          <textarea
            className="mt-2 min-h-20 w-full resize-y rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-stone-900"
            value={newTask.description}
            onChange={(event) =>
              setNewTask((current) => ({ ...current, description: event.target.value }))
            }
          />
        </label>
        <div className="mt-4">
          <IconButton icon={Plus} label="发布任务" onClick={addTask} />
        </div>
      </div>

      <DndContext onDragEnd={handleDragEnd}>
        <div className="grid gap-3 xl:grid-cols-6">
          {taskStatuses.map((status) => (
            <TaskColumn
              key={status}
              status={status}
              tasks={state.tasks.filter((task) => task.status === status)}
              members={state.members}
            />
          ))}
        </div>
      </DndContext>

      <div className="rounded-md border border-stone-300 bg-white p-4">
        <SectionTitle icon={ClipboardCheck} title="任务表与验收状态" />
        <TaskTable
          tasks={state.tasks}
          members={state.members}
          updateTask={updateTask}
          updateTaskStatus={updateTaskStatus}
        />
      </div>
    </section>
  );
}

function TaskColumn({
  status,
  tasks,
  members,
}: {
  status: TaskStatus;
  tasks: Task[];
  members: Member[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "min-h-72 rounded-md border bg-white p-3 transition",
        isOver ? "border-stone-950" : "border-stone-300",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={clsx("rounded-sm border px-2 py-1 text-xs", statusTone[status])}>
          {status}
        </span>
        <span className="text-sm text-stone-500">{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <DraggableTask key={task.id} task={task} members={members} />
        ))}
      </div>
    </div>
  );
}

function DraggableTask({ task, members }: { task: Task; members: Member[] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-md border border-stone-200 bg-stone-50 p-3 shadow-sm",
        isDragging && "opacity-80",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 rounded-sm p-1 text-stone-400 hover:bg-white hover:text-stone-900"
          aria-label="拖动任务"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-5">{task.title}</h3>
          <p className="mt-1 text-xs text-stone-600">
            {task.discipline} / {task.module}
          </p>
          <p className="mt-2 text-xs text-stone-700">
            {getMemberName(members, task.ownerId)} · 截止 {task.dueAt}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            难度 {getTaskDifficulty(task)} · 证据 {task.evidence.length} 条
          </p>
          {getDifficultyDelta(task) >= 2 && (
            <p className="mt-2 rounded-sm bg-amber-100 px-2 py-1 text-xs text-amber-900">
              难度评估差异需复核
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function TaskTable({
  tasks,
  members,
  updateTask,
  updateTaskStatus,
}: {
  tasks: Task[];
  members: Member[];
  updateTask: <K extends keyof Task>(taskId: string, field: K, value: Task[K]) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
}) {
  const columns = useMemo<ColumnDef<Task>[]>(
    () => [
      {
        header: "任务",
        accessorKey: "title",
        cell: ({ row }) => (
          <div className="min-w-56">
            <p className="font-medium">{row.original.title}</p>
            <p className="mt-1 text-xs text-stone-500">{row.original.description}</p>
          </div>
        ),
      },
      {
        header: "分类",
        accessorKey: "discipline",
      },
      {
        header: "负责人",
        cell: ({ row }) => getMemberName(members, row.original.ownerId),
      },
      {
        header: "状态",
        cell: ({ row }) => (
          <select
            className="min-h-9 rounded-md border border-stone-300 bg-white px-2 text-sm"
            value={row.original.status}
            onChange={(event) =>
              updateTaskStatus(row.original.id, event.target.value as TaskStatus)
            }
          >
            {taskStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        ),
      },
      {
        header: "难度",
        cell: ({ row }) => (
          <div className="min-w-24 text-sm">
            <p>{getTaskDifficulty(row.original)}</p>
            <p className="text-xs text-stone-500">
              {row.original.difficultyPlanner}/{row.original.difficultyAi}/
              {row.original.difficultyMember}
            </p>
          </div>
        ),
      },
      {
        header: "完成度",
        cell: ({ row }) => (
          <input
            className="h-9 w-20 rounded-md border border-stone-300 px-2 text-sm"
            type="number"
            min={0}
            max={100}
            value={row.original.completion}
            onChange={(event) =>
              updateTask(row.original.id, "completion", Number(event.target.value))
            }
          />
        ),
      },
      {
        header: "截止",
        accessorKey: "dueAt",
      },
      {
        header: "证据",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.evidence.length} 条</span>
        ),
      },
    ],
    [members, updateTask, updateTaskStatus],
  );

  const table = useReactTable({
    data: tasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mt-4">
      <div className="grid gap-3 md:hidden">
        {tasks.map((task) => (
          <article key={task.id} className="rounded-md border border-stone-200 bg-stone-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{task.title}</p>
                <p className="mt-1 text-xs text-stone-600">
                  {task.discipline} / {task.module}
                </p>
              </div>
              <span
                className={clsx(
                  "shrink-0 rounded-sm border px-2 py-1 text-xs",
                  statusTone[task.status],
                )}
              >
                {task.status}
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-stone-700">
              <p>负责人：{getMemberName(members, task.ownerId)}</p>
              <p>
                难度：{getTaskDifficulty(task)}（{task.difficultyPlanner}/
                {task.difficultyAi}/{task.difficultyMember}）
              </p>
              <p>进度：{task.completion}% · 截止：{task.dueAt}</p>
              <p>证据：{task.evidence.length} 条</p>
            </div>
            <select
              className="mt-3 min-h-10 w-full rounded-md border border-stone-300 bg-white px-2 text-sm"
              value={task.status}
              onChange={(event) => updateTaskStatus(task.id, event.target.value as TaskStatus)}
            >
              {taskStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-stone-300">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-3 py-3 font-semibold text-stone-700">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-stone-200 align-top">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemberPanel({
  auth,
  onSyncMembers,
}: {
  auth: ReturnType<typeof useSupabaseAuth>;
  onSyncMembers: (members: CloudProjectMember[]) => void;
}) {
  const config = getCloudConfig();
  const accessToken = auth.session?.access_token;
  const [members, setMembers] = useState<CloudProjectMember[]>([]);
  const [invites, setInvites] = useState<ProjectInvite[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("成员系统已就绪");
  const [loading, setLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    label: "Game Jam 成员邀请",
    defaultAccessLevel: "member" as ProjectAccessLevel,
    requireApproval: false,
    maxUses: 12,
    expiresAt: "",
  });

  const refresh = async () => {
    setLoading(true);
    try {
      const [nextMembers, nextInvites] = await Promise.all([
        listCloudMembers(accessToken),
        listProjectInvites(accessToken),
      ]);
      setMembers(nextMembers);
      setInvites(nextInvites);
      setMessage("成员与邀请码已刷新");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const urlInviteCode = new URLSearchParams(window.location.search).get("invite");
    if (urlInviteCode) {
      setInviteCode(urlInviteCode);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const claimInvite = async () => {
    if (!auth.user) {
      setMessage("请先注册或登录，再加入项目");
      return;
    }

    setLoading(true);
    try {
      const result = await claimProjectInvite(inviteCode, displayName, accessToken);
      setMessage(
        result.approvalStatus === "approved"
          ? "已加入项目，可以刷新后开始协作"
          : "已提交加入申请，等待主策批准",
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加入失败");
    } finally {
      setLoading(false);
    }
  };

  const createInvite = async () => {
    setLoading(true);
    try {
      const invite = await createProjectInvite(
        {
          label: createForm.label,
          defaultAccessLevel: createForm.defaultAccessLevel,
          requireApproval: createForm.requireApproval,
          maxUses: createForm.maxUses,
          expiresAt: createForm.expiresAt || null,
        },
        accessToken,
      );
      setMessage(`邀请码已生成：${invite.inviteCode}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "邀请码生成失败");
    } finally {
      setLoading(false);
    }
  };

  const updateMember = async (
    userId: string,
    patch: {
      accessLevel?: ProjectAccessLevel;
      approvalStatus?: "approved" | "pending";
    },
  ) => {
    setLoading(true);
    try {
      await updateCloudMember(userId, patch, accessToken);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "成员更新失败");
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = async (invite: ProjectInvite) => {
    const inviteLink = `${window.location.origin}?invite=${encodeURIComponent(
      invite.inviteCode,
    )}`;
    await window.navigator.clipboard.writeText(inviteLink);
    setMessage("邀请链接已复制");
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <div className="grid gap-5">
        <div className="rounded-md border border-stone-300 bg-white p-4">
          <SectionTitle icon={KeyRound} title="加入项目" />
          <p className="mt-3 text-sm leading-6 text-stone-600">
            成员注册或登录后，输入邀请码即可加入当前云端项目。
          </p>
          <div className="mt-4 grid gap-3">
            <InfoStrip label="项目键" value={config.projectKey} />
            <TextField label="显示名" value={displayName} onChange={setDisplayName} />
            <TextField label="邀请码" value={inviteCode} onChange={setInviteCode} />
            <IconButton
              icon={UserPlus}
              label="加入项目"
              onClick={claimInvite}
              disabled={loading || !inviteCode}
            />
          </div>
        </div>

        <div className="rounded-md border border-stone-300 bg-white p-4">
          <SectionTitle icon={Plus} title="生成邀请码" />
          <div className="mt-4 grid gap-3">
            <TextField
              label="邀请标签"
              value={createForm.label}
              onChange={(value) =>
                setCreateForm((current) => ({ ...current, label: value }))
              }
            />
            <SelectField
              label="默认权限"
              value={createForm.defaultAccessLevel}
              options={accessLevels}
              renderOption={formatAccessLevel}
              onChange={(value) =>
                setCreateForm((current) => ({
                  ...current,
                  defaultAccessLevel: value as ProjectAccessLevel,
                }))
              }
            />
            <NumberField
              label="使用上限"
              value={createForm.maxUses}
              min={1}
              max={100}
              onChange={(value) =>
                setCreateForm((current) => ({ ...current, maxUses: value }))
              }
            />
            <TextField
              label="过期时间"
              value={createForm.expiresAt}
              onChange={(value) =>
                setCreateForm((current) => ({ ...current, expiresAt: value }))
              }
            />
            <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-stone-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-stone-900"
                checked={createForm.requireApproval}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    requireApproval: event.target.checked,
                  }))
                }
              />
              加入后需要主策批准
            </label>
            <IconButton
              icon={Plus}
              label="生成邀请码"
              onClick={createInvite}
              disabled={loading}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-5">
        <div className="rounded-md border border-stone-300 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SectionTitle icon={Users} title="云端成员" />
            <div className="flex flex-wrap gap-2">
              <IconButton icon={RefreshCw} label="刷新" onClick={refresh} disabled={loading} />
              <IconButton
                icon={Users}
                label="同步到任务成员池"
                onClick={() => {
                  onSyncMembers(members);
                  setMessage("已把批准成员同步到任务负责人和复核人选项");
                }}
                disabled={loading}
              />
            </div>
          </div>
          <p className="mt-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
            {message}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-300">
                  <th className="px-3 py-3">成员</th>
                  <th className="px-3 py-3">邮箱</th>
                  <th className="px-3 py-3">权限</th>
                  <th className="px-3 py-3">状态</th>
                  <th className="px-3 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId} className="border-b border-stone-200">
                    <td className="px-3 py-3 font-medium">
                      {member.displayName ?? member.userId.slice(0, 8)}
                    </td>
                    <td className="px-3 py-3 text-stone-600">{member.email ?? "-"}</td>
                    <td className="px-3 py-3">
                      <select
                        className="h-9 rounded-md border border-stone-300 bg-white px-2 text-sm"
                        value={member.accessLevel}
                        onChange={(event) =>
                          void updateMember(member.userId, {
                            accessLevel: event.target.value as ProjectAccessLevel,
                          })
                        }
                      >
                        {accessLevels.map((level) => (
                          <option key={level} value={level}>
                            {formatAccessLevel(level)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={clsx(
                          "rounded-sm border px-2 py-1 text-xs",
                          member.approvalStatus === "approved"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-amber-200 bg-amber-50 text-amber-800",
                        )}
                      >
                        {member.approvalStatus === "approved" ? "已批准" : "待批准"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {member.approvalStatus === "pending" ? (
                        <button
                          type="button"
                          className="rounded-md border border-stone-900 bg-stone-950 px-3 py-2 text-xs font-medium text-white"
                          onClick={() =>
                            void updateMember(member.userId, {
                              approvalStatus: "approved",
                            })
                          }
                        >
                          批准
                        </button>
                      ) : (
                        <span className="text-stone-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-md border border-stone-300 bg-white p-4">
          <SectionTitle icon={KeyRound} title="邀请码列表" />
          <div className="mt-4 grid gap-3">
            {invites.map((invite) => (
              <article
                key={invite.id}
                className="rounded-md border border-stone-200 bg-stone-50 p-3"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold">{invite.inviteCode}</p>
                    <p className="mt-1 text-sm text-stone-600">
                      {invite.label} · {formatAccessLevel(invite.defaultAccessLevel)} ·{" "}
                      {invite.usesCount}/{invite.maxUses ?? "不限"}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {invite.requireApproval ? "需要批准" : "自动批准"}
                    </p>
                  </div>
                  <IconButton
                    icon={Copy}
                    label="复制链接"
                    onClick={() => void copyInviteLink(invite)}
                  />
                </div>
              </article>
            ))}
            {invites.length === 0 && (
              <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-4 text-sm text-stone-600">
                暂无邀请码。
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function GitHubPanel({ state }: { state: ProjectState }) {
  const config = getCloudConfig();
  const [origin, setOrigin] = useState("");
  const [message, setMessage] = useState("GitHub 监听配置已准备");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const webhookUrl = `${origin}/api/github/webhook?projectKey=${encodeURIComponent(
    config.projectKey,
  )}`;
  const githubEvidence = state.tasks.flatMap((task) =>
    task.evidence
      .filter((evidence) => evidence.id.startsWith("github-"))
      .map((evidence) => ({
        task,
        evidence,
      })),
  );

  const copyWebhookUrl = async () => {
    await window.navigator.clipboard.writeText(webhookUrl);
    setMessage("Webhook URL 已复制");
  };

  const copyTaskPattern = async (taskId: string) => {
    await window.navigator.clipboard.writeText(`[TASK-${taskId}]`);
    setMessage(`任务标记已复制：[TASK-${taskId}]`);
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <div className="grid gap-5">
        <div className="rounded-md border border-stone-300 bg-white p-4">
          <SectionTitle icon={GitBranch} title="GitHub Webhook" />
          <p className="mt-3 text-sm leading-6 text-stone-600">
            在 GitHub 仓库 Settings → Webhooks 中新增 webhook，并把下面地址填入 Payload URL。
          </p>
          <div className="mt-4 grid gap-3">
            <InfoStrip label="项目键" value={config.projectKey} />
            <label className="block text-sm font-medium text-stone-700">
              Payload URL
              <input
                className="mt-2 h-10 w-full rounded-md border border-stone-300 bg-stone-50 px-3 font-mono text-xs outline-none focus:border-stone-900"
                value={webhookUrl}
                readOnly
              />
            </label>
            <IconButton icon={Copy} label="复制 Webhook URL" onClick={copyWebhookUrl} />
            <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
              {message}
            </p>
          </div>
        </div>

        <div className="rounded-md border border-stone-300 bg-white p-4">
          <SectionTitle icon={ShieldCheck} title="GitHub 设置" />
          <div className="mt-4 grid gap-3 text-sm text-stone-700">
            <InfoStrip label="Content type" value="application/json" />
            <InfoStrip label="Secret" value="填写 .env.local 中的 GITHUB_WEBHOOK_SECRET" />
            <InfoStrip
              label="Events"
              value="push, pull_request, pull_request_review, check_run, check_suite"
            />
            <p className="leading-6 text-stone-600">
              PR 标题、PR 描述或 commit message 中写入任务标记，系统会自动绑定证据。
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5">
        <div className="rounded-md border border-stone-300 bg-white p-4">
          <SectionTitle icon={GitPullRequest} title="任务标记" />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-300">
                  <th className="px-3 py-3">任务</th>
                  <th className="px-3 py-3">标记</th>
                  <th className="px-3 py-3">负责人</th>
                  <th className="px-3 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {state.tasks.map((task) => (
                  <tr key={task.id} className="border-b border-stone-200">
                    <td className="px-3 py-3 font-medium">{task.title}</td>
                    <td className="px-3 py-3 font-mono text-xs">[TASK-{task.id}]</td>
                    <td className="px-3 py-3">
                      {getMemberName(state.members, task.ownerId)}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-800 hover:bg-stone-100"
                        onClick={() => void copyTaskPattern(task.id)}
                      >
                        复制
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-md border border-stone-300 bg-white p-4">
          <SectionTitle icon={ClipboardCheck} title="已绑定 GitHub 证据" />
          <div className="mt-4 grid gap-3">
            {githubEvidence.map(({ task, evidence }) => (
              <article
                key={`${task.id}-${evidence.id}`}
                className="rounded-md border border-stone-200 bg-stone-50 p-3"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="mt-1 text-sm text-stone-600">
                      {evidence.type} · {evidence.label}
                    </p>
                  </div>
                  {evidence.url ? (
                    <a
                      className="rounded-md border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-800 hover:bg-stone-100"
                      href={evidence.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      打开
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
            {githubEvidence.length === 0 && (
              <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-4 text-sm text-stone-600">
                还没有自动绑定的 GitHub 证据。创建 PR 时在标题或描述写入任务标记即可测试。
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SettlementPanel({ state }: { state: ProjectState }) {
  const archivedReviews = state.reviews.length;
  const archivedSnapshots = state.snapshots.length;
  const archivedPrizeDecisions = state.prizeDecisions.length;

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-md border border-stone-300 bg-white p-5">
        <SectionTitle icon={Scale} title="结算暂存" />
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <p className="font-semibold">贡献度系统暂时隐藏，等待重新设计。</p>
          <p className="mt-2">
            当前版本不会展示互评分、任务贡献点、最终贡献比例、饼图或奖金分配建议。
            已有历史记录仍保留在云端项目状态中，本次停用不会删除服务端用户数据或结算数据。
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <InfoStrip label="历史问卷" value={`${archivedReviews} 条已暂存`} />
          <InfoStrip label="结算快照" value={`${archivedSnapshots} 份已暂存`} />
          <InfoStrip label="奖金决议" value={`${archivedPrizeDecisions} 条已暂存`} />
        </div>

        <div className="mt-5 rounded-md border border-stone-200 bg-stone-50 p-4">
          <h3 className="text-sm font-semibold text-stone-800">当前实战阶段建议</h3>
          <div className="mt-3 grid gap-2 text-sm leading-6 text-stone-700">
            <p>1. 继续使用任务告示板记录负责人、截止时间、难度和验收状态。</p>
            <p>2. 继续使用 GitHub Webhook 收集 PR、Commit、Review 和构建证据。</p>
            <p>3. 奖金或分成讨论暂时移出系统，等新的贡献模型确认后再恢复。</p>
          </div>
        </div>
      </div>

      <aside className="rounded-md border border-stone-300 bg-white p-5">
        <SectionTitle icon={ClipboardCheck} title="保留能力" />
        <div className="mt-4 grid gap-3 text-sm text-stone-700">
          <InfoStrip label="任务难度" value="继续保留" />
          <InfoStrip label="任务证据" value="继续保留" />
          <InfoStrip label="移动端查看" value="已适配任务卡片" />
        </div>
      </aside>
    </section>
  );
}

function AppealPanel({
  state,
  appealForm,
  setAppealForm,
  submitAppeal,
  resolveAppeal,
}: {
  state: ProjectState;
  appealForm: {
    memberId: string;
    taskId: string;
    reason: string;
  };
  setAppealForm: React.Dispatch<React.SetStateAction<typeof appealForm>>;
  submitAppeal: () => void;
  resolveAppeal: (appealId: string, status: Appeal["status"]) => void;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <div className="rounded-md border border-stone-300 bg-white p-4">
        <SectionTitle icon={AlertTriangle} title="提交申诉" />
        <div className="mt-4 grid gap-3">
          <MemberSelect
            label="成员"
            members={state.members}
            value={appealForm.memberId}
            onChange={(value) =>
              setAppealForm((current) => ({ ...current, memberId: value }))
            }
          />
          <SelectField
            label="任务"
            value={appealForm.taskId}
            options={state.tasks.map((task) => task.id)}
            renderOption={(taskId) =>
              state.tasks.find((task) => task.id === taskId)?.title ?? taskId
            }
            onChange={(value) =>
              setAppealForm((current) => ({ ...current, taskId: value }))
            }
          />
          <label className="block text-sm font-medium text-stone-700">
            申诉理由
            <textarea
              className="mt-2 min-h-28 w-full resize-y rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-stone-900"
              value={appealForm.reason}
              onChange={(event) =>
                setAppealForm((current) => ({ ...current, reason: event.target.value }))
              }
            />
          </label>
          <IconButton icon={Send} label="提交申诉" onClick={submitAppeal} />
        </div>
      </div>

      <div className="rounded-md border border-stone-300 bg-white p-4">
        <SectionTitle icon={ShieldCheck} title="复核队列" />
        <div className="mt-4 grid gap-3">
          {state.appeals.map((appeal) => {
            const task = state.tasks.find((item) => item.id === appeal.taskId);
            return (
              <article
                key={appeal.id}
                className="rounded-md border border-stone-200 bg-stone-50 p-3"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-medium">{task?.title ?? "任务"}</p>
                    <p className="mt-1 text-sm text-stone-600">
                      {getMemberName(state.members, appeal.memberId)} · {appeal.createdAt}
                    </p>
                  </div>
                  <span className="w-fit rounded-sm border border-stone-300 bg-white px-2 py-1 text-xs">
                    {appeal.status}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-700">{appeal.reason}</p>
                {appeal.resolution && (
                  <p className="mt-2 rounded-sm bg-white px-2 py-2 text-sm text-stone-600">
                    {appeal.resolution}
                  </p>
                )}
                {appeal.status === "待复核" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <IconButton
                      icon={CheckCircle2}
                      label="接受"
                      onClick={() => resolveAppeal(appeal.id, "已接受")}
                    />
                    <IconButton
                      icon={Archive}
                      label="驳回"
                      onClick={() => resolveAppeal(appeal.id, "已驳回")}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <div className="mt-6 border-t border-stone-200 pt-4">
          <SectionTitle icon={FileText} title="审计日志" />
          <div className="mt-3 max-h-80 overflow-y-auto">
            {state.auditLog.map((event) => (
              <div key={event.id} className="border-b border-stone-100 py-2 text-sm">
                <p className="font-medium">
                  {event.actor} · {event.action}
                </p>
                <p className="text-stone-600">
                  {event.target} · {event.createdAt}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Users;
}) {
  return (
    <div className="min-h-24 rounded-md border border-stone-300 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-stone-600">{label}</p>
        <Icon className="h-5 w-5 text-stone-500" aria-hidden="true" />
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function AuthWidget({ auth }: { auth: ReturnType<typeof useSupabaseAuth> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!auth.enabled) {
    return (
      <div className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-600">
        账号登录未配置
      </div>
    );
  }

  if (auth.user) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
        <span className="max-w-64 truncate">{auth.user.email}</span>
        <button
          type="button"
          className="rounded-sm border border-sky-300 bg-white px-2 py-1 text-xs font-medium text-sky-900 hover:bg-sky-100"
          onClick={() => void auth.signOut()}
          disabled={auth.loading}
        >
          退出
        </button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-2 rounded-md border border-stone-300 bg-white p-2 text-sm sm:grid-cols-[180px_140px_auto_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        void auth.signIn(email, password);
      }}
    >
      <input
        className="h-9 rounded-md border border-stone-300 bg-stone-50 px-2 outline-none focus:border-stone-900"
        type="email"
        placeholder="邮箱"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <input
        className="h-9 rounded-md border border-stone-300 bg-stone-50 px-2 outline-none focus:border-stone-900"
        type="password"
        placeholder="密码"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <button
        type="submit"
        className="h-9 rounded-md border border-stone-900 bg-stone-950 px-3 text-xs font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        disabled={auth.loading || !email || !password}
      >
        登录
      </button>
      <button
        type="button"
        className="h-9 rounded-md border border-stone-300 bg-stone-50 px-3 text-xs font-medium text-stone-800 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
        disabled={auth.loading || !email || !password}
        onClick={() => void auth.signUp(email, password)}
      >
        注册
      </button>
      <p className="sm:col-span-4 text-xs text-stone-500">{auth.message}</p>
    </form>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof FileText; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-5 w-5 text-stone-700" aria-hidden="true" />
      <h2 className="text-base font-semibold">{title}</h2>
    </div>
  );
}

function InfoStrip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-3">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      {label}
      <input
        className="mt-2 h-10 w-full rounded-md border border-stone-300 bg-stone-50 px-3 text-sm outline-none focus:border-stone-900"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      {label}
      <input
        className="mt-2 h-10 w-full rounded-md border border-stone-300 bg-stone-50 px-3 text-sm outline-none focus:border-stone-900"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  renderOption,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  renderOption?: (value: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      {label}
      <select
        className="mt-2 h-10 w-full rounded-md border border-stone-300 bg-stone-50 px-3 text-sm outline-none focus:border-stone-900"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {renderOption ? renderOption(option) : option}
          </option>
        ))}
      </select>
    </label>
  );
}

function MemberSelect({
  label,
  members,
  value,
  onChange,
}: {
  label: string;
  members: Member[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SelectField
      label={label}
      value={value}
      options={members.map((member) => member.id)}
      renderOption={(memberId) => getMemberName(members, memberId)}
      onChange={onChange}
    />
  );
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Save;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-stone-900 bg-stone-950 px-3 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function formatAccessLevel(level: string) {
  const labels: Record<string, string> = {
    owner: "负责人",
    planner: "主策/策划",
    reviewer: "复核人",
    member: "成员",
    viewer: "观察者",
  };

  return labels[level] ?? level;
}

function mapCloudMemberToProjectMember(member: CloudProjectMember): Member {
  const roleByAccess: Record<ProjectAccessLevel, Member["role"]> = {
    owner: "主策",
    planner: "主策",
    reviewer: "复核人",
    member: "成员",
    viewer: "成员",
  };

  return {
    id: member.userId,
    name: member.displayName || member.email || member.userId.slice(0, 8),
    role: roleByAccess[member.accessLevel],
    primaryDiscipline: "文档",
    conflictReviewer: member.accessLevel === "owner" || member.accessLevel === "reviewer",
    joinedAt: member.createdAt,
  };
}
