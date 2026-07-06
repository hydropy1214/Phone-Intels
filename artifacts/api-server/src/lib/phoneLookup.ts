import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PYTHON_BIN } from "./pythonBin";

// Resolve relative to the *built bundle's* location, not process.cwd().
// process.cwd() differs between dev (artifacts/api-server/) and the systemd
// production service (project root), so __dirname from import.meta.url is the
// only reliable anchor in both environments.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/index.mjs → ../../.. → project root → phone-tool/phone_tool.py
const PHONE_TOOL_PATH = path.resolve(__dirname, "..", "..", "..", "phone-tool", "phone_tool.py");
const TIMEOUT_MS = 30_000;

// ── In-memory result cache ────────────────────────────────────────────────────
// Phone number metadata changes rarely; cache individual lookups for 1 hour.
// This eliminates the Python subprocess cold-start overhead on repeated queries.
const CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour
const MAX_CACHE_SIZE = 10_000;         // ~10 MB max at ~1 KB/result

interface CacheEntry {
  result: PhoneLookupResult;
  expiresAt: number;
}

const lookupCache = new Map<string, CacheEntry>();

function cacheGet(key: string): PhoneLookupResult | null {
  const entry = lookupCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { lookupCache.delete(key); return null; }
  return entry.result;
}

function cacheSet(key: string, result: PhoneLookupResult): void {
  // Evict oldest entry when at capacity (Map preserves insertion order)
  if (lookupCache.size >= MAX_CACHE_SIZE) {
    const oldest = lookupCache.keys().next().value;
    if (oldest !== undefined) lookupCache.delete(oldest);
  }
  lookupCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HlrStatus {
  method: string;
  reachable_estimate: boolean;
  confidence: string;
  signals: string[];
  disclaimer: string;
}

export interface CarrierType {
  type: string;
  confidence: string;
  description: string;
  matched_keyword?: string | null;
}

export interface PortedEstimate {
  method: string;
  ported_estimate: boolean | null;
  confidence: string;
  signals: string[];
  disclaimer: string;
}

export interface RndRisk {
  method: string;
  risk_level: string;
  risk_score?: number | null;
  confidence: string;
  risk_factors: string[];
  disclaimer: string;
}

export interface PhoneLookupResult {
  // Authoritative
  valid: boolean;
  possible: boolean;
  e164: string | null;
  national_format: string | null;
  international_format: string | null;
  line_type: string;
  line_type_source: string;
  voip: boolean;
  carrier: string;
  country: string;
  city: string;
  region: string;
  timezones: string[];

  // NANPA / OCN enrichment (US NANP numbers only)
  ocn: string;
  ocn_name: string;
  ocn_type: string;
  state: string;
  rate_center: string;

  // Heuristic / community
  active: boolean;
  risk_score: number;
  fraud_score: number; // alias for risk_score
  fraud_reasons: string[];
  recent_abuse: boolean;
  spammer: boolean;
  spam: boolean;
  spam_source_count: number;
  spam_sources: string[];
  prepaid: boolean;
  risky: boolean;
  dnc: boolean;
  dnc_source: string;
  dnc_source_count: number;
  pattern_flags: string[];

  // Structured heuristic assessments
  hlr_status: HlrStatus;
  carrier_type: CarrierType;
  ported_estimate: PortedEstimate;
  rnd_risk: RndRisk;

  // Unavailable offline (always null/empty)
  name: string | null;
  associated_emails: string[];
  user_activity: string | null;
  leaked_online: boolean | null;
  reassigned: boolean | null;
}

export interface BatchLookupItem {
  number: string;
  result?: PhoneLookupResult;
  error?: string;
}

export interface BatchLookupResponse {
  results: BatchLookupItem[];
  total: number;
  succeeded: number;
  failed: number;
}

export interface DataSourceStatus {
  id: string;
  label: string;
  url: string;
  filename: string;
  present: boolean;
  size_bytes: number;
  kind: "community" | "government";
  last_downloaded: string | null;
}

export class PhoneLookupError extends Error {}

// ── Subprocess ────────────────────────────────────────────────────────────────

function spawnLookup(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [PHONE_TOOL_PATH, ...args], {
      cwd: path.dirname(PHONE_TOOL_PATH),
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new PhoneLookupError("Phone tool timed out"));
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new PhoneLookupError(`Failed to start phone_tool.py: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new PhoneLookupError(
          `phone_tool.py exited with code ${code}: ${(stderr || stdout).slice(0, 500)}`
        ));
        return;
      }
      resolve(stdout);
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function lookupPhoneNumber(number: string): Promise<PhoneLookupResult> {
  // Normalize key: E.164 lowercase, strip spaces
  const cacheKey = number.trim().replace(/\s+/g, "");
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const stdout = await spawnLookup([number, "--quiet"]);
  const lastLine = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
  try {
    const parsed = JSON.parse(lastLine) as PhoneLookupResult & { error?: string };
    if (parsed.error) {
      throw new PhoneLookupError(parsed.error);
    }
    cacheSet(cacheKey, parsed);
    return parsed;
  } catch (err) {
    if (err instanceof PhoneLookupError) throw err;
    throw new PhoneLookupError(
      `Could not parse phone_tool.py output: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

const BATCH_CONCURRENCY = 10;

export async function batchLookupPhoneNumbers(numbers: string[]): Promise<BatchLookupResponse> {
  const items: BatchLookupItem[] = new Array(numbers.length);

  // Process in bounded windows to avoid spawning hundreds of Python processes at once
  for (let i = 0; i < numbers.length; i += BATCH_CONCURRENCY) {
    const slice = numbers.slice(i, i + BATCH_CONCURRENCY);
    const settled = await Promise.allSettled(
      slice.map(async (num): Promise<BatchLookupItem> => {
        try {
          const result = await lookupPhoneNumber(num);
          return { number: num, result };
        } catch (err) {
          return { number: num, error: err instanceof Error ? err.message : String(err) };
        }
      })
    );
    settled.forEach((r, j) => {
      items[i + j] = r.status === "fulfilled" ? r.value : { number: numbers[i + j]!, error: "Internal error" };
    });
  }

  const succeeded = items.filter((i) => i.result !== undefined).length;
  const failed = items.filter((i) => i.error !== undefined).length;

  return { results: items, total: items.length, succeeded, failed };
}

export async function getDataSources(): Promise<DataSourceStatus[]> {
  const stdout = await spawnLookup(["--sources"]);
  try {
    return JSON.parse(stdout.trim()) as DataSourceStatus[];
  } catch {
    return [];
  }
}
