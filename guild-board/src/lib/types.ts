export type Discipline =
  | "设计"
  | "程序"
  | "美术"
  | "音频"
  | "媒体"
  | "QA"
  | "制片"
  | "本地化"
  | "文档";

export type TaskStatus =
  | "开放领取"
  | "已领取"
  | "进行中"
  | "提交验收"
  | "返工"
  | "已通过";

export type Role =
  | "主策"
  | "技术负责人"
  | "美术负责人"
  | "成员"
  | "复核人"
  | "收款代表";

export type ProjectAccessLevel =
  | "owner"
  | "planner"
  | "reviewer"
  | "member"
  | "viewer";

export type EvidenceType =
  | "PR"
  | "Commit"
  | "附件"
  | "截图"
  | "构建"
  | "文档"
  | "评审";

export type AppealStatus = "待复核" | "已接受" | "已驳回";

export type SettlementStatus = "进行中" | "预结算" | "冻结";

export type Member = {
  id: string;
  name: string;
  role: Role;
  primaryDiscipline: Discipline;
  conflictReviewer: boolean;
  joinedAt: string;
};

export type TaskEvidence = {
  id: string;
  type: EvidenceType;
  label: string;
  url: string;
};

export type Task = {
  id: string;
  title: string;
  discipline: Discipline;
  module: string;
  status: TaskStatus;
  ownerId: string;
  collaboratorIds: string[];
  reviewerId: string;
  difficultyPlanner: number;
  difficultyAi: number;
  difficultyMember: number;
  completion: number;
  quality: number;
  timeliness: number;
  evidenceStrength: number;
  dueAt: string;
  acceptedAt?: string;
  description: string;
  evidence: TaskEvidence[];
};

export type PeerReview = {
  id: string;
  raterId: string;
  targetId: string;
  reliability: number;
  collaboration: number;
  craft: number;
  quality: number;
  support: number;
  note: string;
};

export type Appeal = {
  id: string;
  memberId: string;
  taskId: string;
  reason: string;
  status: AppealStatus;
  reviewerId?: string;
  resolution?: string;
  createdAt: string;
};

export type SettlementMemberLine = {
  memberId: string;
  taskPoints: number;
  peerPoints: number;
  keyResponsibilityPoints: number;
  finalPoints: number;
  ratio: number;
};

export type SettlementSnapshot = {
  id: string;
  status: SettlementStatus;
  createdAt: string;
  frozenAt?: string;
  lines: SettlementMemberLine[];
};

export type PrizeDecision = {
  id: string;
  snapshotId: string;
  status: "未获得奖金" | "等待奖金结果" | "已获得奖金";
  grossPrize: number;
  deductions: number;
  note: string;
  decidedAt: string;
};

export type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  target: string;
  createdAt: string;
};

export type CloudProjectMember = {
  projectKey: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  accessLevel: ProjectAccessLevel;
  approvalStatus: "approved" | "pending";
  createdAt: string;
};

export type ProjectInvite = {
  id: string;
  projectKey: string;
  inviteCode: string;
  label: string;
  defaultAccessLevel: ProjectAccessLevel;
  requireApproval: boolean;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
};

export type ProjectState = {
  project: {
    name: string;
    eventName: string;
    phase: "准备" | "开发中" | "预结算" | "已冻结" | "奖金决议";
    engine: string;
    engineVersion: string;
    targetPlatform: string;
    repository: string;
    dependencies: string[];
    collaborationMarkdown: string;
    rulesVersion: string;
  };
  members: Member[];
  tasks: Task[];
  reviews: PeerReview[];
  appeals: Appeal[];
  snapshots: SettlementSnapshot[];
  prizeDecisions: PrizeDecision[];
  auditLog: AuditEvent[];
};

export const disciplines: Discipline[] = [
  "设计",
  "程序",
  "美术",
  "音频",
  "媒体",
  "QA",
  "制片",
  "本地化",
  "文档",
];

export const taskStatuses: TaskStatus[] = [
  "开放领取",
  "已领取",
  "进行中",
  "提交验收",
  "返工",
  "已通过",
];

export const evidenceTypes: EvidenceType[] = [
  "PR",
  "Commit",
  "附件",
  "截图",
  "构建",
  "文档",
  "评审",
];
