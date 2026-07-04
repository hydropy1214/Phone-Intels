import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { apiKeysTable } from "@workspace/db/schema";
import { CreateApiKeyBody } from "@workspace/api-zod";
import { requireAdminSecret } from "../middleware/apiKey";

const router: IRouter = Router();

function generateKey(): string {
  return `pk_${crypto.randomBytes(24).toString("hex")}`;
}

router.post("/admin/keys", requireAdminSecret, async (req, res) => {
  const parsed = CreateApiKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const [created] = await db
    .insert(apiKeysTable)
    .values({ key: generateKey(), label: parsed.data.label })
    .returning();

  res.status(201).json(created);
});

router.get("/admin/keys", requireAdminSecret, async (_req, res) => {
  const keys = await db.select().from(apiKeysTable);
  res.json(keys);
});

router.post("/admin/keys/:id/revoke", requireAdminSecret, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [updated] = await db
    .update(apiKeysTable)
    .set({ active: false })
    .where(eq(apiKeysTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "API key not found" });
    return;
  }

  res.json(updated);
});

export default router;
