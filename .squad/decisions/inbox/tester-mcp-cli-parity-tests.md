### 2026-09-05: MCP parity test scaffolding added ahead of Backend
**By:** Tester
**What:** Added proactive parity scaffolding for Backend's planned MCP/API/CLI work: `scripts/parity-check.ts`, `tests/unit/mcp-route.test.ts`, and `tests/unit/cli-mcp-parity.test.ts`, plus a root `package.json` script entry for `parity:check`.
**Why:** Lead's parity plan already fixes the target tool names and CLI surface, so testing can move ahead without touching Backend-owned `src/app/api/**` or `src/lib/**` files. The route tests are intentionally skipped until `src/app/api/mcp/route.ts` and `src/lib/mcp/registry.ts` land, while the CLI mapping test already locks the expected seven command↔tool mappings. Backend may still need small follow-up adjustments if its final JSON-RPC response shape or CLI file layout differs from the plan.

### 2026-09-05: MCP parity verification passed against Backend's landed implementation
**By:** Tester
**What:** Re-ran the proactive parity work against Backend's shipped files and made the expected small alignment updates: `scripts/parity-check.ts` now recognizes Backend's `MCP_TOOL_REGISTRY` export, and `tests/unit/cli-mcp-parity.test.ts` now explicitly asserts the intentional CLI split between curated `toolbuilder tools list` → `list_generated_tools` and generic registry discovery via `toolbuilder tools list --registry`.
**Why:** Backend's final layout matched Lead's plan closely, but the registry export name differed from my initial assumption and the generic registry listing needed to be treated as an escape hatch rather than a curated capability mapping. Final verification status:
- `node --import tsx scripts/parity-check.ts` ✅
- `npx vitest run tests/unit/mcp-route.test.ts tests/unit/cli-mcp-parity.test.ts` ✅
- `npm test` ✅ (14 files, 118 tests)

Remaining issues: no parity failures remain. Only the existing Vitest/Vite CJS deprecation warning still prints during test runs; it is unrelated to MCP parity and did not cause failures.

### 2026-09-05: Restored missing npm parity script after Backend package.json merge drift
**By:** Tester
**What:** Re-checked the live root `package.json`, found that the `"parity:check"` script entry had been lost after later package.json edits, restored `"parity:check": "node --import tsx scripts/parity-check.ts"`, and re-verified both `npm run parity:check` and `npm test`.
**Why:** The underlying parity script was already correct, but npm invocation had drifted from the intended CI/ergonomic entrypoint. Final fix verification:
- `npm run parity:check` ✅
- `npm test` ✅
