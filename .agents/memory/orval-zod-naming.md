---
name: Orval zod schema naming
description: How to find the right runtime validator name after Orval codegen from an OpenAPI spec (this repo's setup).
---

In this repo's Orval setup, the generated `zod` output (e.g. `lib/api-zod/src/generated/api.ts`) does NOT export
runtime validators under the OpenAPI component schema names (`components.schemas.<Name>`). Instead each operation
gets its own zod object(s) named from the operation, e.g. for an operation `GET /phone/lookup` returning
`PhoneLookupResult`, the actual exported zod validator is `PhoneLookupResponse` (and `PhoneLookupQueryParams` for
its query params). A request body schema like `CreateApiKeyRequest` becomes `CreateApiKeyBody`.

The plain TypeScript `interface` with the component schema's exact name (e.g. `PhoneLookupResult`) DOES get
generated in `lib/api-zod/src/generated/types/`, but it's type-only — importing it and calling `.parse()` on it
fails with "only refers to a type, but is being used as a value".

**Why:** cost real debugging time assuming the zod schema would share the OpenAPI component name; it doesn't.

**How to apply:** after running `pnpm --filter @workspace/api-spec run codegen`, grep
`lib/api-zod/src/generated/api.ts` for `export const` to find the actual runtime validator names before wiring
up route handlers, rather than assuming a name from the spec.
