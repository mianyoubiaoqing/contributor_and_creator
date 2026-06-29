import { getCloudConfig } from "@/lib/cloud-config";
import type { ProjectState } from "@/lib/types";

export type PersistenceStatus = {
  mode: "local" | "cloud";
  state: "idle" | "loading" | "saved" | "error";
  message: string;
};

export const localStorageKey = "guild-board-mvp-state";

export async function loadProjectState(
  fallback: ProjectState,
  accessToken?: string,
): Promise<{
  state: ProjectState;
  status: PersistenceStatus;
}> {
  const config = getCloudConfig();

  if (config.mode === "cloud" && (config.clientSyncToken || accessToken)) {
    try {
      const response = await fetch(
        `/api/state?projectKey=${encodeURIComponent(config.projectKey)}`,
        {
          headers: getAuthHeaders(config.clientSyncToken, accessToken),
        },
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as {
        state: ProjectState;
        mode: "local" | "cloud";
      };

      return {
        state: payload.state,
        status: {
          mode: payload.mode,
          state: "saved",
          message:
            payload.mode === "cloud"
              ? accessToken
                ? "云端同步已连接：账号权限"
                : "云端同步已连接：共享令牌"
              : "服务器未配置 Supabase，使用本地模式",
        },
      };
    } catch (error) {
      const localState = loadLocalState(fallback);
      return {
        state: localState,
        status: {
          mode: "local",
          state: "error",
          message:
            error instanceof Error
              ? `云端读取失败，已回落本地：${error.message}`
              : "云端读取失败，已回落本地",
        },
      };
    }
  }

  return {
    state: loadLocalState(fallback),
    status: {
      mode: "local",
      state: "saved",
      message: "本地模式：数据保存在当前浏览器",
    },
  };
}

export async function saveProjectState(
  state: ProjectState,
  accessToken?: string,
): Promise<PersistenceStatus> {
  const config = getCloudConfig();

  if (config.mode === "cloud" && (config.clientSyncToken || accessToken)) {
    try {
      const response = await fetch(
        `/api/state?projectKey=${encodeURIComponent(config.projectKey)}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            ...getAuthHeaders(config.clientSyncToken, accessToken),
          },
          body: JSON.stringify({ state }),
        },
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return {
        mode: "cloud",
        state: "saved",
        message: "云端已保存",
      };
    } catch (error) {
      saveLocalState(state);
      return {
        mode: "local",
        state: "error",
        message:
          error instanceof Error
            ? `云端保存失败，已保存到本地：${error.message}`
            : "云端保存失败，已保存到本地",
      };
    }
  }

  saveLocalState(state);
  return {
    mode: "local",
    state: "saved",
    message: "本地已保存",
  };
}

function getAuthHeaders(sharedToken?: string, accessToken?: string) {
  const headers: Record<string, string> = {};

  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
    return headers;
  }

  if (sharedToken) {
    headers["x-guild-board-token"] = sharedToken;
  }

  return headers;
}

export function clearLocalState() {
  window.localStorage.removeItem(localStorageKey);
}

function loadLocalState(fallback: ProjectState) {
  const savedState = window.localStorage.getItem(localStorageKey);
  if (!savedState) {
    return fallback;
  }

  try {
    return JSON.parse(savedState) as ProjectState;
  } catch {
    return fallback;
  }
}

function saveLocalState(state: ProjectState) {
  window.localStorage.setItem(localStorageKey, JSON.stringify(state));
}
