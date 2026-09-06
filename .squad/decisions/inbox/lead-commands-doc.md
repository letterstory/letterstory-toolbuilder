### 2026-09-05: Root command index for REST, MCP, and CLI
**By:** Lead
**What:** Added `COMMANDS.md` at the repo root as the cross-surface index for the seven parity capabilities (health, brand ingest, brand validate, tools list/get/generate/rollback), plus MCP discovery (`GET /api/mcp`, JSON-RPC `tools/list`) and CLI host-override guidance. Also added a small pointer to `COMMANDS.md` from `README.md`.
**Why:** Mir asked for one root-level reference that documents the real current command surface across REST, MCP, and CLI. Accuracy was cross-checked against `src/lib/mcp/registry.ts`, `src/app/api/**`, `cli/toolbuilder.mjs`, `cli/client.mjs`, `cli/commands/*.mjs`, and the Zod contracts under `src/lib/contracts/*.ts`.
