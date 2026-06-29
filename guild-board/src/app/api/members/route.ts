import { NextRequest, NextResponse } from "next/server";
import {
  authorizeProjectRequest,
  isNextResponse,
} from "@/lib/auth/server";
import type { CloudProjectMember, ProjectAccessLevel } from "@/lib/types";

const accessLevels: ProjectAccessLevel[] = [
  "owner",
  "planner",
  "reviewer",
  "member",
  "viewer",
];

export async function GET(request: NextRequest) {
  const authResult = await authorizeProjectRequest(request, {
    allowSharedToken: true,
  });

  if (isNextResponse(authResult)) {
    return authResult;
  }

  const { data, error } = await authResult.supabase
    .from("mvp_project_members")
    .select("project_key,user_id,email,display_name,access_level,approval_status,created_at")
    .eq("project_key", authResult.projectKey)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    members: (data ?? []).map(mapMemberRow),
  });
}

export async function PATCH(request: NextRequest) {
  const authResult = await authorizeProjectRequest(request, {
    allowSharedToken: true,
    requiredAccess: ["owner", "planner"],
  });

  if (isNextResponse(authResult)) {
    return authResult;
  }

  const body = (await request.json()) as {
    userId?: string;
    accessLevel?: ProjectAccessLevel;
    approvalStatus?: "approved" | "pending";
  };

  if (!body.userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const patch: Record<string, string> = {};
  if (body.accessLevel && accessLevels.includes(body.accessLevel)) {
    patch.access_level = body.accessLevel;
  }
  if (body.approvalStatus && ["approved", "pending"].includes(body.approvalStatus)) {
    patch.approval_status = body.approvalStatus;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid update fields." }, { status: 400 });
  }

  const { error } = await authResult.supabase
    .from("mvp_project_members")
    .update(patch)
    .eq("project_key", authResult.projectKey)
    .eq("user_id", body.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function mapMemberRow(row: Record<string, unknown>): CloudProjectMember {
  return {
    projectKey: String(row.project_key),
    userId: String(row.user_id),
    email: row.email === null ? null : String(row.email),
    displayName: row.display_name === null ? null : String(row.display_name),
    accessLevel: row.access_level as ProjectAccessLevel,
    approvalStatus: row.approval_status as "approved" | "pending",
    createdAt: String(row.created_at),
  };
}

