### 2026-09-05: Live CLI parity run against production
**By:** Tester
**What:** Ran the documented CLI parity commands against `https://web-22301-57c6c7ab-4p0z458q.onporter.run`, plus direct REST and MCP curl checks, after syncing the local checkout to `main` at `36edc4f260cda73ad4e63c11f758084f9806787a`.
**Why:** Confirm whether CLI/MCP/REST parity actually works end-to-end against the live deployed instance, and record any production-only gaps.

## Local checkout sync

Exact command run:

```bash
git --no-pager status --short --branch && echo '---' && git --no-pager fetch origin && git checkout main && git pull --ff-only origin main && echo '---' && git rev-parse HEAD
```

Observed:

- Started on `mcp-cli-api-parity`, then switched to `main`
- Pulled `origin/main` successfully
- Final HEAD: `36edc4f260cda73ad4e63c11f758084f9806787a`

## Live URL under test

```text
https://web-22301-57c6c7ab-4p0z458q.onporter.run
```

## CLI run results

### 1) Health

Command:

```bash
TOOLBUILDER_API_URL=https://web-22301-57c6c7ab-4p0z458q.onporter.run npm run cli -- health
```

Observed:

- Exit code: `0`
- Response shape matched `COMMANDS.md` health output (`ok`, `service`, `status.modules[]`)

Excerpt:

```json
{
  "ok": true,
  "service": "letterstory-toolbuilder",
  "status": {
    "modules": [
      { "name": "Brand ingestion", "state": "configured" },
      { "name": "Tool generation", "state": "stubbed" },
      { "name": "Porter deployment", "state": "pending-config" }
    ]
  }
}
```

Verdict: **PASS**

---

### 2) Brand ingest

Command:

```bash
TOOLBUILDER_API_URL=https://web-22301-57c6c7ab-4p0z458q.onporter.run npm run cli -- brand ingest --site-url https://stripe.com
```

Observed:

- Exit code: `0`
- Real live brand data returned from production
- Response shape matched documented `status/requestedUrl/profile`

Excerpt:

```json
{
  "status": "success",
  "requestedUrl": "https://stripe.com",
  "profile": {
    "source": "context.dev",
    "brandName": "Stripe",
    "colors": {
      "primary": "#533AFD",
      "secondary": "#A494FC",
      "accent": "#040404",
      "background": "#FFFFFF",
      "text": "#000EFF"
    },
    "fonts": ["sohne-var"]
  }
}
```

Verdict: **PASS**

---

### 3) Brand validate with repo fixture

Command:

```bash
TOOLBUILDER_API_URL=https://web-22301-57c6c7ab-4p0z458q.onporter.run npm run cli -- brand validate --site-url https://stripe.com --profile-file /Users/mir/dev/builder-agent/letterstory-toolbuilder/tests/fixtures/brand-profile.json
```

Observed:

- Exit code: `1`
- CLI stderr: `Invalid arguments for validate_brand_fidelity.`
- The checked-in fixture is too small / outdated for the live validation schema

Fixture content used:

```json
{
  "brandName": "Stripe",
  "voice": {
    "tone": "clear"
  }
}
```

Verdict: **FAIL (fixture/doc drift, not a transport failure)**

---

### 4) Brand validate with a live full profile

To verify the actual live CLI path, I created a temporary profile file from a real production ingest response, ran the documented `brand validate --profile-file ...` command, then deleted the temp file.

Exact commands run:

```bash
python3 - <<'PY'
import json, urllib.request
from pathlib import Path
base='https://web-22301-57c6c7ab-4p0z458q.onporter.run'
req=urllib.request.Request(base+'/api/brand/ingest', data=b'{"siteUrl":"https://stripe.com"}', headers={'Content-Type':'application/json'})
with urllib.request.urlopen(req, timeout=120) as resp:
    data=json.loads(resp.read().decode())
Path('brand-profile.live.json').write_text(json.dumps(data['profile'], indent=2))
PY
TOOLBUILDER_API_URL=https://web-22301-57c6c7ab-4p0z458q.onporter.run npm run --silent cli -- brand validate --site-url https://stripe.com --profile-file brand-profile.live.json
rm brand-profile.live.json
```

Observed:

- Exit code: `0`
- Duration: ~`27.5s`
- Response shape matched documented `status/requestedUrl/assessment/referenceUrl/model`

Excerpt:

```json
{
  "status": "success",
  "requestedUrl": "https://stripe.com",
  "assessment": {
    "status": "warn",
    "similarityScore": 68,
    "confidence": "medium"
  },
  "referenceUrl": "https://stripe.com",
  "model": "claude-sonnet-4-6"
}
```

Verdict: **PASS**

---

### 5) Tools list

Command:

```bash
TOOLBUILDER_API_URL=https://web-22301-57c6c7ab-4p0z458q.onporter.run npm run cli -- tools list
```

Observed:

- Exit code: `0`
- Response shape matched documented `status/tools[]`
- Production currently returned an empty tool list

Excerpt:

```json
{
  "status": "success",
  "tools": []
}
```

Verdict: **PASS**

Note: empty list is consistent with non-persistent/file-based storage expectations on production.

---

### 6) Tools list --registry

Command:

```bash
TOOLBUILDER_API_URL=https://web-22301-57c6c7ab-4p0z458q.onporter.run npm run cli -- tools list --registry
```

Observed:

- Exit code: `0`
- Output was the expected registry array of MCP tool descriptors
- Registry contents matched the 7-tool MCP inventory

Observed tool names:

```json
[
  "get_health",
  "ingest_brand_context",
  "validate_brand_fidelity",
  "list_generated_tools",
  "get_generated_tool",
  "generate_tool",
  "rollback_generated_tool"
]
```

Verdict: **PASS**

---

### 7) Tools show get_health

Command:

```bash
TOOLBUILDER_API_URL=https://web-22301-57c6c7ab-4p0z458q.onporter.run npm run cli -- tools show get_health
```

Observed:

- Exit code: `0`
- Response shape matched registry entry docs

Excerpt:

```json
{
  "name": "get_health",
  "capability": "health.read",
  "inputSchema": {
    "type": "object"
  },
  "outputSchema": {
    "required": ["ok", "service", "status"]
  }
}
```

Verdict: **PASS**

---

### 8) Tools call get_health

Command:

```bash
TOOLBUILDER_API_URL=https://web-22301-57c6c7ab-4p0z458q.onporter.run npm run cli -- tools call get_health --json '{}'
```

Observed:

- Exit code: `0`
- Returned the same live health payload as `health`

Excerpt:

```json
{
  "ok": true,
  "service": "letterstory-toolbuilder",
  "status": {
    "modules": [
      { "name": "Brand ingestion", "state": "configured" },
      { "name": "Tool generation", "state": "stubbed" },
      { "name": "Porter deployment", "state": "pending-config" }
    ]
  }
}
```

Verdict: **PASS**

---

### 9) Tools get previously generated live id

Command:

```bash
TOOLBUILDER_API_URL=https://web-22301-57c6c7ab-4p0z458q.onporter.run npm run cli -- tools get fcd77d82-3fe5-4abb-a633-e8f725abb6ce
```

Observed:

- Exit code: `1`
- Response was a sensible server-side not-found, not a client crash

Excerpt:

```json
{
  "status": "error",
  "message": "Tool not found."
}
```

Verdict: **EXPECTED / ACCEPTABLE**

Interpretation: the earlier generated tool is not retained in the current production storage, which matches prior infra concerns about file-based/non-persistent runtime storage.

## Direct non-CLI surface checks

### REST health

Command:

```bash
curl -sS https://web-22301-57c6c7ab-4p0z458q.onporter.run/api/health
```

Observed:

- HTTP `200`
- Same `ok/service/status.modules[]` shape as CLI/MCP health

Excerpt:

```json
{
  "ok": true,
  "service": "letterstory-toolbuilder",
  "status": {
    "modules": [
      { "name": "Brand ingestion", "state": "configured" },
      { "name": "Tool generation", "state": "stubbed" },
      { "name": "Porter deployment", "state": "pending-config" }
    ]
  }
}
```

Verdict: **PASS**

---

### MCP JSON-RPC tools/list

Command:

```bash
curl -sS -X POST https://web-22301-57c6c7ab-4p0z458q.onporter.run/api/mcp -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Observed:

- HTTP `200`
- JSON-RPC envelope shape matched docs
- Returned the expected 7 tools

Excerpt:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      { "name": "get_health" },
      { "name": "ingest_brand_context" },
      { "name": "validate_brand_fidelity" },
      { "name": "list_generated_tools" },
      { "name": "get_generated_tool" },
      { "name": "generate_tool" },
      { "name": "rollback_generated_tool" }
    ]
  }
}
```

Verdict: **PASS**

## Production reliability caveat observed during testing

I also observed transient cold-start / availability behavior on the live Porter URL:

Commands run:

```bash
curl -i -sS https://web-22301-57c6c7ab-4p0z458q.onporter.run/api/mcp | head -n 40
curl -i -sS -X POST https://web-22301-57c6c7ab-4p0z458q.onporter.run/api/mcp -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_health","arguments":{}}}' | head -n 40
```

First observation:

```http
HTTP/2 503
content-type: text/html
```

And a retried REST health check:

```bash
for i in 1 2; do echo "TRY=$i"; date -u +%FT%TZ; curl -sS -o - -w '\nHTTP_STATUS=%{http_code}\n' https://web-22301-57c6c7ab-4p0z458q.onporter.run/api/health; echo '---'; sleep 10; done
```

Observed:

- Try 1: `503` HTML from nginx
- Try 2 (~10s later): `200` JSON health payload

Implication:

- The live surfaces do work, but the deployment can briefly return non-JSON `503` pages while cold/unavailable
- In that state, the CLI surfaces it as a JSON parse error (`Unexpected token '<' ... is not valid JSON`) rather than a cleaner upstream-HTTP error

## Final verdict

**Functional parity is confirmed on a healthy/warm production instance across all three surfaces (CLI, REST, MCP).**

Specifically confirmed live:

- `health`
- `brand ingest`
- `brand validate` (with a real full profile file)
- `tools list`
- `tools list --registry`
- `tools show get_health`
- `tools call get_health`
- direct REST `/api/health`
- direct MCP `tools/list`

Important caveats:

1. `tests/fixtures/brand-profile.json` is no longer valid input for `brand validate`; docs/fixture need updating.
2. The production URL intermittently returns HTML `503` responses on cold/unavailable starts, which makes the CLI print a JSON parse error until the app is warm again.

So: **core live CLI parity works, but this was not a perfectly clean green run due fixture drift and transient production 503 behavior.**
