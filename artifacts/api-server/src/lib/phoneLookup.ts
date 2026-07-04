import { spawn } from "node:child_process";
import path from "node:path";

const PHONE_TOOL_PATH = path.resolve(process.cwd(), "..", "..", "phone-tool", "phone_tool.py");
const PYTHON_BIN = process.env.PHONE_TOOL_PYTHON || "python3";
const TIMEOUT_MS = 30_000;

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

  // Heuristic / community
  active: boolean;
  fraud_score: number;
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
  last_downloaded: string | null;
}

export class PhoneLookupError extends Error {}

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

export async function lookupPhoneNumber(number: string): Promise<PhoneLookupResult> {
  const stdout = await spawnLookup([number, "--quiet"]);
  const lastLine = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
  try {
    const parsed = JSON.parse(lastLine) as PhoneLookupResult & { error?: string };
    if (parsed.error) {
      throw new PhoneLookupError(parsed.error);
    }
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
