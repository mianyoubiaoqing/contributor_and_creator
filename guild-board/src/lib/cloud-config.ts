export type CloudConfig = {
  mode: "local" | "cloud";
  projectKey: string;
  clientSyncToken: string;
  hasPublicSupabaseConfig: boolean;
};

export function getCloudConfig(): CloudConfig {
  const mode =
    process.env.NEXT_PUBLIC_APP_MODE === "cloud" ? "cloud" : "local";

  return {
    mode,
    projectKey:
      process.env.NEXT_PUBLIC_GUILD_BOARD_PROJECT_KEY ?? "default-jam-project",
    clientSyncToken: process.env.NEXT_PUBLIC_GUILD_BOARD_SYNC_TOKEN ?? "",
    hasPublicSupabaseConfig: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}

export function isServerCloudConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.GUILD_BOARD_SYNC_TOKEN,
  );
}

