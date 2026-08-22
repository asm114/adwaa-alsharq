import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const BUCKET = "customer-portal-feedback";
const MAX_CANDIDATES = 500;
const REMOVE_BATCH_SIZE = 100;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing required environment: ${name}`);
  return value;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  let cleanupSecret: string;
  let supabaseUrl: string;
  let serviceRoleKey: string;
  try {
    cleanupSecret = requiredEnvironment("CUSTOMER_PORTAL_CLEANUP_SECRET");
    supabaseUrl = requiredEnvironment("SUPABASE_URL");
    serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  } catch {
    return jsonResponse(503, { error: "cleanup service is not configured" });
  }

  const suppliedSecret = req.headers.get("x-cleanup-secret") ?? "";
  if (!constantTimeEqual(suppliedSecret, cleanupSecret)) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: pruneError } = await supabase.rpc(
    "prune_customer_portal_feedback_rate_limit_events_v2",
  );
  if (pruneError) {
    return jsonResponse(500, { error: "rate telemetry retention failed" });
  }

  const { data: modeRows, error: modeError } = await supabase.rpc(
    "get_customer_portal_feedback_cleanup_mode_v2",
  );
  const mode = Array.isArray(modeRows) ? modeRows[0] : null;
  if (modeError || !mode) {
    return jsonResponse(500, { error: "cleanup mode could not be loaded" });
  }

  const dryRun = mode.dry_run === true || mode.deletion_enabled !== true;
  const { data: candidates, error: candidatesError } = await supabase.rpc(
    dryRun
      ? "list_customer_portal_feedback_orphans_v2"
      : "claim_customer_portal_feedback_orphans_v2",
    { p_limit: MAX_CANDIDATES },
  );
  if (candidatesError || !Array.isArray(candidates)) {
    return jsonResponse(500, { error: "orphan candidates could not be loaded" });
  }

  const paths = candidates
    .map((candidate) => candidate.object_path)
    .filter((path): path is string => typeof path === "string");
  const unclearCount = candidates.filter((candidate) =>
    candidate.reason === "unreserved_older_than_24h" ||
    candidate.reason === "submitted_unreferenced_older_than_24h"
  ).length;

  // The database keeps deletion disabled until a separately approved Cutover.
  // It also forces at least 24 hours of dry-run time from this migration.
  if (dryRun) {
    await supabase.rpc("record_customer_portal_feedback_cleanup_run_v2", {
      p_mode: "dry_run",
      p_candidate_count: paths.length,
      p_deleted_count: 0,
      p_unclear_count: unclearCount,
      p_error_count: 0,
    });

    console.log(JSON.stringify({
      mode: "dry_run",
      candidateCount: paths.length,
      unclearCount,
      deletedCount: 0,
    }));
    return jsonResponse(200, {
      mode: "dry_run",
      candidateCount: paths.length,
      unclearCount,
      deletedCount: 0,
    });
  }

  let deletedCount = 0;
  let errorCount = 0;
  for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(index, index + REMOVE_BATCH_SIZE);
    // Required safety boundary: deletion is performed through the Storage API,
    // never through DELETE on storage.objects.
    const { data, error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) {
      errorCount += batch.length;
      continue;
    }
    deletedCount += Array.isArray(data) ? data.length : 0;
  }

  await supabase.rpc("record_customer_portal_feedback_cleanup_run_v2", {
    p_mode: "delete",
    p_candidate_count: paths.length,
    p_deleted_count: deletedCount,
    p_unclear_count: unclearCount,
    p_error_count: errorCount,
  });

  console.log(JSON.stringify({
    mode: "delete",
    candidateCount: paths.length,
    unclearCount,
    deletedCount,
    errorCount,
  }));
  return jsonResponse(200, {
    mode: "delete",
    candidateCount: paths.length,
    unclearCount,
    deletedCount,
    errorCount,
  });
});
