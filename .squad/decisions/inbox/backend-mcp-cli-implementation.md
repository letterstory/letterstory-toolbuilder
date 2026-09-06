### 2026-09-05: MCP/API/CLI parity implementation for toolbuilder
**By:** Backend
**What:** Implemented shared contracts, surface adapters, MCP registry/dispatch/route, and an MCP-backed CLI for the seven existing public capabilities without changing existing REST response bodies or status-code behavior.
**Why:** Lead's parity plan called for one shared control plane so REST, MCP, and CLI can expose the same capability set without surface drift.

Files added/changed:
- Added `src/lib/contracts/{health,brand,tools}.ts`
- Added `src/lib/surfaces/{health,brand,tools}.ts`
- Added `src/lib/rate-limit/rules.ts`
- Added `src/lib/mcp/{registry,dispatch}.ts`
- Added `src/app/api/mcp/route.ts`
- Added `cli/{toolbuilder.mjs,client.mjs,README.md}`
- Added `cli/commands/{health,brand,tools}.mjs`
- Refactored existing REST routes under `src/app/api/{health,brand,tools}/**` to call the shared surfaces
- Updated `package.json` / `package-lock.json` to add `zod`, a `cli` script, and a root `bin` entry
- Updated route tests to mock the new shared surfaces
- Added MCP route tests and a small CLI helper regression test

Dependency changes:
- Added runtime dependency: `zod`

How to run the CLI:
- `npm run cli -- health`
- `npm run cli -- brand ingest --site-url https://stripe.com`
- `npm run cli -- brand validate --site-url https://stripe.com --profile-file brand-profile.json`
- `npm run cli -- tools list`
- `npm run cli -- tools get <tool-id>`
- `npm run cli -- tools generate --prompt "BMI calculator" --project-name "BMI Calculator" --site-url https://gymshark.com`
- `npm run cli -- tools rollback <tool-id> --version 1`
- `npm run cli -- tools show generate_tool`
- `npm run cli -- tools call generate_tool --json '{"prompt":"BMI calculator"}'`
- Override target with `TOOLBUILDER_API_URL` or `--url`

Deviations from Lead's plan:
- No parity-check script was added in this pass because the request explicitly scoped Backend handoff steps 1 and 2.
- Because curated `toolbuilder tools list` already maps to the existing generated-tools capability, generic MCP registry listing lives behind `toolbuilder tools list --registry`; `tools show` and `tools call` are the generic escape hatch commands.

Verification commands used:
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run dev` (background for smoke only, then stopped)
- `node cli/toolbuilder.mjs health`
- `node cli/toolbuilder.mjs tools list`
- `node cli/toolbuilder.mjs tools show get_health`

Verification summary:
- `npm run typecheck` passed.
- `npm test` passed: 14 test files, 117 tests.
- `npm run build` passed and included `/api/mcp` in the app routes output.
- Manual CLI smoke against a local `next dev` server passed for `health`, `tools list`, and `tools show get_health`.
