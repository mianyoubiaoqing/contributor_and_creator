import { NextRequest, NextResponse } from "next/server";
import {
  authorizeProjectRequest,
  isNextResponse,
} from "@/lib/auth/server";
import type { ProjectAccessLevel, ProjectInvite } from "@/lib/types";

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
    requiredAccess: ["owner", "planner", "reviewer"],
  });

  if (isNextResponse(authResult)) {
    return authResult;
  }

  const { data, error } = await authResult.supabase
    .from("mvp_project_invites")
    .select(
      "id,project_key,invite_code,label,default_access_level,require_approval,max_uses,uses_count,expires_at,is_active,created_at",
    )
    .eq("project_key", authResult.projectKey)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    invites: (data ?? []).map(mapInviteRow),
  });
}

export async function POST(request: NextRequest) {
  const authResult = await authorizeProjectRequest(request, {
    allowSharedToken: true,
    requiredAccess: ["owner", "planner"],
  });

  if (isNextResponse(authResult)) {
    return authResult;
  }

  const body = (await request.json()) as {
    label?: string;
    defaultAccessLevel?: ProjectAccessLevel;
    requireApproval?: boolean;
    maxUses?: number | null;
    expiresAt?: string | null;
  };

  const defaultAccessLevel = accessLevels.includes(body.defaultAccessLevel ?? "member")
    ? body.defaultAccessLevel ?? "member"
    : "member";

  const inviteCode = createInviteCode();
  const { data, error } = await authResult.supabase
    .from("mvp_project_invites")
    .insert({
      project_key: authResult.projectKey,
      invite_code: inviteCode,
      label: body.label?.trim() || "项目邀请",
      default_access_level: defaultAccessLevel,
      require_approval: Boolean(body.requireApproval),
      max_uses: body.maxUses ?? null,
      expires_at: body.expiresAt || null,
      created_by: authResult.user?.id ?? null,
    })
    .select(
      "id,project_key,invite_code,label,default_access_level,require_approval,max_uses,uses_count,expires_at,is_active,created_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ invite: mapInviteRow(data) }, { status: 201 });
}

function createInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunks = [0, 1, 2].map(() =>
    Array.from({ length: 4 }, () =>
      alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join(""),
  );

  return chunks.join("-");
}

function mapInviteRow(row: Record<string, unknown>): ProjectInvite {
  return {
    id: String(row.id),
    projectKey: String(row.project_key),
    inviteCode: String(row.invite_code),
    label: String(row.label),
    defaultAccessLevel: row.default_access_level as ProjectAccessLevel,
    requireApproval: Boolean(row.require_approval),
    maxUses: row.max_uses === null ? null : Number(row.max_uses),
    usesCount: Number(row.uses_count),
    expiresAt: row.expires_at === null ? null : String(row.expires_at),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
  };
}

