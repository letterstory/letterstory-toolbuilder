# Backend — History

## Project Context

- **Project:** letterstory-toolbuilder (Next.js + TypeScript, deployed on Porter)
- **Current focus:** Landing pages / "Landings" — branded micro-tool generation. Recent fixes: URL normalization UX, CardHeader layout, Porter nginx ingress 504 timeout (raised to 300s via dashboard).
- **User:** MirRaonaq
- **Team hired:** 2026-09-04

## Notes

(Append learnings, decisions affecting this role, and cross-agent context here.)

📌 Team update (2026-09-04T21:43:38.984-04:00): A compatibility-layer implementation plan (accept optional `brandContext`/`brandSnapshot` input, map to the existing snapshot shape, prefer upstream data over Firecrawl, keep Firecrawl fallback) is queued and awaiting Mir's approval — see `decisions.md` for the full plan when picked up.

📌 Team update (2026-09-04T22:23:35.396-04:00): The Context.dev cutover cycle is closed out — full Firecrawl replacement landed, the six-domain production parity retest passed, the Airbnb palette regression was fixed live, and Fact Checker closed the effort as validated-with-known-issues.
