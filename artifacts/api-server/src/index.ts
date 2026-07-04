import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { apiKeysTable } from "@workspace/db/schema";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Auto-generate ADMIN_API_SECRET if not set ─────────────────────────────
const SECRET_FILE = path.resolve(process.cwd(), ".admin_secret");

function loadOrGenerateAdminSecret(): string {
  // 1. Prefer explicit env var (set in production / Replit secrets)
  if (process.env["ADMIN_API_SECRET"]) {
    return process.env["ADMIN_API_SECRET"];
  }

  // 2. Persist across restarts using a local file
  try {
    if (fs.existsSync(SECRET_FILE)) {
      const stored = fs.readFileSync(SECRET_FILE, "utf8").trim();
      if (stored) {
        process.env["ADMIN_API_SECRET"] = stored;
        return stored;
      }
    }
  } catch { /* ignore read errors */ }

  // 3. Generate fresh secret, write it to the file
  const generated = `secret_${crypto.randomBytes(20).toString("hex")}`;
  try {
    fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  } catch { /* ignore write errors — secret still works in-process */ }

  process.env["ADMIN_API_SECRET"] = generated;
  return generated;
}

const adminSecret = loadOrGenerateAdminSecret();

// ── Auto-create a default API key on first run ────────────────────────────
async function bootstrap() {
  try {
    const existing = await db.select().from(apiKeysTable).limit(1);
    if (existing.length === 0) {
      const defaultKey = `pk_${crypto.randomBytes(24).toString("hex")}`;
      await db.insert(apiKeysTable).values({ key: defaultKey, label: "Default Key" });
      logger.info({ key: defaultKey }, "╔══════════════════════════════════════╗");
      logger.info({}, "║  FIRST RUN — credentials generated   ║");
      logger.info({ adminSecret }, "║  Admin Secret (copy this!)           ║");
      logger.info({ defaultKey }, "║  Default API Key                     ║");
      logger.info({}, "╚══════════════════════════════════════╝");
    }
  } catch (err) {
    logger.warn({ err }, "bootstrap: could not auto-create default API key");
  }
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info(
    { port, adminSecret },
    "Server listening — ADMIN_API_SECRET shown above (copy for dashboard login)"
  );

  await bootstrap();
});
