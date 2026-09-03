# letterstory-toolbuilder

letterstory-toolbuilder is the Phase 1 codebase for Letterstory's hosted branded generation platform. A customer describes a useful embeddable micro-tool in plain language, Letterstory pulls brand context from the customer's existing site, a coding agent generates the tool's UI and logic, and the finished runtime is hosted by Letterstory for iframe embedding on the customer's site.

This repository intentionally starts with scaffold-only foundations for the shared platform pieces that Phase 1 needs first: gated brand ingestion, tool-generation orchestration, and Porter deployment integration. The actual Firecrawl, coding-agent, and Porter implementations are follow-up work once credentials, account access, and the remaining product contracts are finalized.

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
- `src/lib/brand/` — Firecrawl-facing brand ingestion stubs with config gating
- `src/lib/generation/` — tool-generation orchestration contract stubs
- `src/lib/deploy/porter/` — Porter deployment stubs with config gating
- `src/lib/platform/` — shared scaffold status helpers surfaced in the app
- `tests/unit/` — focused unit tests for the stubbed platform contracts
