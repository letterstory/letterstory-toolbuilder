### 2026-09-05: MCP/API/CLI parity plan for letterstory-toolbuilder
**By:** Lead
**What:** Use `letterstory/letterstory` as the primary parity reference and `letterstory/lettertrace` as the secondary transport/auth reference. Implement toolbuilder parity with a single MCP tool registry + dispatch layer, a thin `/api/mcp` adapter, and a thin CLI that talks to the MCP endpoint. Reuse the repo’s existing `src/lib/brand/*`, `src/lib/generation/*`, and `src/lib/platform/*` business logic rather than rebuilding the domain layer.
**Why:** The current repo already has thin REST route handlers and a solid shared lib layer. The missing piece is not domain logic; it is a parity/control plane so MCP and CLI can expose the same capabilities without drift. `letterstory` is the clearest org example of solving that drift explicitly; `lettertrace` confirms the MCP/CLI transport shape and shows when to keep REST/MCP sharing at the service layer.

## 1) Org research findings

### A. Strongest parity pattern: `letterstory/letterstory`

**Why it is the best reference**
- It is the only scanned repo that explicitly treats **MCP parity drift as an architecture problem** and ships a parity-check script to prevent it.
- It exposes:
  - an MCP endpoint,
  - a generic REST dispatcher,
  - curated REST aliases,
  - and a CLI layered over the same MCP surface.

**Concrete file/layout pattern**
- `src/lib/mcp/registry.ts`
  - single-source-of-truth tool manifest (`TOOLS`)
  - tool metadata, zod input schema, zod output schema, capability, handler
- `src/lib/mcp/dispatch.ts`
  - central lookup + authorization + execution
- `src/lib/mcp/rest-adapter.ts`
  - shared REST response shaping from dispatch outcomes
- `src/app/api/mcp/route.ts`
  - MCP JSON-RPC endpoint + unauthenticated discovery `GET`
- `src/app/api/integrations/tools/[name]/route.ts`
  - generic REST equivalent of `tools/call`
- `cli/`
  - publishable CLI package
  - `cli/lib/client.mjs` = thin MCP JSON-RPC client
  - `cli/lib/commands/*.mjs` = curated human-friendly commands wrapping `callTool(...)`
- `scripts/parity-check.ts`
  - checks CLI tool references against the MCP registry
  - also checks schema honesty/drift

**Key libraries / techniques**
- `zod` for input/output schemas
- custom JSON-RPC implementation for `/api/mcp` (no SDK dependency required)
- custom lightweight CLI parser (no commander/yargs)

**How surfaces share logic**
- Best pattern in the org:
  - **tool registry** is authoritative for the MCP surface
  - **dispatch layer** is authoritative for running tools
  - REST adapters and CLI are thin shells over that shared definition
- Result: MCP and generic REST cannot drift on tool name, handler, or schema.

**Build / packaging**
- CLI is a separate `cli/` package with its own `package.json`
- package has `bin` entries and ESM `.mjs` files
- no TS build step required for the CLI itself

**Auth/config**
- MCP + CLI use the same `/api/mcp` endpoint
- CLI stores URL/key config and can print ready-to-paste MCP config
- capability/auth concerns are centralized in dispatch

### B. Secondary pattern: `letterstory/lettertrace`

**Why it matters**
- Confirms a second org-approved pattern for MCP/API/CLI parity:
  - REST and MCP both call the same shared service/data layer
  - CLI uses actual MCP client transport for MCP commands

**Concrete file/layout pattern**
- `app/api/mcp/[transport]/route.ts`
  - MCP server implemented with `mcp-handler`
  - `server.tool(...)` definitions inline
- `app/api/v1/**`
  - REST endpoints
- `lib/data.ts`, `lib/api-service.ts`, `lib/logs.ts`
  - shared business logic consumed by both REST and MCP
- `cli/http.mjs`
  - REST client
- `cli/mcp.mjs`
  - MCP SDK client (`StreamableHTTPClientTransport`)
- `cli/lettertrace.mjs`
  - full CLI entry

**Key libraries**
- `@modelcontextprotocol/sdk`
- `mcp-handler`
- `zod`

**How surfaces share logic**
- REST and MCP both call shared service functions (`getProjects`, `listRuns`, `triggerRunForProject`, etc.)
- CLI does not duplicate business logic; it calls the network surfaces

**Build / packaging**
- separate `cli/package.json`
- `bin` entry points directly to `.mjs`

**Auth/config**
- more complex than toolbuilder:
  - OAuth audience split (`v1` vs `mcp`)
  - CLI stores/refreshes tokens
- Good reference for future hardening, but overkill for toolbuilder v1 parity.

### C. Other candidate repos

- `letterstory/phantomstory-cli`
  - useful **CLI-only** precedent (`bin`, TypeScript build, `commander`)
  - **not** a parity reference; no MCP/API parity pattern found
- `letterstory/phantomstory-command`
  - effectively empty; not relevant
- `letterstory/letterstory-admin`
  - no MCP or CLI parity pattern found

### D. Broader org scan conclusion

Broader code/package scanning for `mcp`, `@modelcontextprotocol`, `/api/mcp`, and `cli/package.json` found:
- **MCP implementations:** `letterstory/letterstory`, `letterstory/lettertrace`
- **CLI-only package without MCP:** `letterstory/Letterprove`

**Decision:** use `letterstory/letterstory` as the main architecture template and borrow only selective transport ideas from `lettertrace`.

## 2) Current letterstory-toolbuilder state

### Existing REST API capabilities (`src/app/api/**`)

| Route | Method | Current shared implementation | Notes |
|---|---|---|---|
| `/api/health` | GET | `getPlatformScaffoldStatus()` | status projection only |
| `/api/brand/ingest` | POST | `ingestBrandContext({ siteUrl })` | IP rate-limited |
| `/api/brand/validate` | POST | `validateBrandFidelity(profile, siteUrl)` | IP rate-limited |
| `/api/tools` | GET | `listGeneratedTools()` | summary list, omits html/history bodies |
| `/api/tools/[id]` | GET | `getGeneratedTool(id)` | detail view, strips html from current + history |
| `/api/tools/generate` | POST | `generateTool({ projectName, siteUrl, prompt, toolId? })` | create or revise in place; IP rate-limited |
| `/api/tools/[id]/rollback` | POST | `rollbackGeneratedTool(id, version)` | restore prior version |

### Existing shared-lib structure

Already in good shape for parity:
- `src/lib/brand/service.ts`
  - `ingestBrandContext`
  - `validateBrandFidelity`
  - `pullBrandProfile`, URL normalization, Context.dev logic
- `src/lib/generation/orchestrator.ts`
  - `generateTool`
- `src/lib/generation/store.ts`
  - `listGeneratedTools`
  - `getGeneratedTool`
  - `rollbackGeneratedTool`
  - backend dispatch to file/supabase
- `src/lib/platform/status.ts`
  - `getPlatformScaffoldStatus`

### What is missing today

- no app MCP server
- no CLI
- no shared request/response schemas for non-React consumers
- no parity test/check to keep API/MCP/CLI aligned
- `.mcp.json` only configures the Squad state server; it does **not** define a toolbuilder MCP server or sample client wiring

## 3) Recommended architecture for toolbuilder

### Primary recommendation

Adopt a **slimmed-down `letterstory` pattern**:
1. keep current domain/business logic where it already lives
2. add shared **contracts + registry + dispatch**
3. expose those through `/api/mcp`
4. build the CLI as a thin client over `/api/mcp`

This gives the highest parity confidence with the smallest domain refactor.

### Proposed directory structure

```text
src/
  app/
    api/
      mcp/
        route.ts
  lib/
    contracts/
      brand.ts
      health.ts
      tools.ts
    mcp/
      registry.ts
      dispatch.ts
      result.ts
      tool-schema.ts          # only if we want live schema projection like letterstory
      parity-map.ts           # optional explicit route/tool/cli mapping table
    surfaces/
      brand.ts                # thin shared surface adapters returning raw JSON payloads
      health.ts
      tools.ts
cli/
  package.json               # optional if we want a publishable subpackage
  toolbuilder.mjs
  client.mjs
  commands/
    brand.mjs
    tools.mjs
    health.mjs
  README.md
scripts/
  parity-check.ts
```

### Why `src/lib/surfaces/*` is useful here

The repo already has domain logic, but the API handlers still own some surface behavior:
- payload parsing / shape projection
- rate-limit invocation
- “not found” vs “error” HTTP mapping
- current tool-detail/list response stripping

Create thin shared surface adapters that return the **canonical raw payload** for:
- health
- brand ingest
- brand validate
- tool list/detail
- tool generate/revise
- tool rollback

Then:
- REST route handlers stay thin HTTP adapters
- MCP handlers become thin MCP adapters
- CLI just prints returned JSON

### Proposed MCP tool names and CLI commands

| Existing REST endpoint | Proposed MCP tool | Proposed CLI command | Notes |
|---|---|---|---|
| `GET /api/health` | `get_health` | `toolbuilder health` | exact status payload |
| `POST /api/brand/ingest` | `ingest_brand_context` | `toolbuilder brand ingest --site-url <url>` | same contract |
| `POST /api/brand/validate` | `validate_brand_fidelity` | `toolbuilder brand validate --site-url <url> --profile-file <path>` or `--stdin` | profile is required today |
| `GET /api/tools` | `list_generated_tools` | `toolbuilder tools list` | same summary payload |
| `GET /api/tools/[id]` | `get_generated_tool` | `toolbuilder tools get <id>` | preserve html-stripped detail contract |
| `POST /api/tools/generate` | `generate_tool` | `toolbuilder tools generate --prompt <text> [--project-name] [--site-url] [--tool-id]` | `toolId` keeps revise-in-place behavior |
| `POST /api/tools/[id]/rollback` | `rollback_generated_tool` | `toolbuilder tools rollback <id> --version <n>` | same behavior |

### Recommended MCP route behavior

Mirror the `letterstory` shape:
- `GET /api/mcp`
  - discovery document
  - tool names, descriptions, input schemas, output schemas
- `POST /api/mcp`
  - JSON-RPC
  - support at minimum:
    - `initialize`
    - `tools/list`
    - `tools/call`
    - `ping`

This is the cleanest base for:
- direct MCP use by agents
- a CLI that can live-discover tools
- a future parity-check script

### CLI packaging recommendation

**Recommended first implementation:** top-level `cli/` ESM files, no TypeScript build for the CLI.

Why:
- matches the org’s actual publishable CLI pattern (`letterstory`, `lettertrace`)
- avoids adding a separate CLI bundler/build chain
- keeps root Next.js build unchanged

### `package.json` changes to plan

Root `package.json`
- add direct dependency:
  - `zod`
- add scripts:
  - `"cli": "node cli/toolbuilder.mjs"`
  - `"parity:check": "node --import tsx scripts/parity-check.ts"`
- add bin entry **if** we want root-package CLI installability:
  - `"bin": { "toolbuilder": "./cli/toolbuilder.mjs" }`

Optional follow-up
- create `cli/package.json` if we want to publish the CLI separately, as `letterstory` and `lettertrace` do

### `tsconfig` / build changes

**If CLI is `.mjs`:**
- no tsconfig change required
- no build-script change required

**If we insist on TS CLI sources later:**
- add a dedicated CLI emit step (`tsc`/esbuild/tsup)
- but this is not needed for phase 1 parity

## 4) Migration / refactor steps needed

### Minimal refactor

Because the business logic is already mostly extracted, this is **not** a big service-layer rewrite.

1. **Add zod contracts** for each current REST surface
   - request schemas for POST routes
   - output schemas matching current wire payloads

2. **Add shared surface adapters**
   - canonical raw JSON payload builders
   - central place for list/detail shape projection

3. **Extract rate-limit rules into reusable constants/helpers**
   - today the expensive-route limits live only in REST route files
   - MCP must not become a rate-limit bypass for:
     - brand ingest
     - brand validate
     - tool generate

4. **Create MCP registry + dispatch**
   - registry entry per capability
   - input/output schema + handler

5. **Add `/api/mcp`**
   - discovery GET
   - JSON-RPC POST

6. **Add CLI over MCP**
   - `client.mjs` for discovery + `tools/call`
   - curated commands for the 7 existing capabilities
   - optional generic `tools list/show/call` escape hatch, strongly recommended

7. **Add parity test**
   - adapt `letterstory`’s `scripts/parity-check.ts` idea
   - fail if a curated CLI command references a non-existent MCP tool
   - optionally also fail if route/tool/cli map loses an expected capability

## 5) Auth / config differences across surfaces

### Current repo reality
- REST API is public
- protection today is mainly:
  - env-gated upstream integrations
  - IP rate-limits on expensive POSTs

### Recommended v1 parity posture
- **Do not introduce new auth just for parity**
- keep MCP public like REST
- apply the same expensive-operation rate limiting in the MCP surface
- CLI should only need:
  - `--url`
  - env fallback like `TOOLBUILDER_API_URL`
  - default `http://localhost:3000` for local dev

### Future hardening path

If product requirements later demand external/public automation:
- use `letterstory`’s saved config + header model, or
- use `lettertrace`’s OAuth audience split

But that should be phase 2, not bundled into parity delivery.

## 6) Ordered implementation handoff

1. **Backend**
   - add shared zod contracts
   - add surface adapters for health/brand/tools
   - extract reusable rate-limit rules/helpers
   - add MCP registry + dispatch
   - add `/api/mcp`

2. **Backend**
   - add CLI client + curated commands over MCP
   - add generic `tools list/show/call` escape hatch

3. **Infra**
   - confirm deployment exposes `/api/mcp` with current runtime/time budget expectations
   - decide whether root `package.json` bin is enough or if a separate publishable `cli/package.json` is wanted now
   - do **not** overwrite the existing `.mcp.json` squad-state config; add docs/sample config instead

4. **Frontend**
   - add lightweight docs/help entry points in the app if desired (e.g. “Use via API / MCP / CLI”)
   - if product wants it, surface the MCP endpoint and CLI examples from the dashboard/workspace

5. **Tester**
   - unit-test `/api/mcp`
   - CLI tests for command → MCP tool mapping
   - parity-check script wired into CI
   - smoke coverage for one representative flow on all three surfaces:
     - brand ingest
     - tool generate
     - tools get/list
     - rollback

## 7) Final architectural call

**Chosen pattern:** follow `letterstory/letterstory`’s manifest/dispatch/CLI-over-MCP architecture, not `lettertrace`’s more auth-heavy split-surface model.

**Reason:** toolbuilder already has a strong shared domain layer and a small public API surface. The biggest risk is drift, not transport complexity. The `letterstory` pattern is the org’s clearest answer to that exact problem.
