# Phone Intelligence API

A sellable API that exposes an offline, heuristic phone-number intelligence tool (line type, carrier, geolocation, fraud score, spam/DNC/reassigned checks) behind an API-key system, with an admin endpoint to issue/revoke keys.

## Run & Operate

Workflows are managed automatically. Two services run concurrently:
- **API Server** (`artifacts/api-server: API Server`) — Express API on port 8080, path `/api`
- **Dashboard** (`artifacts/dashboard: web`) — React admin UI on port 23183, path `/`

Manual commands:
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pip install phonenumbers requests` — install Python deps for the phone tool (required on fresh envs)

Required env/secrets:
- `DATABASE_URL` — Postgres connection string (runtime-managed by Replit)
- `ADMIN_API_SECRET` — secret required in `X-Admin-Secret` header to manage API keys (set as Replit Secret)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Phone intelligence: offline Python CLI (`phone-tool/phone_tool.py`, uses `phonenumbers` + local heuristic lists), invoked as a subprocess from the API server

## Where things live

- `phone-tool/phone_tool.py` — offline CLI doing the actual phone-number analysis (heuristics only, no live carrier API). Supports `--quiet` for single-line JSON machine output.
- `artifacts/api-server/src/lib/phoneLookup.ts` — spawns `phone_tool.py --quiet` as a subprocess and parses its JSON output.
- `artifacts/api-server/src/middleware/apiKey.ts` — `requireApiKey` (checks `X-API-Key` against `api_keys` table, tracks usage) and `requireAdminSecret` (checks `X-Admin-Secret` against `ADMIN_API_SECRET`).
- `artifacts/api-server/src/routes/phone.ts` — `GET /phone/lookup?number=...` (requires API key).
- `artifacts/api-server/src/routes/admin.ts` — `POST /admin/keys`, `GET /admin/keys`, `POST /admin/keys/:id/revoke` (require admin secret).
- `lib/db/src/schema/api-keys.ts` — `apiKeysTable` (id, key, label, active, requestCount, createdAt, lastUsedAt).
- `lib/api-spec/openapi.yaml` — source of truth for the API contract; run codegen after editing.

## Architecture decisions

- No third-party carrier lookup provider (e.g. Twilio) — results are heuristic/offline only, by explicit user choice, to keep the tool free to run. Responses are honest about this: no field claims carrier-verified accuracy.
- Billing/monetization is handled by the user outside this app — the app only provides the working API + API key issuance/revocation, no Stripe/Whop integration.
- API keys are revoked (soft-deleted via `active: false`), never hard-deleted, to preserve usage history.

## Product

- Customers call `GET /api/phone/lookup?number=<e164>` with an `X-API-Key` header to get a JSON phone-intelligence report (validity, country, carrier, line type, fraud score, spam/voip/prepaid/active/reassigned/dnc flags, city, region).
- The owner manages API keys via `X-Admin-Secret`-protected endpoints: create, list, revoke.

## User preferences

- Keep the phone tool 100% free/offline — no paid live-lookup providers.
- Handle billing/payment collection outside of this app; do not add Stripe/Whop.

## Gotchas

- The phone lookup route shells out to Python (`phone_tool.py --quiet`) — `python3` and its pip deps (`phonenumbers`, `requests`) must be available in the runtime environment.
- Always run `pnpm --filter @workspace/api-spec run codegen` after editing `lib/api-spec/openapi.yaml` — generated Zod validators are named per-operation (e.g. `PhoneLookupResponse`, `CreateApiKeyBody`), not by the OpenAPI component schema name.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
