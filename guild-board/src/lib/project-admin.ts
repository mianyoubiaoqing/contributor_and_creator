import { getCloudConfig } from "@/lib/cloud-config";
import type {
  CloudProjectMember,
  ProjectAccessLevel,
  ProjectInvite,
} from "@/lib/types";

export type CreateInvitePayload = {
  label: string;
  defaultAccessLevel: ProjectAccessLevel;
  requireApproval: boolean;
  maxUses: number | null;
  expiresAt: string | null;
};

export async function listCloudMembers(accessToken?: string) {
  const response = await fetchWithAuthFallback(apiUrl("/api/members"), {
    headers: getAuthHeaders(accessToken),
  }, accessToken);
  const payload = await parseResponse<{ members: CloudProjectMember[] }>(response);
  return payload.members;
}

export async function updateCloudMember(
  userId: string,
  patch: {
    accessLevel?: ProjectAccessLevel;
    approvalStatus?: "approved" | "pending";
  },
  accessToken?: string,
) {
  const response = await fetchWithAuthFallback(apiUrl("/api/members"), {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...getAuthHeaders(accessToken),
    },
    body: JSON.stringify({ userId, ...patch }),
  }, accessToken);
  await parseResponse<{ ok: boolean }>(response);
}

export async function listProjectInvites(accessToken?: string) {
  const response = await fetchWithAuthFallback(
    apiUrl("/api/invites"),
    {
      headers: getAuthHeaders(accessToken),
    },
    accessToken,
  );
  const payload = await parseResponse<{ invites: ProjectInvite[] }>(response);
  return payload.invites;
}

export async function createProjectInvite(
  payload: CreateInvitePayload,
  accessToken?: string,
) {
  const response = await fetchWithAuthFallback(apiUrl("/api/invites"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...getAuthHeaders(accessToken),
    },
    body: JSON.stringify(payload),
  }, accessToken);
  const result = await parseResponse<{ invite: ProjectInvite }>(response);
  return result.invite;
}

export async function claimProjectInvite(
  inviteCode: string,
  displayName: string,
  accessToken?: string,
) {
  const response = await fetch(apiUrl("/api/invites/claim"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...getAuthHeaders(accessToken),
    },
    body: JSON.stringify({ inviteCode, displayName }),
  });
  return parseResponse<{
    ok: boolean;
    projectKey: string;
    approvalStatus: "approved" | "pending";
  }>(response);
}

function apiUrl(path: string) {
  const config = getCloudConfig();
  return `${path}?projectKey=${encodeURIComponent(config.projectKey)}`;
}

function getAuthHeaders(accessToken?: string) {
  const config = getCloudConfig();
  const headers: Record<string, string> = {};

  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
    return headers;
  }

  if (config.clientSyncToken) {
    headers["x-guild-board-token"] = config.clientSyncToken;
  }

  return headers;
}

async function fetchWithAuthFallback(
  url: string,
  init: RequestInit,
  accessToken?: string,
) {
  const config = getCloudConfig();
  const response = await fetch(url, init);

  if (
    response.ok ||
    !accessToken ||
    !config.clientSyncToken ||
    ![401, 403, 500].includes(response.status)
  ) {
    return response;
  }

  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      authorization: "",
      "x-guild-board-token": config.clientSyncToken,
    },
  });
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error ?? text ?? "Request failed");
  }

  return payload as T;
}
