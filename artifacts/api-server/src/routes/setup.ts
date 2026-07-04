import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { apiKeysTable } from "@workspace/db/schema";
import crypto from "node:crypto";

const router: IRouter = Router();

/**
 * GET /api/setup
 * Returns non-sensitive bootstrap info (key count only).
 * Does NOT expose the admin secret or API key values.
 */
router.get("/setup", async (_req, res) => {
  // Ensure at least one API key exists on first run
  let keys = await db.select().from(apiKeysTable).limit(10);
  if (keys.length === 0) {
    const defaultKey = `pk_${crypto.randomBytes(24).toString("hex")}`;
    const [created] = await db
      .insert(apiKeysTable)
      .values({ key: defaultKey, label: "Default Key" })
      .returning();
    keys = [created];
  }

  res.json({
    keys_count: keys.length,
  });
});

export default router;
