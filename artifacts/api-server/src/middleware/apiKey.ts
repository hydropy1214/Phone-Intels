import type { NextFunction, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { apiKeysTable } from "@workspace/db/schema";

export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.header("x-api-key");

  if (!key) {
    res.status(401).json({ error: "Missing X-API-Key header" });
    return;
  }

  const [record] = await db.select().from(apiKeysTable).where(eq(apiKeysTable.key, key)).limit(1);

  if (!record || !record.active) {
    res.status(401).json({ error: "Invalid or revoked API key" });
    return;
  }

  db.update(apiKeysTable)
    .set({ requestCount: sql`${apiKeysTable.requestCount} + 1`, lastUsedAt: new Date() })
    .where(eq(apiKeysTable.id, record.id))
    .catch((err) => {
      req.log.error({ err }, "failed to update api key usage stats");
    });

  next();
}

/**
 * Admin auth: requires the X-Admin-Secret header to match the ADMIN_API_SECRET env var.
 * API keys do not grant admin access — admin and customer credentials are separate.
 */
export async function requireAdminSecret(req: Request, res: Response, next: NextFunction) {
  const providedSecret = req.header("x-admin-secret");
  const expectedSecret = process.env.ADMIN_API_SECRET;

  if (providedSecret && expectedSecret && providedSecret === expectedSecret) {
    next();
    return;
  }

  res.status(401).json({ error: "Invalid or missing X-Admin-Secret header" });
}
