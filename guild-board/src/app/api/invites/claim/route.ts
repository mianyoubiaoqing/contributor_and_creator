import { NextRequest, NextResponse } from "next/server";
import {
  authorizeAuthenticatedRequest,
  isNextResponse,
} from "@/lib/auth/server";

export async function POST(request: NextRequest) {
  const authResult = await authorizeAuthenticatedRequest(request);

  if (isNextResponse(authResult)) {
    return authResult;
  }

  const body = (await request.json()) as {
    inviteCode?: string;
    displayName?: string;
  };
  const inviteCode = normalizeInviteCode(body.inviteCode ?? "");

  if (!inviteCode) {
    return NextResponse.json({ error: "Invite code is required." }, { status: 400 });
  }

  const { data: invite, error: inviteError } = await authResult.supabase
    .from("mvp_project_invites")
    .select(
      "id,project_key,invite_code,label,default_access_level,require_approval,max_uses,uses_count,expires_at,is_active",
    )
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  if (!invite) {
    return NextResponse.json({ error: "Invite code not found." }, { status: 404 });
  }

  if (!invite.is_active) {
    return NextResponse.json({ error: "Invite code is inactive." }, { status: 410 });
  }

  if (invite.expires_at && new Date(String(invite.expires_at)).getTime() < Date.now()) {
    return NextResponse.json({ error: "Invite code has expired." }, { status: 410 });
  }

  if (
    invite.max_uses !== null &&
    Number(invite.uses_count) >= Number(invite.max_uses)
  ) {
    return NextResponse.json({ error: "Invite code usage limit reached." }, { status: 410 });
  }

  const approvalStatus = invite.require_approval ? "pending" : "approved";
  const { error: memberError } = await authResult.supabase
    .from("mvp_project_members")
    .upsert(
      {
        project_key: String(invite.project_key),
        user_id: authResult.user.id,
        email: authResult.user.email ?? null,
        display_name:
          body.displayName?.trim() ||
          authResult.user.user_metadata?.name ||
          authResult.user.email ||
          null,
        access_level: invite.default_access_level,
        approval_status: approvalStatus,
      },
      { onConflict: "project_key,user_id" },
    );

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  const { error: updateError } = await authResult.supabase
    .from("mvp_project_invites")
    .update({ uses_count: Number(invite.uses_count) + 1 })
    .eq("id", invite.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    projectKey: invite.project_key,
    approvalStatus,
  });
}

function normalizeInviteCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

