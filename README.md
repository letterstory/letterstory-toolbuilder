# letterstory-toolbuilder

letterstory-toolbuilder is the Phase 1 codebase for Letterstory's hosted branded generation platform. A customer describes a useful embeddable micro-tool in plain language, Letterstory pulls brand context from the customer's existing site, a coding agent generates the tool's UI and logic, and the finished runtime is hosted by Letterstory for iframe embedding on the customer's site.

This repository starts with the shared platform pieces that Phase 1 needs first: real Firecrawl-backed brand ingestion, plus scaffolded tool-generation orchestration and Porter deployment integration. The coding-agent and Porter implementations remain follow-up work once their contracts and access are finalized.

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
- `src/lib/brand/` — Firecrawl-backed brand ingestion with config gating and SSRF-safe URL validation
- `src/lib/generation/` — tool-generation orchestration contract stubs
- `src/lib/deploy/porter/` — Porter deployment stubs with config gating
- `src/lib/platform/` — shared scaffold status helpers surfaced in the app
- `scripts/test-brand-ingestion.ts` — live Firecrawl probe for a small set of representative sites
- `tests/unit/` — focused unit tests for the platform contracts

## Firecrawl brand-ingestion probe

With `.env.local` populated, run:

```bash
npm run brand:probe
```

That script calls the live Firecrawl scrape endpoint against a small set of real sites and prints the extracted logo URLs, colors, fonts, and higher-level branding fields for manual quality assessment.
