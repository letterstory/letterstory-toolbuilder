# Squad Decisions

## Active Decisions

### 2026-09-04: Toolbuilder is stateless for now

**By:** Lead (relaying Mathew's guidance, captured by Squad Coordinator)
**What:** No persistent storage of generated tool output for now — the tool generates output on the fly. Extraction/storage of tool output may be added later.
**Why:** Mathew's explicit guidance — avoid building in persistent data until there's a clear need.

### 2026-09-04: porter.yaml `ingressAnnotations` is currently unsynced with the live dashboard

**By:** Infra (captured by Squad Coordinator)
**What:** `porter.yaml`'s `ingressAnnotations` block (nginx proxy timeouts) does not reliably propagate via CI's `porter apply`. The live, authoritative config for ingress timeouts is currently set directly via the Porter dashboard (Services → web → Advanced → Custom NGINX annotations), currently `proxy-connect-timeout: 60`, `proxy-read-timeout: 300`, `proxy-send-timeout: 300`.
**Why:** Confirmed via live 504 timing tests and dashboard inspection — the repo's porter.yaml (180s) does not match the live 300s dashboard values. Needs investigation before config-as-code can be treated as authoritative for this field.

### 2026-09-04: Generated-tool file-store fallback now degrades to in-memory on read-only hosts

**By:** Backend
**What:** When Supabase is not configured and the local filesystem is read-only (as on the current Porter container at `/app`), generated-tool storage now falls back from `.data/tools` files to process-memory instead of crashing the request.
**Why:** Live production generation was succeeding far enough to hit storage, but the file-backed fallback could not `mkdir /app/.data`. In-memory fallback preserves the stateless current-product posture and keeps real customer generations working until a durable store is configured in production.

### 2026-09-04: Generation smoke tests take base URL as runtime input

**By:** Tester
**What:** The reusable `/api/tools/generate` smoke test reads the target origin from `TOOL_GENERATOR_BASE_URL` or `--base-url=...` and defaults to `http://localhost:3000` for local dev.
**Why:** The authoritative deployed domain is not source-controlled in this repo, but the same Gymshark/BMI verification path needs to run unchanged against local, staging, and production environments.

### 2026-09-04: Production verification uses the current Porter URL and a 300-second edge budget

**By:** Squad Coordinator, Backend, and Tester
**What:** The current production deployment for live verification is `https://web-22301-57c6c7ab-4p0z458q.onporter.run`. The branded generation path now budgets roughly 160–210 seconds for the primary Anthropic generation call, runs advisory generation work in parallel, emits structured `Server-Timing` diagnostics, and depends on the live 300-second nginx ingress ceiling to preserve enough end-to-end time for real branded runs.
**Why:** Production failures were caused first by an app-level 120-second Anthropic timeout that was too tight for branded generation and then by a read-only-filesystem crash in the no-Supabase file fallback. After trimming the main prompt payload, parallelizing advisory calls, and switching the read-only fallback to in-memory storage, the live Gymshark BMI Calculator smoke test completed successfully in 70.6 seconds end-to-end.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
