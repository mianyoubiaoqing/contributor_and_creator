import { NextRequest, NextResponse } from "next/server";
import { getProjectKey } from "@/lib/auth/server";
import { isServerCloudConfigured } from "@/lib/cloud-config";
import {
  applyGitHubEvidenceToState,
  getGitHubAction,
  getGitHubRepositoryFullName,
  getSenderLogin,
  verifyGitHubSignature,
} from "@/lib/github/webhook";
import { initialState } from "@/lib/sample-data";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ProjectState } from "@/lib/types";

const projectStateTable = "mvp_project_states";
const githubEventsTable = "github_events";

export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "GITHUB_WEBHOOK_SECRET is not configured." },
      { status: 503 },
    );
  }

  if (!isServerCloudConfigured()) {
    return NextResponse.json(
      { error: "Supabase cloud sync is required for GitHub webhooks." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyGitHubSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid GitHub webhook signature." }, { status: 401 });
  }

  const eventName = request.headers.get("x-github-event") ?? "unknown";
  const deliveryId = request.headers.get("x-github-delivery") ?? crypto.randomUUID();
  const projectKey = getProjectKey(request);
  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase client is unavailable." }, { status: 500 });
  }

  const eventInsert = await supabase.from(githubEventsTable).upsert(
    {
      project_key: projectKey,
      delivery_id: deliveryId,
      event_name: eventName,
      action: getGitHubAction(payload),
      repository_full_name: getGitHubRepositoryFullName(payload),
      sender_login: getSenderLogin(payload),
      payload,
    },
    { onConflict: "project_key,delivery_id" },
  );

  if (eventInsert.error) {
    return NextResponse.json(
      {
        error: eventInsert.error.message,
        hint: "Run docs/github-webhook.sql in Supabase SQL Editor.",
      },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from(projectStateTable)
    .select("state")
    .eq("project_key", projectKey)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const currentState = (data?.state as ProjectState | undefined) ?? initialState;
  const result = applyGitHubEvidenceToState(
    currentState,
    eventName,
    deliveryId,
    payload,
  );

  if (result.evidenceCount > 0) {
    const { error: updateError } = await supabase.from(projectStateTable).upsert(
      {
        project_key: projectKey,
        state: result.state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_key" },
    );

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    eventName,
    deliveryId,
    matchedTaskIds: result.matchedTaskIds,
    evidenceCount: result.evidenceCount,
  });
}

