import { Router, type IRouter } from "express";
import { requireApiKey } from "../middleware/apiKey";
import {
  lookupPhoneNumber,
  batchLookupPhoneNumbers,
  getDataSources,
  PhoneLookupError,
} from "../lib/phoneLookup";

const router: IRouter = Router();

// GET /api/phone/lookup
router.get("/phone/lookup", requireApiKey, async (req, res) => {
  const number = req.query.number;

  if (!number || typeof number !== "string") {
    res.status(400).json({ error: "Missing required 'number' query parameter" });
    return;
  }

  try {
    const data = await lookupPhoneNumber(number);
    res.json(data);
  } catch (err) {
    if (err instanceof PhoneLookupError) {
      req.log.warn({ err, number }, "phone lookup failed");
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err, number }, "unexpected error during phone lookup");
    res.status(500).json({ error: "Internal error performing phone lookup" });
  }
});

// POST /api/phone/batch
router.post("/phone/batch", requireApiKey, async (req, res) => {
  const body = req.body as { numbers?: unknown };

  if (!body || !Array.isArray(body.numbers)) {
    res.status(400).json({ error: "Request body must include a 'numbers' array" });
    return;
  }

  const numbers = body.numbers as unknown[];

  if (numbers.length === 0) {
    res.status(400).json({ error: "'numbers' array must not be empty" });
    return;
  }

  if (numbers.length > 100) {
    res.status(400).json({ error: "'numbers' array must not exceed 100 entries" });
    return;
  }

  const invalid = numbers.filter((n) => typeof n !== "string");
  if (invalid.length > 0) {
    res.status(400).json({ error: "All entries in 'numbers' must be strings" });
    return;
  }

  try {
    const result = await batchLookupPhoneNumbers(numbers as string[]);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "unexpected error during batch lookup");
    res.status(500).json({ error: "Internal error performing batch lookup" });
  }
});

// GET /api/phone/sources
router.get("/phone/sources", async (_req, res) => {
  try {
    const sources = await getDataSources();
    res.json(sources);
  } catch (err) {
    res.status(500).json({ error: "Could not retrieve data source status" });
  }
});

export default router;
