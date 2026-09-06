# letterstory-toolbuilder

letterstory-toolbuilder is the Phase 1 codebase for Letterstory's hosted branded generation platform. A customer describes a useful embeddable micro-tool in plain language, Letterstory pulls brand context from the customer's existing site, a coding agent generates the tool's UI and logic, and the finished runtime is hosted by Letterstory for iframe embedding on the customer's site.

This repository starts with the shared platform pieces that Phase 1 needs first: real Context.dev-backed brand ingestion, plus scaffolded tool-generation orchestration and Porter deployment integration. The coding-agent and Porter implementations remain follow-up work once their contracts and access are finalized.

## Stack

- Next.js 15 App Router
- React 19
- TypeScript (strict)
- ESLint + Prettier
- Vitest for lightweight unit coverage

## Getting started

1. Copy `.env.example` to `.env.local` and fill in any available values.
2. Install dependencies with `npm install`.
3. Start the app with `npm run dev`.
4. Build and verify with `npm run build`, `npm run lint`, `npm run typecheck`, and `npm run test`.

## Initial scaffold layout

- `src/app/` — minimal app shell and health route
- `src/lib/brand/` — Context.dev-backed brand ingestion with config gating and SSRF-safe URL validation
- `src/lib/generation/` — tool-generation orchestration contract stubs
- `src/lib/deploy/porter/` — Porter deployment stubs with config gating
- `src/lib/platform/` — shared scaffold status helpers surfaced in the app
- [`COMMANDS.md`](./COMMANDS.md) — cross-surface REST + MCP + CLI command index
- `scripts/test-brand-ingestion.ts` — live Context.dev probe for a small set of representative sites
- `tests/unit/` — focused unit tests for the platform contracts

## Context.dev brand-ingestion probe

With `.env.local` populated, run:

```bash
npm run brand:probe
```

That script calls the live Context.dev endpoints against a small set of real sites and prints the extracted logo URLs, colors, fonts, and higher-level branding fields for manual quality assessment.

## Sandboxed tool-logic prototype

A prototype backend execution path now exists at `POST /api/tools/logic-demo/invoke`. The route validates a numeric loan-calculator payload, ensures a tagged Porter sandbox snapshot exists, keeps one warm sandbox alive from that snapshot, and executes real amortization logic inside the sandboxed Node handler.

Example request body:

```json
{
	"principal": 100000,
	"annualRatePercent": 6,
	"termMonths": 360
}
```

The response returns `{ status, output, sandbox }`, where `output` includes cent-rounded payment totals plus the full amortization schedule and `sandbox` exposes the warm sandbox name/snapshot id used for the run.

## Tool-generation smoke test

To exercise the live `/api/tools/generate` endpoint with the current manual-retest payload (`gymshark.com` + `BMI Calculator`), run:

```bash
npm run smoke:generate
```

It defaults to `http://localhost:3000`. To point it at a deployed environment, override the base URL:

```bash
TOOL_GENERATOR_BASE_URL="https://your-deployed-origin" npm run smoke:generate
```

The script prints elapsed time, HTTP status, content type, and a truncated response preview, then exits non-zero on timeouts, non-2xx responses, or non-JSON bodies so it can be reused in CI or release verification.
