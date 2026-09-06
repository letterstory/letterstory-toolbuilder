### 2026-09-05: Local production customer simulation for MCP/API/CLI parity
**By:** Tester
**What:** I ran a local production-mode customer simulation of the new parity work across REST, MCP JSON-RPC, and the CLI, using a Porter-faithful standalone runtime after `npm run build`. Health and tools-list parity worked; brand ingest and tool generation were blocked from real external execution by missing local credentials, and the CLI has a real argument-parsing bug that prevents documented subcommands with flags from working at all.
**Why:** Infra confirmed there is no safe isolated Porter staging target, so the user asked for the closest realistic customer journey against a local production build instead.

## Environment / credential findings

I checked both `.env.local` and inherited shell env without printing secrets:

```json
{
  "envFileExists": false
}
```

```json
{
  "ANTHROPIC_API_KEY": { "present": false, "nonEmpty": false, "length": 0 },
  "CONTEXT_DEV_API_KEY": { "present": false, "nonEmpty": false, "length": 0 },
  "CONTEXT_DEV_BASE_URL": { "present": false, "nonEmpty": false, "length": 0 },
  "SUPABASE_URL": { "present": false, "nonEmpty": false, "length": 0 },
  "SUPABASE_SERVICE_ROLE_KEY": { "present": false, "nonEmpty": false, "length": 0 }
}
```

Result:
- No `.env.local` exists on this machine.
- No relevant secrets were inherited into the process environment.
- Therefore I could **not** perform a real external Context.dev or Anthropic-backed end-to-end.
- I did **not** fake success. I verified the real behavior the product currently gives a customer in that condition.

## Production runtime used

`package.json` says:
- `build`: `next build`
- `start`: `next start`

But the Dockerfile/`porter.yaml` production runtime is the standalone server:

```yaml
run: node server.js
```

So for the closest Porter-faithful local simulation, I used:

```bash
npm run build
NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 node .next/standalone/server.js
```

Build/start output:

```text
> letterstory-toolbuilder@0.1.0 build
> next build
...
✓ Compiled successfully
...
├ ƒ /api/mcp
...
```

```text
▲ Next.js 15.5.25
- Local:        http://localhost:3000
- Network:      http://0.0.0.0:3000

✓ Starting...
✓ Ready in 92ms
```

## Exact commands run

### Setup / verification

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN || true
npm run build
NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 node .next/standalone/server.js
curl -sS -D - http://127.0.0.1:3000/api/health
```

### Health

```bash
curl -sS http://127.0.0.1:3000/api/health
curl -sS -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_health","arguments":{}}}' \
  http://127.0.0.1:3000/api/mcp
npm run cli -- health
```

### Brand ingest

```bash
curl -sS -H 'Content-Type: application/json' \
  -d '{"siteUrl":"https://stripe.com"}' \
  http://127.0.0.1:3000/api/brand/ingest
curl -sS -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ingest_brand_context","arguments":{"siteUrl":"https://stripe.com"}}}' \
  http://127.0.0.1:3000/api/mcp
npm run cli -- brand ingest --site-url https://stripe.com
```

### Tool generation

```bash
curl -sS -H 'Content-Type: application/json' \
  -d '{"prompt":"BMI calculator","projectName":"BMI Calculator","siteUrl":"https://stripe.com"}' \
  http://127.0.0.1:3000/api/tools/generate
curl -sS -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"generate_tool","arguments":{"prompt":"BMI calculator","projectName":"BMI Calculator","siteUrl":"https://stripe.com"}}}' \
  http://127.0.0.1:3000/api/mcp
npm run cli -- tools generate --prompt 'BMI calculator' --project-name 'BMI Calculator' --site-url https://stripe.com
```

### Tools list

```bash
curl -sS http://127.0.0.1:3000/api/tools
curl -sS -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_generated_tools","arguments":{}}}' \
  http://127.0.0.1:3000/api/mcp
npm run cli -- tools list
```

### Additional CLI confirmation (to rule out `--url` as the cause)

```bash
npm run cli -- health
npm run cli -- brand ingest --site-url https://stripe.com
npm run cli -- tools generate --prompt 'BMI calculator' --project-name 'BMI Calculator' --site-url https://stripe.com
npm run cli -- tools list
```

### Cleanup

Background server processes were explicitly terminated via the session's `stop_bash` control, then I verified shutdown with:

```bash
curl -sS http://127.0.0.1:3000/api/health || true
```

After stopping the server:

```text
curl: (7) Failed to connect to 127.0.0.1 port 3000 after 0 ms: Couldn't connect to server
```

## Actual responses / outputs

## 1) Health check

### REST

```json
{
  "ok": true,
  "service": "letterstory-toolbuilder",
  "status": {
    "modules": [
      {
        "name": "Brand ingestion",
        "state": "pending-config",
        "summary": "Context.dev-backed brand extraction is live behind env gating, with URL safety checks and a probe script for real-site validation."
      },
      {
        "name": "Tool generation",
        "state": "stubbed",
        "summary": "The orchestration boundary is in place for prompt-driven tool builds, without any live agent wiring yet."
      },
      {
        "name": "Porter deployment",
        "state": "pending-config",
        "summary": "Deployment hooks are organized under a Porter-specific module, waiting on credentials and topology decisions."
      }
    ]
  }
}
```

### MCP (`result.output`)

```json
{
  "ok": true,
  "service": "letterstory-toolbuilder",
  "status": {
    "modules": [
      {
        "name": "Brand ingestion",
        "state": "pending-config",
        "summary": "Context.dev-backed brand extraction is live behind env gating, with URL safety checks and a probe script for real-site validation."
      },
      {
        "name": "Tool generation",
        "state": "stubbed",
        "summary": "The orchestration boundary is in place for prompt-driven tool builds, without any live agent wiring yet."
      },
      {
        "name": "Porter deployment",
        "state": "pending-config",
        "summary": "Deployment hooks are organized under a Porter-specific module, waiting on credentials and topology decisions."
      }
    ]
  }
}
```

### CLI

```json
{
  "ok": true,
  "service": "letterstory-toolbuilder",
  "status": {
    "modules": [
      {
        "name": "Brand ingestion",
        "state": "pending-config",
        "summary": "Context.dev-backed brand extraction is live behind env gating, with URL safety checks and a probe script for real-site validation."
      },
      {
        "name": "Tool generation",
        "state": "stubbed",
        "summary": "The orchestration boundary is in place for prompt-driven tool builds, without any live agent wiring yet."
      },
      {
        "name": "Porter deployment",
        "state": "pending-config",
        "summary": "Deployment hooks are organized under a Porter-specific module, waiting on credentials and topology decisions."
      }
    ]
  }
}
```

**Parity result:** REST body == MCP `result.output` == CLI JSON. ✅

## 2) Brand ingest (`https://stripe.com`)

### REST

```json
{
  "status": "not_configured",
  "requestedUrl": "https://stripe.com",
  "message": "Set CONTEXT_DEV_API_KEY before enabling brand ingestion for this repository."
}
```

### MCP (`result.output`)

```json
{
  "status": "not_configured",
  "requestedUrl": "https://stripe.com",
  "message": "Set CONTEXT_DEV_API_KEY before enabling brand ingestion for this repository."
}
```

### CLI

```text
> letterstory-toolbuilder@0.1.0 cli
> node cli/toolbuilder.mjs brand ingest --site-url https://stripe.com

Missing required --site-url <url>.
```

**Parity result:** REST and MCP match each other, but the documented CLI command fails client-side before making the request. ❌

## 3) Tool generation (`BMI calculator`)

### REST

```json
{
  "status": "not_configured",
  "message": "Set ANTHROPIC_API_KEY before generating tools."
}
```

### MCP (`result.output`)

```json
{
  "status": "not_configured",
  "message": "Set ANTHROPIC_API_KEY before generating tools."
}
```

### CLI

```text
> letterstory-toolbuilder@0.1.0 cli
> node cli/toolbuilder.mjs tools generate --prompt BMI calculator --project-name BMI Calculator --site-url https://stripe.com

Missing required --prompt <text>.
```

**Parity result:** REST and MCP match each other, but the documented CLI command fails client-side before making the request. ❌

## 4) Tools list

### REST

```json
{
  "status": "success",
  "tools": []
}
```

### MCP (`result.output`)

```json
{
  "status": "success",
  "tools": []
}
```

### CLI

```json
{
  "status": "success",
  "tools": []
}
```

**Parity result:** REST body == MCP `result.output` == CLI JSON. ✅

## 5) Tools get / rollback

I could not perform a real get/rollback journey because:
- tool generation did not succeed (no Anthropic key locally), and
- tools list returned `[]`, so there was no preexisting local generated tool to fetch or roll back.

I did **not** synthesize fake tool data or patch storage by hand, because that would not reflect a real customer journey.

**Verification boundary:**
- `GET /api/tools` / `list_generated_tools` / `npm run cli -- tools list` were verified for real.
- `GET /api/tools/[id]` / `get_generated_tool` and rollback were **not** customer-verifiable in this environment.

## Bugs / discrepancies found

### 1) Real parity bug: CLI flag parsing is broken for subcommands that require options

Documented CLI commands fail:

```text
npm run cli -- brand ingest --site-url https://stripe.com
Missing required --site-url <url>.

npm run cli -- tools generate --prompt 'BMI calculator' --project-name 'BMI Calculator' --site-url https://stripe.com
Missing required --prompt <text>.
```

This is not a cosmetic difference; it blocks core customer flows on the CLI surface.

Likely root cause from code inspection:
- `cli/toolbuilder.mjs` calls `parseArgv(process.argv.slice(2))` once at the top level.
- That parser consumes all `--...` tokens globally.
- It then passes only positional leftovers into `runBrandCommand` / `runToolsCommand`.
- Those command handlers call `parseArgv(argv)` again, but their option flags are already gone.

Impact:
- `toolbuilder health` works because it has no required flags.
- `toolbuilder tools list` works because it has no required flags.
- `toolbuilder brand ingest --site-url ...` and `toolbuilder tools generate --prompt ...` do not work at all.

### 2) Real environment blocker: local prod simulation cannot exercise the externally-backed happy path

Missing local credentials prevented:
- real Context.dev brand ingestion
- real Anthropic tool generation
- any downstream generated-tool get/rollback scenario

This is an environment limitation, not a parity-implementation bug by itself, but it means customer-readiness for the true happy path is still unproven from this run.

### 3) Product-message concern (not a parity mismatch)

The health payload reports:

```json
{
  "name": "Tool generation",
  "state": "stubbed",
  "summary": "The orchestration boundary is in place for prompt-driven tool builds, without any live agent wiring yet."
}
```

That messaging appears stale/misleading given the shipped generate endpoint and parity work. All three surfaces agree on it, so this is **not** a parity bug, but it may confuse customers/operators.

## Performance notes

Measured locally against the production standalone server:

```text
rest-health          0.027s
mcp-health           0.030s
rest-brand-ingest    0.029s
mcp-brand-ingest     0.036s
rest-tools-generate  0.026s
mcp-tools-generate   0.025s
rest-tools-list      0.026s
mcp-tools-list       0.027s
cli-health           0.152s
cli-brand-ingest     0.130s (failed client-side)
cli-tools-generate   0.134s (failed client-side)
cli-tools-list       0.166s
```

Interpretation:
- REST and MCP transport overhead is small and consistent locally.
- The tool-generation 60–180s production budget was **not** exercised because generation short-circuited immediately on missing config.
- CLI adds modest startup overhead when it works.
- The main customer-facing problem found here is correctness, not latency: two documented CLI flows fail before any network request.

## Overall verdict

**Not customer-ready yet.**

What is ready:
- Local production build works.
- `/api/mcp` is present in the production build.
- Health parity is correct across REST/MCP/CLI.
- Tools-list parity is correct across REST/MCP/CLI.

What is not ready:
- The CLI is not functionally at parity for core flagged subcommands (`brand ingest`, `tools generate`).
- Real brand-ingest/tool-generation happy paths remain unverified locally because no `.env.local` or inherited `CONTEXT_DEV_API_KEY` / `ANTHROPIC_API_KEY` are available.
- Because no real tool could be generated, customer verification of tool get / rollback is still outstanding.

Recommended next step:
1. Backend fixes the CLI option-parsing bug.
2. Re-run this exact production-mode journey on a machine/environment with real `CONTEXT_DEV_API_KEY` and `ANTHROPIC_API_KEY`.
3. Only then make a customer-readiness call for the full parity feature.

## Re-verification (2026-09-05)

Lead's argv fix holds in a fresh production-style rerun.

### Runtime used

I rebuilt and re-ran the standalone production server again:

```bash
npm run build
NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1 node .next/standalone/server.js
```

### Credential check

I re-confirmed the local machine still has no usable customer credentials:

- `.env.local` absent
- `CONTEXT_DEV_API_KEY` absent
- `ANTHROPIC_API_KEY` absent
- Supabase env vars absent

That means the expected customer behavior here is graceful `not_configured` responses, not a real live ingest/generate happy path.

### Re-run results across REST / MCP / CLI

Using the same previously-broken CLI shapes plus the documented command set:

- `health` — parity OK
- `brand ingest --site-url https://stripe.com` — parity OK; all 3 returned `not_configured`
- `brand validate --site-url https://stripe.com --profile-file ...` — parity OK with a schema-valid local profile file; all 3 returned `not_configured` / `context_dev_not_configured`
- `tools list` — parity OK; all 3 returned `{"status":"success","tools":[]}`
- `tools list --registry` — parity OK after normalizing discovery output; REST discovery, MCP `tools/list`, and CLI all exposed the same 7 tool names
- `tools show generate_tool` — parity OK; same registry entry on all 3 surfaces
- `tools generate --prompt "BMI calculator" --project-name "BMI Calculator" --site-url https://stripe.com` — parity OK; all 3 returned `not_configured`
- `tools get fake-tool` — parity OK; all 3 returned the same not-found payload
- `tools rollback fake-tool --version 1` — parity OK; all 3 returned the same not-found payload

Additional documented CLI coverage:

- `tools call generate_tool --json '{"prompt":"BMI calculator"}'` matched MCP and returned the same `not_configured` payload.

### CLI parser verdict

The original CLI-only failures are gone.

Previously broken commands now reach the server/business layer and return normal JSON payloads:

- no more `Missing required --site-url <url>.`
- no more `Missing required --prompt <text>.`
- no new client-side argv parsing regressions found in the documented command set

### Final gate

Re-ran the final checks:

- `npm test` ✅
- `npm run parity:check` ✅
- `npm run typecheck` ✅

### Updated customer-readiness verdict

**Pass for CLI/MCP/REST parity and failure-mode handling in a no-credentials local environment.**

The argv bug is fixed, documented CLI commands now parse correctly, and identical operations now return aligned payloads across all three surfaces.

**Still not fully live-journey proven on this machine** because no real `CONTEXT_DEV_API_KEY` / `ANTHROPIC_API_KEY` are available, so external brand ingestion, tool generation, and a real generated-tool get/rollback chain remain credential-blocked rather than fully exercised.
