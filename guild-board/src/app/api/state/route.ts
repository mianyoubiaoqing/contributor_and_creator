import { NextRequest, NextResponse } from "next/server";
import {
  authorizeProjectRequest,
  getProjectKey,
  isNextResponse,
} from "@/lib/auth/server";
import { isServerCloudConfigured } from "@/lib/cloud-config";
import { initialState } from "@/lib/sample-data";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ProjectState } from "@/lib/types";

const tableName = "mvp_project_states";

export async function GET(request: NextRequest) {
  if (!isServerCloudConfigured()) {
    return NextResponse.json(
      {
        mode: "local",
        state: initialState,
        message: "Supabase is not configured. The app should use local storage.",
      },
      { status: 200 },
    );
  }

  const projectKey = getProjectKey(request);
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase client is unavailable." }, { status: 500 });
  }

  const authResult = await authorizeProjectRequest(request, {
    allowSharedToken: true,
  });
  if (isNextResponse(authResult)) {
    return authResult;
  }

  const { data, error } = await supabase
    .from(tableName)
    .select("state, updated_at")
    .eq("project_key", projectKey)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    const state = initialState;
    const { error: insertError } = await supabase.from(tableName).insert({
      project_key: projectKey,
      state,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ mode: "cloud", state, updatedAt: null });
  }

  return NextResponse.json({
    mode: "cloud",
    state: data.state as ProjectState,
    updatedAt: data.updated_at as string,
  });
}

export async function PUT(request: NextRequest) {
  if (!isServerCloudConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured. Cloud sync is disabled." },
      { status: 503 },
    );
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase client is unavailable." }, { status: 500 });
  }

  const projectKey = getProjectKey(request);
  const authResult = await authorizeProjectRequest(request, {
    allowSharedToken: true,
    requiredAccess: ["owner", "planner", "reviewer", "member"],
  });
  if (isNextResponse(authResult)) {
    return authResult;
  }

  const body = (await request.json()) as { state?: ProjectState };
  if (!body.state) {
    return NextResponse.json({ error: "Missing state payload." }, { status: 400 });
  }

  const { error } = await supabase.from(tableName).upsert(
    {
      project_key: projectKey,
      state: body.state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_key" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mode: "cloud" });
}
