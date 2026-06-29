"use client";

import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import ReactECharts from "echarts-for-react";
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
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  calculateSettlementLines,
  formatCurrency,
  formatNumber,
  getDifficultyDelta,
  getMemberName,
  getPrizeDistribution,
  getSettlementTotal,
  getTaskBasePoints,
  getTaskDifficulty,
} from "@/lib/calculations";
import { initialState } from "@/lib/sample-data";
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
  type PeerReview,
  type ProjectAccessLevel,
  type ProjectInvite,
  type PrizeDecision,
  type ProjectState,
  type SettlementSnapshot,
  type Task,
  type TaskStatus,
} from "@/lib/types";

type Tab =
  | "overview"
  | "tasks"
  | "members"
  | "github"
  | "reviews"
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
  { id: "overview", label: "项目", icon: GanttChartSquare },
  { id: "tasks", label: "任务", icon: ListChecks },
  { id: "members", label: "成员", icon: UserPlus },
  { id: "github", label: "GitHub", icon: GitBranch },
  { id: "reviews", label: "互评", icon: Users },
  { id: "settlement", label: "结算", icon: Scale },
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
  const [selectedRaterId, setSelectedRaterId] = useState(initialState.members[0].id);
  const [selectedTargetId, setSelectedTargetId] = useState(initialState.members[1].id);
  const [reviewScores, setReviewScores] = useState({
    reliability: 4,
    collaboration: 4,
    craft: 4,
    quality: 4,
    support: 4,
    note: "",
  });
  const [appealForm, setAppealForm] = useState({
    memberId: initialState.members[0].id,
    taskId: initialState.tasks[0].id,
    reason: "",
  });
  const [prizeForm, setPrizeForm] = useState({
    status: "等待奖金结果" as PrizeDecision["status"],
    grossPrize: 0,
    deductions: 0,
    note: "结算阶段后再确认奖金是否存在与具体分配。",
  });
  const [newTask, setNewTask] = useState<NewTaskForm>(() => ({
    title: "",
    discipline: "设计",
    module: "",
    ownerId: initialState.members[0].id,
    reviewerId: initialState.members[7].id,
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

  const settlementLines = useMemo(() => calculateSettlementLines(state), [state]);
  const latestSnapshot = state.snapshots.at(-1);
  const activeLines = latestSnapshot?.lines ?? settlementLines;
  const totalTasks = state.tasks.length;
  const doneTasks = state.tasks.filter((task) => task.status === "已通过").length;
  const pendingAppeals = state.appeals.filter((appeal) => appeal.status === "待复核").length;
  const latestPrizeDecision = state.prizeDecisions.at(-1);

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

  const saveReview = () => {
    const review: PeerReview = {
      id: createId("review"),
      raterId: selectedRaterId,
      targetId: selectedTargetId,
      reliability: reviewScores.reliability,
      collaboration: reviewScores.collaboration,
      craft: reviewScores.craft,
      quality: reviewScores.quality,
      support: reviewScores.support,
      note: reviewScores.note,
    };

    setState((current) => ({
      ...current,
      reviews: [
        review,
        ...current.reviews.filter(
          (item) =>
            item.raterId !== selectedRaterId || item.targetId !== selectedTargetId,
        ),
      ],
      auditLog: [
        {
          id: createId("log"),
          actor: getMemberName(current.members, selectedRaterId),
          action: "提交互评",
          target: getMemberName(current.members, selectedTargetId),
          createdAt: nowLabel(),
        },
        ...current.auditLog,
      ],
    }));
    setReviewScores((current) => ({ ...current, note: "" }));
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
                  : "证据不足，本轮不调整贡献点。",
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

  const createSnapshot = () => {
    const snapshot: SettlementSnapshot = {
      id: createId("snapshot"),
      status: "预结算",
      createdAt: nowLabel(),
      lines: settlementLines,
    };

    setState((current) => ({
      ...current,
      project: {
        ...current.project,
        phase: "预结算",
      },
      snapshots: [...current.snapshots, snapshot],
      auditLog: [
        {
          id: createId("log"),
          actor: "系统",
          action: "生成贡献比例快照",
          target: snapshot.id,
          createdAt: snapshot.createdAt,
        },
        ...current.auditLog,
      ],
    }));
  };

  const freezeSnapshot = () => {
    const snapshot = state.snapshots.at(-1);
    if (!snapshot) {
      return;
    }

    setState((current) => ({
      ...current,
      project: {
        ...current.project,
        phase: "已冻结",
      },
      snapshots: current.snapshots.map((item) =>
        item.id === snapshot.id
          ? {
              ...item,
              status: "冻结",
              frozenAt: nowLabel(),
            }
          : item,
      ),
      auditLog: [
        {
          id: createId("log"),
          actor: "复核组",
          action: "冻结贡献比例",
          target: snapshot.id,
          createdAt: nowLabel(),
        },
        ...current.auditLog,
      ],
    }));
  };

  const savePrizeDecision = () => {
    const snapshot = state.snapshots.at(-1);
    if (!snapshot) {
      return;
    }

    const decision: PrizeDecision = {
      id: createId("prize"),
      snapshotId: snapshot.id,
      status: prizeForm.status,
      grossPrize: prizeForm.status === "已获得奖金" ? prizeForm.grossPrize : 0,
      deductions: prizeForm.status === "已获得奖金" ? prizeForm.deductions : 0,
      note: prizeForm.note,
      decidedAt: nowLabel(),
    };

    setState((current) => ({
      ...current,
      project: {
        ...current.project,
        phase: "奖金决议",
      },
      prizeDecisions: [...current.prizeDecisions, decision],
      auditLog: [
        {
          id: createId("log"),
          actor: "收款代表",
          action: "创建奖金分配决议",
          target: decision.status,
          createdAt: decision.decidedAt,
        },
        ...current.auditLog,
      ],
    }));
  };

  const resetDemo = () => {
    setState(initialState);
    clearLocalState();
  };

  return (
    <main className="min-h-screen bg-[#f6f3ee] text-stone-950">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-4 md:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-stone-300 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
              <span className="rounded-sm border border-stone-300 bg-white px-2 py-1">
                {state.project.eventName}
              </span>
              <span className="rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">
                {state.project.phase}
              </span>
              <span className="rounded-sm border border-stone-300 bg-white px-2 py-1">
                规则 {state.project.rulesVersion}
              </span>
              <span
                className={clsx(
                  "inline-flex items-center gap-1 rounded-sm border px-2 py-1",
                  persistenceStatus.mode === "cloud"
                    ? "border-sky-200 bg-sky-50 text-sky-800"
                    : "border-stone-300 bg-white text-stone-600",
                )}
                title={persistenceStatus.message}
              >
                <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
                {persistenceStatus.mode === "cloud" ? "云端" : "本地"}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-normal md:text-3xl">
              {state.project.name}
            </h1>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <AuthWidget auth={auth} />
            <div className="flex flex-wrap gap-2">
              <IconButton icon={RotateCcw} label="重置演示数据" onClick={resetDemo} />
              <IconButton
                icon={Save}
                label={persistenceStatus.state === "error" ? "保存异常" : "已自动保存"}
                onClick={() => addAudit("系统", "手动确认保存", "项目状态")}
              />
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="成员" value={`${state.members.length} 人`} icon={Users} />
          <Metric label="任务通过" value={`${doneTasks}/${totalTasks}`} icon={CheckCircle2} />
          <Metric
            label="当前贡献总分"
            value={formatNumber(getSettlementTotal(settlementLines))}
            icon={Scale}
          />
          <Metric label="待复核申诉" value={`${pendingAppeals} 条`} icon={AlertTriangle} />
        </section>

        <nav className="flex gap-1 overflow-x-auto border-b border-stone-300">
          {tabItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={clsx(
                  "flex min-h-11 min-w-24 items-center justify-center gap-2 border-b-2 px-3 text-sm font-medium transition",
                  tab === item.id
                    ? "border-stone-950 text-stone-950"
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

        {tab === "members" && <MemberPanel auth={auth} />}

        {tab === "github" && <GitHubPanel state={state} />}

        {tab === "reviews" && (
          <ReviewPanel
            state={state}
            selectedRaterId={selectedRaterId}
            selectedTargetId={selectedTargetId}
            reviewScores={reviewScores}
            setSelectedRaterId={setSelectedRaterId}
            setSelectedTargetId={setSelectedTargetId}
            setReviewScores={setReviewScores}
            saveReview={saveReview}
          />
        )}

        {tab === "settlement" && (
          <SettlementPanel
            state={state}
            liveLines={settlementLines}
            activeLines={activeLines}
            latestSnapshot={latestSnapshot}
            latestPrizeDecision={latestPrizeDecision}
            prizeForm={prizeForm}
            setPrizeForm={setPrizeForm}
            createSnapshot={createSnapshot}
            freezeSnapshot={freezeSnapshot}
            savePrizeDecision={savePrizeDecision}
          />
        )}

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
        <SectionTitle icon={ClipboardCheck} title="任务表与结算因子" />
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
            {getMemberName(members, task.ownerId)} · {formatNumber(getTaskBasePoints(task))} 点
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
        header: "质量",
        cell: ({ row }) => (
          <input
            className="h-9 w-20 rounded-md border border-stone-300 px-2 text-sm"
            type="number"
            min={0.5}
            max={1.3}
            step={0.05}
            value={row.original.quality}
            onChange={(event) =>
              updateTask(row.original.id, "quality", Number(event.target.value))
            }
          />
        ),
      },
      {
        header: "准时",
        cell: ({ row }) => (
          <input
            className="h-9 w-20 rounded-md border border-stone-300 px-2 text-sm"
            type="number"
            min={0.5}
            max={1.2}
            step={0.05}
            value={row.original.timeliness}
            onChange={(event) =>
              updateTask(row.original.id, "timeliness", Number(event.target.value))
            }
          />
        ),
      },
      {
        header: "证据",
        cell: ({ row }) => (
          <input
            className="h-9 w-20 rounded-md border border-stone-300 px-2 text-sm"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={row.original.evidenceStrength}
            onChange={(event) =>
              updateTask(row.original.id, "evidenceStrength", Number(event.target.value))
            }
          />
        ),
      },
      {
        header: "贡献点",
        cell: ({ row }) => (
          <span className="font-medium">{formatNumber(getTaskBasePoints(row.original))}</span>
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
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
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
  );
}

function MemberPanel({ auth }: { auth: ReturnType<typeof useSupabaseAuth> }) {
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
            <IconButton icon={RefreshCw} label="刷新" onClick={refresh} disabled={loading} />
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

function ReviewPanel({
  state,
  selectedRaterId,
  selectedTargetId,
  reviewScores,
  setSelectedRaterId,
  setSelectedTargetId,
  setReviewScores,
  saveReview,
}: {
  state: ProjectState;
  selectedRaterId: string;
  selectedTargetId: string;
  reviewScores: {
    reliability: number;
    collaboration: number;
    craft: number;
    quality: number;
    support: number;
    note: string;
  };
  setSelectedRaterId: (value: string) => void;
  setSelectedTargetId: (value: string) => void;
  setReviewScores: React.Dispatch<React.SetStateAction<typeof reviewScores>>;
  saveReview: () => void;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
      <div className="rounded-md border border-stone-300 bg-white p-4">
        <SectionTitle icon={Users} title="成员互评问卷" />
        <div className="mt-4 grid gap-3">
          <MemberSelect
            label="评分人"
            members={state.members}
            value={selectedRaterId}
            onChange={setSelectedRaterId}
          />
          <MemberSelect
            label="被评分人"
            members={state.members}
            value={selectedTargetId}
            onChange={setSelectedTargetId}
          />
          <ScoreSlider
            label="交付可靠性"
            value={reviewScores.reliability}
            onChange={(value) =>
              setReviewScores((current) => ({ ...current, reliability: value }))
            }
          />
          <ScoreSlider
            label="协作质量"
            value={reviewScores.collaboration}
            onChange={(value) =>
              setReviewScores((current) => ({ ...current, collaboration: value }))
            }
          />
          <ScoreSlider
            label="专业贡献"
            value={reviewScores.craft}
            onChange={(value) =>
              setReviewScores((current) => ({ ...current, craft: value }))
            }
          />
          <ScoreSlider
            label="质量意识"
            value={reviewScores.quality}
            onChange={(value) =>
              setReviewScores((current) => ({ ...current, quality: value }))
            }
          />
          <ScoreSlider
            label="项目支持"
            value={reviewScores.support}
            onChange={(value) =>
              setReviewScores((current) => ({ ...current, support: value }))
            }
          />
          <label className="block text-sm font-medium text-stone-700">
            说明
            <textarea
              className="mt-2 min-h-24 w-full resize-y rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-stone-900"
              value={reviewScores.note}
              onChange={(event) =>
                setReviewScores((current) => ({ ...current, note: event.target.value }))
              }
            />
          </label>
          <IconButton icon={Send} label="提交互评" onClick={saveReview} />
        </div>
      </div>

      <div className="rounded-md border border-stone-300 bg-white p-4">
        <SectionTitle icon={ClipboardCheck} title="已提交互评" />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-300">
                <th className="px-3 py-3">评分人</th>
                <th className="px-3 py-3">对象</th>
                <th className="px-3 py-3">平均</th>
                <th className="px-3 py-3">说明</th>
              </tr>
            </thead>
            <tbody>
              {state.reviews.map((review) => {
                const average =
                  (review.reliability +
                    review.collaboration +
                    review.craft +
                    review.quality +
                    review.support) /
                  5;
                return (
                  <tr key={review.id} className="border-b border-stone-200">
                    <td className="px-3 py-3">{getMemberName(state.members, review.raterId)}</td>
                    <td className="px-3 py-3">{getMemberName(state.members, review.targetId)}</td>
                    <td className="px-3 py-3">{average.toFixed(1)}</td>
                    <td className="px-3 py-3 text-stone-600">{review.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SettlementPanel({
  state,
  liveLines,
  activeLines,
  latestSnapshot,
  latestPrizeDecision,
  prizeForm,
  setPrizeForm,
  createSnapshot,
  freezeSnapshot,
  savePrizeDecision,
}: {
  state: ProjectState;
  liveLines: ReturnType<typeof calculateSettlementLines>;
  activeLines: ReturnType<typeof calculateSettlementLines>;
  latestSnapshot?: SettlementSnapshot;
  latestPrizeDecision?: PrizeDecision;
  prizeForm: {
    status: PrizeDecision["status"];
    grossPrize: number;
    deductions: number;
    note: string;
  };
  setPrizeForm: React.Dispatch<React.SetStateAction<typeof prizeForm>>;
  createSnapshot: () => void;
  freezeSnapshot: () => void;
  savePrizeDecision: () => void;
}) {
  const chartOption = useMemo(
    () => ({
      tooltip: {
        trigger: "item",
        formatter: "{b}: {d}%",
      },
      legend: {
        bottom: 0,
        type: "scroll",
      },
      series: [
        {
          type: "pie",
          radius: ["42%", "70%"],
          center: ["50%", "42%"],
          avoidLabelOverlap: true,
          data: activeLines.map((line) => ({
            name: getMemberName(state.members, line.memberId),
            value: line.ratio,
          })),
        },
      ],
    }),
    [activeLines, state.members],
  );

  const distribution = latestPrizeDecision
    ? getPrizeDistribution(
        activeLines,
        latestPrizeDecision.grossPrize,
        latestPrizeDecision.deductions,
      )
    : [];

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded-md border border-stone-300 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <SectionTitle icon={Scale} title="贡献比例结算" />
          <div className="flex flex-wrap gap-2">
            <IconButton icon={Archive} label="生成预结算" onClick={createSnapshot} />
            <IconButton
              icon={ShieldCheck}
              label="冻结比例"
              onClick={freezeSnapshot}
              disabled={!latestSnapshot || latestSnapshot.status === "冻结"}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <InfoStrip label="实时总分" value={formatNumber(getSettlementTotal(liveLines))} />
          <InfoStrip
            label="快照状态"
            value={latestSnapshot ? latestSnapshot.status : "尚未生成"}
          />
          <InfoStrip
            label="冻结时间"
            value={latestSnapshot?.frozenAt ?? "等待冻结"}
          />
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-300">
                <th className="px-3 py-3">成员</th>
                <th className="px-3 py-3">任务点</th>
                <th className="px-3 py-3">互评点</th>
                <th className="px-3 py-3">职责点</th>
                <th className="px-3 py-3">最终分</th>
                <th className="px-3 py-3">贡献比例</th>
              </tr>
            </thead>
            <tbody>
              {activeLines.map((line) => (
                <tr key={line.memberId} className="border-b border-stone-200">
                  <td className="px-3 py-3 font-medium">
                    {getMemberName(state.members, line.memberId)}
                  </td>
                  <td className="px-3 py-3">{formatNumber(line.taskPoints)}</td>
                  <td className="px-3 py-3">{formatNumber(line.peerPoints)}</td>
                  <td className="px-3 py-3">{formatNumber(line.keyResponsibilityPoints)}</td>
                  <td className="px-3 py-3">{formatNumber(line.finalPoints)}</td>
                  <td className="px-3 py-3 font-semibold">{line.ratio}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="grid gap-5">
        <div className="rounded-md border border-stone-300 bg-white p-4">
          <SectionTitle icon={Trophy} title="贡献饼图" />
          <div className="mt-4 h-80">
            <ReactECharts option={chartOption} style={{ height: "100%", width: "100%" }} />
          </div>
        </div>

        <div className="rounded-md border border-stone-300 bg-white p-4">
          <SectionTitle icon={Trophy} title="奖金分配决议" />
          <p className="mt-3 text-sm leading-6 text-stone-600">
            贡献比例可以先冻结；是否获奖、奖金金额和扣除项在这里后置记录。
          </p>
          <div className="mt-4 grid gap-3">
            <SelectField
              label="奖金状态"
              value={prizeForm.status}
              options={["等待奖金结果", "未获得奖金", "已获得奖金"]}
              onChange={(value) =>
                setPrizeForm((current) => ({
                  ...current,
                  status: value as PrizeDecision["status"],
                }))
              }
            />
            <NumberField
              label="奖金总额"
              value={prizeForm.grossPrize}
              min={0}
              max={999999}
              onChange={(value) =>
                setPrizeForm((current) => ({ ...current, grossPrize: value }))
              }
            />
            <NumberField
              label="扣除项"
              value={prizeForm.deductions}
              min={0}
              max={999999}
              onChange={(value) =>
                setPrizeForm((current) => ({ ...current, deductions: value }))
              }
            />
            <label className="block text-sm font-medium text-stone-700">
              决议说明
              <textarea
                className="mt-2 min-h-20 w-full resize-y rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-stone-900"
                value={prizeForm.note}
                onChange={(event) =>
                  setPrizeForm((current) => ({ ...current, note: event.target.value }))
                }
              />
            </label>
            <IconButton
              icon={Save}
              label="保存奖金决议"
              onClick={savePrizeDecision}
              disabled={!latestSnapshot}
            />
          </div>
          {latestPrizeDecision && (
            <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
              <p className="font-medium">{latestPrizeDecision.status}</p>
              <p className="mt-1 text-stone-600">{latestPrizeDecision.note}</p>
              <p className="mt-2">
                可分配金额：
                {formatCurrency(
                  Math.max(
                    latestPrizeDecision.grossPrize - latestPrizeDecision.deductions,
                    0,
                  ),
                )}
              </p>
              {distribution.length > 0 && (
                <div className="mt-3 grid gap-1">
                  {distribution.map((line) => (
                    <div key={line.memberId} className="flex justify-between gap-2">
                      <span>{getMemberName(state.members, line.memberId)}</span>
                      <span>{formatCurrency(line.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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

function ScoreSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span className="flex items-center justify-between gap-3">
        {label}
        <span className="font-semibold">{value}</span>
      </span>
      <input
        className="mt-2 h-2 w-full accent-stone-900"
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
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
