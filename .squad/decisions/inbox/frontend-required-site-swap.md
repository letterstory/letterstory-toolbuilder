### 2026-09-06: New-tool builder form now requires brand site and treats tool name as optional
**By:** Frontend
**What:** Updated the builder UI so new tool creation marks Brand site as required, removes the required tool-name affordance, and blocks client-side submit only when a new build is missing a normalized site URL. Existing tool revisions keep the site field non-required in the form chrome.
**Why:** Backend changed new-tool generation semantics to require `siteUrl` while allowing blank `projectName`, so the frontend now matches the API contract without forcing revisions of older tools to add missing brand metadata.

### 2026-09-06: Frontend validation stopped at backend-owned test failures outside UI scope
**By:** Frontend
**What:** Left `tests/unit/tool-generation.test.ts` untouched even though `npm test -- --run` currently fails there, because the failures are in backend-owned generation semantics and shared API expectations rather than the two frontend files changed here.
**Why:** The failing assertions are consistent with the parallel backend contract swap in `src/lib/surfaces/tools.ts` / `src/lib/generation/orchestrator.ts` (for example, old empty-prompt / missing-name expectations now colliding with missing-site validation), so editing those tests from the frontend lane would cross ownership boundaries.
