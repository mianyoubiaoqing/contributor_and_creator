import type { ProjectState } from "./types";

export const initialState: ProjectState = {
  project: {
    name: "未命名 Game Jam 项目",
    eventName: "Game Jam 实战项目",
    phase: "准备",
    engine: "Unity",
    engineVersion: "",
    targetPlatform: "Windows / WebGL",
    repository: "",
    dependencies: [],
    rulesVersion: "live-rules-v0.1",
    collaborationMarkdown:
      "# 协作规则\n\n- 任务必须绑定负责人、验收人和证据。\n- 主策可以参与评分，但不能单独确认自己的结算。\n- 结算阶段先冻结贡献比例；是否获得奖金、奖金金额与付款动作在后续奖金决议中处理。\n- AI 难度评估仅作为参考证据，不直接决定收益。\n",
  },
  members: [],
  tasks: [],
  reviews: [],
  appeals: [],
  snapshots: [],
  prizeDecisions: [],
  auditLog: [
    {
      id: "log-live-init",
      actor: "系统",
      action: "创建实战空项目",
      target: "live-rules-v0.1",
      createdAt: "2026-06-30 00:00",
    },
  ],
};

export function createLiveProjectState(current?: ProjectState): ProjectState {
  return {
    project: current?.project ?? initialState.project,
    members: [],
    tasks: [],
    reviews: [],
    appeals: [],
    snapshots: [],
    prizeDecisions: [],
    auditLog: [
      {
        id: `log-live-reset-${Date.now()}`,
        actor: "系统",
        action: "清空协作数据",
        target: "清空成员池、任务、历史问卷、申诉、结算快照和奖金决议",
        createdAt: new Intl.DateTimeFormat("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date()),
      },
    ],
  };
}
