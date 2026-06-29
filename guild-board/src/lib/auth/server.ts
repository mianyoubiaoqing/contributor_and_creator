import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ProjectAccessLevel } from "@/lib/types";

export type ProjectMembership = {
  project_key: string;
  user_id: string;
  display_name: string | null;
  access_level: ProjectAccessLevel;
  approval_status: "approved" | "pending";
  created_at: string;
};

export type AuthorizedProjectRequest = {
  supabase: SupabaseClient;
  user: User | null;
  membership: ProjectMembership | null;
  projectKey: string;
};

export function getProjectKey(request: NextRequest) {
  return (
    request.nextUrl.searchParams.get("projectKey") ??
    process.env.NEXT_PUBLIC_GUILD_BOARD_PROJECT_KEY ??
    "default-jam-project"
  );
}

export async function authorizeProjectRequest(
  request: NextRequest,
  options?: {
    allowSharedToken?: boolean;
    requiredAccess?: ProjectAccessLevel[];
  },
): Promise<AuthorizedProjectRequest | NextResponse> {
  const projectKey = getProjectKey(request);
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase client is unavailable." }, { status: 500 });
  }

  if (options?.allowSharedToken !== false && hasValidSharedToken(request)) {
    return {
      supabase,
      user: null,
      membership: null,
      projectKey,
    };
  }

  const bearerToken = getBearerToken(request);
  if (!bearerToken) {
    return NextResponse.json(
      { error: "Sign in or provide the shared sync token." },
      { status: 401 },
    );
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(bearerToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid Supabase session." }, { status: 401 });
  }

  const membershipResult = await getProjectMembership(
    supabase,
    projectKey,
    userData.user.id,
  );

  if (membershipResult instanceof NextResponse) {
    return membershipResult;
  }

  if (!membershipResult) {
    return NextResponse.json(
      { error: "Your account is not a member of this project." },
      { status: 403 },
    );
  }

  if (membershipResult.approval_status !== "approved") {
    return NextResponse.json(
      { error: "Your project membership is waiting for approval." },
      { status: 403 },
    );
  }

  if (
    options?.requiredAccess?.length &&
    !options.requiredAccess.includes(membershipResult.access_level)
  ) {
    return NextResponse.json(
      { error: "Your project role cannot perform this action." },
      { status: 403 },
    );
  }

  return {
    supabase,
    user: userData.user,
    membership: membershipResult,
    projectKey,
  };
}

export async function authorizeAuthenticatedRequest(
  request: NextRequest,
): Promise<{ supabase: SupabaseClient; user: User; projectKey: string } | NextResponse> {
  const projectKey = getProjectKey(request);
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase client is unavailable." }, { status: 500 });
  }

  const bearerToken = getBearerToken(request);
  if (!bearerToken) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { data: userData, error } = await supabase.auth.getUser(bearerToken);
  if (error || !userData.user) {
    return NextResponse.json({ error: "Invalid Supabase session." }, { status: 401 });
  }

  return {
    supabase,
    user: userData.user,
    projectKey,
  };
}

export function isNextResponse<T>(
  value: T | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}

async function getProjectMembership(
  supabase: SupabaseClient,
  projectKey: string,
  userId: string,
): Promise<ProjectMembership | null | NextResponse> {
  const { data, error } = await supabase
    .from("mvp_project_members")
    .select("project_key,user_id,display_name,access_level,approval_status,created_at")
    .eq("project_key", projectKey)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error:
          "Project membership check failed. Run docs/supabase-auth-members.sql or use an invite code.",
      },
      { status: 500 },
    );
  }

  return data as ProjectMembership | null;
}

function hasValidSharedToken(request: NextRequest) {
  const expectedToken = process.env.GUILD_BOARD_SYNC_TOKEN;
  const providedToken = request.headers.get("x-guild-board-token");

  return Boolean(expectedToken && providedToken && providedToken === expectedToken);
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

