import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { logger } from "./logger";
import { PYTHON_BIN } from "./pythonBin";

// NOTE: esbuild bundles this file into the same dist/index.mjs as
// phoneLookup.ts, so import.meta.url resolves to that single bundle's
// location at runtime — use the same 3-level-up path as phoneLookup.ts
// (dist/ -> api-server/ -> artifacts/ -> project root), not the source
// tree's nesting depth.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHONE_TOOL_PATH = path.resolve(__dirname, "..", "..", "..", "phone-tool", "phone_tool.py");
const UPDATE_TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes — covers a full FCC backfill

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1_000; // daily

let refreshInFlight = false;
let lastRefreshAt: Date | null = null;
let lastRefreshOk: boolean | null = null;
let lastRefreshError: string | null = null;

export function getRefreshStatus() {
  return {
    in_progress: refreshInFlight,
    last_refresh_at: lastRefreshAt ? lastRefreshAt.toISOString() : null,
    last_refresh_ok: lastRefreshOk,
    last_refresh_error: lastRefreshError,
    interval_hours: REFRESH_INTERVAL_MS / (60 * 60 * 1_000),
  };
}

function runOnce(pythonBin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [PHONE_TOOL_PATH, "--update", "--quiet"], {
      cwd: path.dirname(PHONE_TOOL_PATH),
      shell: false,
    });

    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Data refresh timed out"));
    }, UPDATE_TIMEOUT_MS);

    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`phone_tool.py --update exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve();
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs the update, retrying past transient environment hiccups (e.g. the
 * Nix-store-backed Python binary not yet mounted right after a fresh
 * container boot, which surfaces as a one-off ENOENT). Falls back to a
 * bare "python3" resolved via the shell PATH if the absolute path fails.
 */
async function runUpdate(): Promise<void> {
  const attempts: Array<{ bin: string; delayMs: number }> = [
    { bin: PYTHON_BIN, delayMs: 0 },
    { bin: PYTHON_BIN, delayMs: 4_000 },
    { bin: "python3", delayMs: 4_000 },
  ];

  let lastErr: unknown;
  for (const { bin, delayMs } of attempts) {
    if (delayMs) await sleep(delayMs);
    try {
      await runOnce(bin);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Runs a data refresh (community lists + incremental FCC sync) unless one is
 * already running. Safe to call from a timer, on startup, or from an admin
 * endpoint — overlapping calls are coalesced into a no-op.
 */
export async function triggerDataRefresh(reason: string): Promise<{ started: boolean }> {
  if (refreshInFlight) {
    logger.info({ reason }, "data refresh already in progress — skipping duplicate trigger");
    return { started: false };
  }

  refreshInFlight = true;
  logger.info({ reason }, "starting spam/abuse data refresh (community + FCC)");
  try {
    await runUpdate();
    lastRefreshOk = true;
    lastRefreshError = null;
    logger.info({ reason }, "data refresh completed successfully");
  } catch (err) {
    lastRefreshOk = false;
    lastRefreshError = err instanceof Error ? err.message : String(err);
    logger.warn({ reason, err: lastRefreshError }, "data refresh failed");
  } finally {
    lastRefreshAt = new Date();
    refreshInFlight = false;
  }
  return { started: true };
}

/**
 * Fully automates the data pipeline: refreshes once shortly after startup
 * (so a fresh deployment already has data within seconds/minutes, without
 * any manual `--update` step), then keeps refreshing every 24h forever.
 * The FCC downloader is incremental, so daily runs are cheap and never
 * miss newly filed complaints.
 */
export function startScheduledDataRefresh(): void {
  // Kick off shortly after boot so we don't block server startup on network I/O.
  setTimeout(() => {
    void triggerDataRefresh("startup");
  }, 5_000);

  setInterval(() => {
    void triggerDataRefresh("scheduled-daily");
  }, REFRESH_INTERVAL_MS);

  logger.info(
    { intervalHours: REFRESH_INTERVAL_MS / (60 * 60 * 1_000) },
    "scheduled daily data refresh armed (community lists + incremental FCC sync)"
  );
}
