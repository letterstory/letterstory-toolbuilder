### 2026-09-05: Visual brand-match QA runs asynchronously after tool generation
**By:** Backend
**What:** Generated tools now persist a `visualCongruence` field and queue a Playwright + Claude vision pass that compares a screenshot of the live brand site against a screenshot of the generated tool for overall style congruence.
**Why:** Checklist-style token validation (`brandFidelity`) was still letting tools pass while feeling like a different company. Running the screenshot comparison after the initial response preserves the live generation budget while still surfacing gestalt-level brand-drift risks in the dashboard and API.
