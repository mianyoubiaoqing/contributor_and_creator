import crypto from "crypto";
import type { ProjectState, TaskEvidence } from "@/lib/types";

type GitHubPayload = Record<string, unknown>;

export type GitHubEvidenceResult = {
  state: ProjectState;
  matchedTaskIds: string[];
  evidenceCount: number;
};

export function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
) {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;

  const received = Buffer.from(signatureHeader);
  const expected = Buffer.from(expectedSignature);

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export function applyGitHubEvidenceToState(
  state: ProjectState,
  eventName: string,
  deliveryId: string,
  payload: GitHubPayload,
) {
  const evidence = createEvidence(eventName, deliveryId, payload);
  const text = collectSearchableText(eventName, payload);
  const matchedTaskIds = findMatchedTaskIds(text, state);

  if (!evidence || matchedTaskIds.length === 0) {
    return {
      state,
      matchedTaskIds,
      evidenceCount: 0,
    } satisfies GitHubEvidenceResult;
  }

  const nextState: ProjectState = {
    ...state,
    tasks: state.tasks.map((task) => {
      if (!matchedTaskIds.includes(task.id)) {
        return task;
      }

      const alreadyExists = task.evidence.some((item) => item.id === evidence.id);
      return {
        ...task,
        evidenceStrength: Math.max(task.evidenceStrength, getEvidenceStrength(evidence.type)),
        evidence: alreadyExists ? task.evidence : [evidence, ...task.evidence],
      };
    }),
    auditLog: [
      {
        id: `github-${deliveryId}`,
        actor: getSenderLogin(payload),
        action: `GitHub ${eventName}`,
        target: evidence.label,
        createdAt: new Date().toISOString(),
      },
      ...state.auditLog,
    ],
  };

  return {
    state: nextState,
    matchedTaskIds,
    evidenceCount: matchedTaskIds.length,
  } satisfies GitHubEvidenceResult;
}

export function getGitHubRepositoryFullName(payload: GitHubPayload) {
  const repository = payload.repository as Record<string, unknown> | undefined;
  return typeof repository?.full_name === "string" ? repository.full_name : null;
}

export function getGitHubAction(payload: GitHubPayload) {
  return typeof payload.action === "string" ? payload.action : null;
}

export function getSenderLogin(payload: GitHubPayload) {
  const sender = payload.sender as Record<string, unknown> | undefined;
  return typeof sender?.login === "string" ? sender.login : "GitHub";
}

function createEvidence(
  eventName: string,
  deliveryId: string,
  payload: GitHubPayload,
): TaskEvidence | null {
  if (eventName === "pull_request") {
    const pullRequest = payload.pull_request as Record<string, unknown> | undefined;
    const number = payload.number;
    const url = getHtmlUrl(pullRequest);
    return {
      id: `github-${deliveryId}-pr`,
      type: "PR",
      label: `PR #${String(number)} ${String(pullRequest?.title ?? "")}`.trim(),
      url,
    };
  }

  if (eventName === "push") {
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    const compare = typeof payload.compare === "string" ? payload.compare : "";
    const ref = typeof payload.ref === "string" ? payload.ref.replace("refs/heads/", "") : "";
    return {
      id: `github-${deliveryId}-push`,
      type: "Commit",
      label: `Push ${ref} · ${commits.length} commits`,
      url: compare,
    };
  }

  if (eventName === "pull_request_review") {
    const review = payload.review as Record<string, unknown> | undefined;
    const pullRequest = payload.pull_request as Record<string, unknown> | undefined;
    const state = typeof review?.state === "string" ? review.state : "review";
    return {
      id: `github-${deliveryId}-review`,
      type: "评审",
      label: `PR Review · ${state}`,
      url: getHtmlUrl(review) || getHtmlUrl(pullRequest),
    };
  }

  if (eventName === "check_run" || eventName === "check_suite") {
    const checkRun = payload.check_run as Record<string, unknown> | undefined;
    const checkSuite = payload.check_suite as Record<string, unknown> | undefined;
    const conclusion =
      checkRun?.conclusion ?? checkSuite?.conclusion ?? payload.action ?? "updated";
    return {
      id: `github-${deliveryId}-check`,
      type: "构建",
      label: `GitHub Check · ${String(conclusion)}`,
      url: getHtmlUrl(checkRun) || getHtmlUrl(checkSuite),
    };
  }

  return null;
}

function collectSearchableText(eventName: string, payload: GitHubPayload) {
  const values: string[] = [eventName];

  if (eventName === "pull_request" || eventName === "pull_request_review") {
    const pullRequest = payload.pull_request as Record<string, unknown> | undefined;
    values.push(
      String(pullRequest?.title ?? ""),
      String(pullRequest?.body ?? ""),
      getNestedString(pullRequest, "head", "ref"),
    );
  }

  if (eventName === "push") {
    if (typeof payload.ref === "string") {
      values.push(payload.ref);
    }
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    commits.forEach((commit) => {
      if (typeof commit === "object" && commit) {
        const entry = commit as Record<string, unknown>;
        values.push(String(entry.message ?? ""), String(entry.url ?? ""));
      }
    });
  }

  if (eventName === "check_run") {
    const checkRun = payload.check_run as Record<string, unknown> | undefined;
    values.push(String(checkRun?.name ?? ""), String(checkRun?.details_url ?? ""));
    const pullRequests = Array.isArray(checkRun?.pull_requests)
      ? checkRun?.pull_requests
      : [];
    pullRequests.forEach((pullRequest) => {
      if (typeof pullRequest === "object" && pullRequest) {
        values.push(String((pullRequest as Record<string, unknown>).url ?? ""));
      }
    });
  }

  return values.join("\n");
}

function findMatchedTaskIds(text: string, state: ProjectState) {
  return state.tasks
    .filter((task) => {
      const escapedTaskId = escapeRegExp(task.id);
      const patterns = [
        new RegExp(`\\bTASK[-_:#\\s]*${escapedTaskId}\\b`, "i"),
        new RegExp(`\\b任务[-_:#\\s]*${escapedTaskId}\\b`, "i"),
        new RegExp(`\\[${escapedTaskId}\\]`, "i"),
      ];

      return patterns.some((pattern) => pattern.test(text));
    })
    .map((task) => task.id);
}

function getEvidenceStrength(type: TaskEvidence["type"]) {
  if (type === "PR" || type === "构建" || type === "评审") {
    return 0.9;
  }

  if (type === "Commit") {
    return 0.75;
  }

  return 0.6;
}

function getHtmlUrl(value?: Record<string, unknown>) {
  return typeof value?.html_url === "string" ? value.html_url : "";
}

function getNestedString(value: Record<string, unknown> | undefined, key: string, childKey: string) {
  const child = value?.[key];
  if (!child || typeof child !== "object") {
    return "";
  }

  const nested = child as Record<string, unknown>;
  return typeof nested[childKey] === "string" ? nested[childKey] : "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
