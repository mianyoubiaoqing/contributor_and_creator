import type {
  Member,
  PeerReview,
  ProjectState,
  SettlementMemberLine,
  Task,
} from "./types";

const keyResponsibilityPointsByRole: Record<Member["role"], number> = {
  主策: 12,
  技术负责人: 10,
  美术负责人: 10,
  成员: 0,
  复核人: 6,
  收款代表: 5,
};

export function getMemberName(members: Member[], memberId: string) {
  return members.find((member) => member.id === memberId)?.name ?? "未分配";
}

export function getTaskDifficulty(task: Task) {
  return Number(
    (
      task.difficultyPlanner * 0.5 +
      task.difficultyMember * 0.35 +
      task.difficultyAi * 0.15
    ).toFixed(2),
  );
}

export function getDifficultyDelta(task: Task) {
  const scores = [
    task.difficultyPlanner,
    task.difficultyAi,
    task.difficultyMember,
  ];
  return Math.max(...scores) - Math.min(...scores);
}

export function getTaskBasePoints(task: Task) {
  const difficulty = getTaskDifficulty(task);
  const completion = clamp(task.completion, 0, 100) / 100;
  const quality = clamp(task.quality, 0.5, 1.3);
  const timeliness = clamp(task.timeliness, 0.5, 1.2);
  const evidenceStrength = clamp(task.evidenceStrength, 0, 1);

  return Number(
    (difficulty * 100 * completion * quality * timeliness * evidenceStrength).toFixed(
      2,
    ),
  );
}

export function splitTaskPoints(task: Task) {
  const basePoints = getTaskBasePoints(task);
  const participants = [task.ownerId, ...task.collaboratorIds];
  const uniqueParticipants = Array.from(new Set(participants)).filter(Boolean);

  if (uniqueParticipants.length === 0) {
    return new Map<string, number>();
  }

  if (uniqueParticipants.length === 1) {
    return new Map([[uniqueParticipants[0], basePoints]]);
  }

  const ownerShare = basePoints * 0.7;
  const collaboratorShare = (basePoints * 0.3) / (uniqueParticipants.length - 1);

  return new Map(
    uniqueParticipants.map((memberId) => [
      memberId,
      Number((memberId === task.ownerId ? ownerShare : collaboratorShare).toFixed(2)),
    ]),
  );
}

export function getMemberTaskPoints(memberId: string, tasks: Task[]) {
  return Number(
    tasks
      .reduce((total, task) => total + (splitTaskPoints(task).get(memberId) ?? 0), 0)
      .toFixed(2),
  );
}

export function getPeerReviewAverage(memberId: string, reviews: PeerReview[]) {
  const received = reviews.filter((review) => review.targetId === memberId);

  if (received.length === 0) {
    return 3;
  }

  const total = received.reduce((sum, review) => {
    return (
      sum +
      review.reliability +
      review.collaboration +
      review.craft +
      review.quality +
      review.support
    );
  }, 0);

  return Number((total / (received.length * 5)).toFixed(2));
}

export function getPeerPoints(memberId: string, reviews: PeerReview[]) {
  return Number((getPeerReviewAverage(memberId, reviews) * 20).toFixed(2));
}

export function getKeyResponsibilityPoints(member: Member) {
  return keyResponsibilityPointsByRole[member.role];
}

function normalizeScores(values: number[]) {
  const max = Math.max(...values, 1);
  return values.map((value) => (value / max) * 100);
}

export function calculateSettlementLines(state: ProjectState): SettlementMemberLine[] {
  const taskRaw = state.members.map((member) =>
    getMemberTaskPoints(member.id, state.tasks),
  );
  const peerRaw = state.members.map((member) => getPeerPoints(member.id, state.reviews));
  const keyRaw = state.members.map((member) => getKeyResponsibilityPoints(member));

  const taskNormalized = normalizeScores(taskRaw);
  const peerNormalized = normalizeScores(peerRaw);
  const keyNormalized = normalizeScores(keyRaw);

  const lines = state.members.map((member, index) => {
    const finalPoints =
      taskNormalized[index] * 0.7 +
      peerNormalized[index] * 0.2 +
      keyNormalized[index] * 0.1;

    return {
      memberId: member.id,
      taskPoints: Number(taskRaw[index].toFixed(2)),
      peerPoints: Number(peerRaw[index].toFixed(2)),
      keyResponsibilityPoints: Number(keyRaw[index].toFixed(2)),
      finalPoints: Number(finalPoints.toFixed(2)),
      ratio: 0,
    };
  });

  const totalFinalPoints = lines.reduce((sum, line) => sum + line.finalPoints, 0);

  return lines
    .map((line) => ({
      ...line,
      ratio:
        totalFinalPoints > 0
          ? Number(((line.finalPoints / totalFinalPoints) * 100).toFixed(2))
          : 0,
    }))
    .sort((a, b) => b.finalPoints - a.finalPoints);
}

export function getSettlementTotal(lines: SettlementMemberLine[]) {
  return Number(lines.reduce((sum, line) => sum + line.finalPoints, 0).toFixed(2));
}

export function getPrizeDistribution(
  lines: SettlementMemberLine[],
  grossPrize: number,
  deductions: number,
) {
  const distributable = Math.max(grossPrize - deductions, 0);

  return lines.map((line) => ({
    ...line,
    amount: Number(((distributable * line.ratio) / 100).toFixed(2)),
  }));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

