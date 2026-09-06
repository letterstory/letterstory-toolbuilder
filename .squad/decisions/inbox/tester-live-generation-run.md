# Tester live generation run — 2026-09-05

## Scope

Prove the approved live journey with real external calls after Infra added local `.env.local` secrets, without exposing any secret values.

## Environment / server startup

Started Next.js dev server so `.env.local` would be loaded automatically.

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Observed startup:

- Next.js reported `Environments: .env.local`
- Ready in `1533ms`

Health check:

```bash
curl -sS http://127.0.0.1:3000/api/health
```

Observed excerpt:

```json
{
  "ok": true,
  "service": "letterstory-toolbuilder",
  "status": {
    "modules": [
      { "name": "Brand ingestion", "state": "configured" }
    ]
  }
}
```

## 1) Brand ingest — CLI, real Context.dev call

Command run:

```bash
python3 - <<'PY'
import subprocess, time, sys
cmd=['npm','run','cli','--','brand','ingest','--site-url','https://stripe.com']
start=time.time()
proc=subprocess.run(cmd, text=True)
end=time.time()
print(f'__EXIT_CODE={proc.returncode}')
print(f'__DURATION_MS={int((end-start)*1000)}')
sys.exit(proc.returncode)
PY
```

Observed timing:

- `2792ms`

Sanitized excerpt:

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

Verdict: **PASS**. This was not `not_configured`; real brand data came back.

## 2) Tool generation — MCP over `/api/mcp`, real Anthropic-backed generation

Command run:

```bash
python3 - <<'PY'
import json, time, urllib.request, sys
url='http://127.0.0.1:3000/api/mcp'
payload={
  'jsonrpc':'2.0',
  'id':'tester-generate-1',
  'method':'tools/call',
  'params':{
    'name':'generate_tool',
    'arguments':{
      'projectName':'Stripe BMI Demo',
      'siteUrl':'https://stripe.com',
      'prompt':'Simple BMI calculator. Ask for height in centimeters and weight in kilograms, calculate BMI instantly, show BMI category, and include a reset button.'
    }
  }
}
req=urllib.request.Request(url,data=json.dumps(payload).encode('utf-8'),headers={'Content-Type':'application/json','Accept':'application/json'},method='POST')
start=time.time()
with urllib.request.urlopen(req, timeout=320) as resp:
    raw=resp.read().decode('utf-8')
end=time.time()
body=json.loads(raw)
result=body.get('result', {})
output=result.get('output', {})
tool=output.get('tool', {}) if isinstance(output, dict) else {}
summary={
  'jsonrpc': body.get('jsonrpc'),
  'id': body.get('id'),
  'status': output.get('status') if isinstance(output, dict) else None,
  'toolId': tool.get('id'),
  'version': tool.get('version'),
  'projectName': tool.get('projectName'),
  'model': tool.get('model'),
  'warnings': tool.get('warnings'),
  'headline': (tool.get('copy') or {}).get('headline') if isinstance(tool, dict) else None,
  'brandFidelity': tool.get('brandFidelity'),
  'htmlLength': len(tool.get('html','')) if isinstance(tool, dict) else None,
  'htmlExcerpt': tool.get('html','')[:220] if isinstance(tool, dict) else None,
  'meta': result.get('meta'),
  'durationMs': int((end-start)*1000)
}
print(json.dumps(summary, indent=2))
if summary['status'] != 'success':
    sys.exit(1)
PY
```

Observed timing:

- `139232ms` (~`139.2s`)

Real tool id created:

- `fcd77d82-3fe5-4abb-a633-e8f725abb6ce`

Sanitized excerpt:

```json
{
  "status": "success",
  "toolId": "fcd77d82-3fe5-4abb-a633-e8f725abb6ce",
  "version": 1,
  "projectName": "Stripe BMI Demo",
  "model": "claude-sonnet-4-6",
  "headline": "See Your BMI in Seconds — No Signup Required",
  "brandFidelity": {
    "verdict": "warn"
  },
  "htmlLength": 14405,
  "htmlExcerpt": "<!doctype html><html lang=\"en\"><head>..."
}
```

Observed warning excerpt:

```text
Brand fidelity check (warn): The text color uses #040404 (the accent token) instead of the specified #000EFF text token...
```

Verdict: **PASS**. A real tool was generated with live brand context and live model output.

## 3) Tools get — REST

Commands run:

```bash
curl -sS http://127.0.0.1:3000/api/tools/fcd77d82-3fe5-4abb-a633-e8f725abb6ce
```

and a summarized read:

```bash
python3 - <<'PY'
import json, urllib.request
url='http://127.0.0.1:3000/api/tools/fcd77d82-3fe5-4abb-a633-e8f725abb6ce'
with urllib.request.urlopen(url, timeout=60) as resp:
    body=json.loads(resp.read().decode('utf-8'))
tool=body.get('tool', {})
summary={
  'status': body.get('status'),
  'toolId': tool.get('id'),
  'version': tool.get('version'),
  'projectName': tool.get('projectName'),
  'model': tool.get('model'),
  'historyCount': len(tool.get('history', [])) if isinstance(tool.get('history'), list) else None,
  'hasHtmlField': 'html' in tool,
  'headline': (tool.get('copy') or {}).get('headline') if isinstance(tool, dict) else None,
  'brandFidelity': tool.get('brandFidelity')
}
print(json.dumps(summary, indent=2))
PY
```

Observed excerpt:

```json
{
  "status": "success",
  "toolId": "fcd77d82-3fe5-4abb-a633-e8f725abb6ce",
  "version": 1,
  "projectName": "Stripe BMI Demo",
  "hasHtmlField": false,
  "headline": "See Your BMI in Seconds — No Signup Required"
}
```

Verdict: **PASS**. REST metadata exists and HTML is stripped as expected by contract.

## 4) Tools list — CLI

Command run:

```bash
npm run cli -- tools list
```

Observed excerpt:

```json
{
  "status": "success",
  "tools": [
    {
      "id": "fcd77d82-3fe5-4abb-a633-e8f725abb6ce",
      "projectName": "Stripe BMI Demo",
      "version": 1,
      "previousVersionCount": 0
    }
  ]
}
```

Verdict: **PASS**. New tool appears in the CLI list.

## 5) Tool revise/regenerate in place — REST

### Attempt 1

Command run:

```bash
python3 - <<'PY'
import json, time, urllib.request, urllib.error, sys
url='http://127.0.0.1:3000/api/tools/generate'
payload={
  'toolId':'fcd77d82-3fe5-4abb-a633-e8f725abb6ce',
  'projectName':'Stripe BMI Demo',
  'siteUrl':'https://stripe.com',
  'prompt':'Revise this BMI calculator in place. Add a unit toggle for metric and imperial, show a color-coded BMI category pill, include a short healthy range explainer, and keep the interface lightweight.'
}
req=urllib.request.Request(url,data=json.dumps(payload).encode('utf-8'),headers={'Content-Type':'application/json','Accept':'application/json'},method='POST')
start=time.time()
try:
    with urllib.request.urlopen(req, timeout=320) as resp:
        raw=resp.read().decode('utf-8')
        status=resp.status
        headers=dict(resp.headers.items())
except urllib.error.HTTPError as e:
    raw=e.read().decode('utf-8')
    status=e.code
    headers=dict(e.headers.items())
end=time.time()
body=json.loads(raw)
summary={
  'httpStatus': status,
  'body': body,
  'headers': {k: headers[k] for k in headers if k.lower() in {'server-timing','x-tool-generation-attempts','content-type','content-length','date'}},
  'durationMs': int((end-start)*1000)
}
print(json.dumps(summary, indent=2))
if status >= 400:
    sys.exit(1)
PY
```

Observed result:

```json
{
  "httpStatus": 400,
  "body": {
    "status": "error",
    "message": "Tool revision took too long to finish within the current request budget. Try a smaller change set, or retry after simplifying the instructions."
  },
  "headers": {
    "server-timing": "total;dur=187653, brand;dur=0, build;dur=187652, advisory;dur=0",
    "x-tool-generation-attempts": "1:invalid_html:152650/210000|2:timeout:35002/35000"
  },
  "durationMs": 187671
}
```

### Attempt 2 (smaller change set)

Command run:

```bash
python3 - <<'PY'
import json, time, urllib.request, urllib.error, sys
url='http://127.0.0.1:3000/api/tools/generate'
payload={
  'toolId':'fcd77d82-3fe5-4abb-a633-e8f725abb6ce',
  'projectName':'Stripe BMI Demo',
  'siteUrl':'https://stripe.com',
  'prompt':'Revise this BMI calculator in place. Keep the existing layout, but add a compact BMI category legend beneath the result card.'
}
req=urllib.request.Request(url,data=json.dumps(payload).encode('utf-8'),headers={'Content-Type':'application/json','Accept':'application/json'},method='POST')
start=time.time()
try:
    with urllib.request.urlopen(req, timeout=320) as resp:
        raw=resp.read().decode('utf-8')
        status=resp.status
        headers=dict(resp.headers.items())
except urllib.error.HTTPError as e:
    raw=e.read().decode('utf-8')
    status=e.code
    headers=dict(e.headers.items())
end=time.time()
body=json.loads(raw)
summary={
  'httpStatus': status,
  'status': body.get('status') if isinstance(body, dict) else None,
  'message': body.get('message') if isinstance(body, dict) else None,
  'headers': {k: headers[k] for k in headers if k.lower() in {'server-timing','x-tool-generation-attempts','content-type','content-length','date'}},
  'durationMs': int((end-start)*1000)
}
print(json.dumps(summary, indent=2))
if status >= 400:
    sys.exit(1)
PY
```

Observed result:

```json
{
  "httpStatus": 400,
  "status": "error",
  "message": "Tool revision took too long to finish within the current request budget. Try a smaller change set, or retry after simplifying the instructions.",
  "headers": {
    "server-timing": "total;dur=187643, brand;dur=0, build;dur=187642, advisory;dur=0",
    "x-tool-generation-attempts": "1:invalid_html:152639/210000|2:timeout:35003/35000"
  },
  "durationMs": 187660
}
```

Verdict: **FAIL**. Real in-place revision did not produce version 2; both live REST attempts failed the request budget with the same pattern.

## 6) Tool rollback — CLI

Command run:

```bash
npm run cli -- tools rollback fcd77d82-3fe5-4abb-a633-e8f725abb6ce --version 1
```

Observed excerpt:

```json
{
  "status": "error",
  "message": "Could not find that tool/version to restore."
}
```

Context: because no version 2 was ever created, the tool remained at version 1 with empty history, so rollback had nothing to restore.

Verdict: **FAIL as a flow outcome**, though the failure is consistent with stored state after the revision failure.

## 7) API surface parity check (same tool, same metadata)

Used `get` across all 3 surfaces and compared key fields.

### CLI

```bash
node cli/toolbuilder.mjs tools get fcd77d82-3fe5-4abb-a633-e8f725abb6ce | python3 -c 'import sys,json; data=json.load(sys.stdin); tool=data["tool"]; print(json.dumps({"surface":"cli","status":data["status"],"id":tool["id"],"version":tool["version"],"headline":tool["copy"]["headline"],"hasHtmlField":"html" in tool,"historyCount":len(tool["history"]),"brandVerdict":tool["brandFidelity"]["verdict"]}, indent=2))'
```

### REST

```bash
curl -sS http://127.0.0.1:3000/api/tools/fcd77d82-3fe5-4abb-a633-e8f725abb6ce | python3 -c 'import sys,json; data=json.load(sys.stdin); tool=data["tool"]; print(json.dumps({"surface":"rest","status":data["status"],"id":tool["id"],"version":tool["version"],"headline":tool["copy"]["headline"],"hasHtmlField":"html" in tool,"historyCount":len(tool["history"]),"brandVerdict":tool["brandFidelity"]["verdict"]}, indent=2))'
```

### MCP

```bash
curl -sS -X POST http://127.0.0.1:3000/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  --data '{"jsonrpc":"2.0","id":"parity-get-1","method":"tools/call","params":{"name":"get_generated_tool","arguments":{"id":"fcd77d82-3fe5-4abb-a633-e8f725abb6ce"}}}' \
  | python3 -c 'import sys,json; data=json.load(sys.stdin); tool=data["result"]["output"]["tool"]; print(json.dumps({"surface":"mcp","status":data["result"]["output"]["status"],"id":tool["id"],"version":tool["version"],"headline":tool["copy"]["headline"],"hasHtmlField":"html" in tool,"historyCount":len(tool["history"]),"brandVerdict":tool["brandFidelity"]["verdict"]}, indent=2))'
```

Observed parity summary:

```json
[
  {
    "surface": "cli",
    "status": "success",
    "id": "fcd77d82-3fe5-4abb-a633-e8f725abb6ce",
    "version": 1,
    "headline": "See Your BMI in Seconds — No Signup Required",
    "hasHtmlField": false,
    "historyCount": 0,
    "brandVerdict": "warn"
  },
  {
    "surface": "rest",
    "status": "success",
    "id": "fcd77d82-3fe5-4abb-a633-e8f725abb6ce",
    "version": 1,
    "headline": "See Your BMI in Seconds — No Signup Required",
    "hasHtmlField": false,
    "historyCount": 0,
    "brandVerdict": "warn"
  },
  {
    "surface": "mcp",
    "status": "success",
    "id": "fcd77d82-3fe5-4abb-a633-e8f725abb6ce",
    "version": 1,
    "headline": "See Your BMI in Seconds — No Signup Required",
    "hasHtmlField": false,
    "historyCount": 0,
    "brandVerdict": "warn"
  }
]
```

Verdict: **PASS** for read parity across CLI, REST, and MCP.

## Final verdict

### What worked live

- App loaded `.env.local`
- Real brand ingest via CLI succeeded
- Real tool generation via MCP succeeded
- REST `GET /api/tools/:id` succeeded
- CLI `tools list` succeeded
- Cross-surface parity for `get` matched across CLI / REST / MCP

### What failed live

- REST in-place revision consistently failed after ~`187.6s` with:
  - HTTP `400`
  - `Tool revision took too long to finish within the current request budget`
  - attempt trace: `1:invalid_html ... | 2:timeout ...`
- Because no version 2 was created, rollback could not be demonstrated and correctly returned:
  - `Could not find that tool/version to restore.`

### Customer-facing conclusion

**Partial pass.** A customer can create a real branded tool today and retrieve/list it across all three surfaces with consistent metadata. **However, revise-in-place is not currently reliable enough for production usage, and rollback is blocked downstream of that failure.**
