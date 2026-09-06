### 2026-09-06: Route inline brand-fidelity failures through the existing repair pass
**By:** Backend
**What:** The generation pipeline now runs the inline `brandFidelity` advisory check before the single brand-repair decision, then feeds any non-pass `notes` into `maybeRepairBrandPresentation()` as an extra repair reason so the existing one-shot correction pass can respond to LLM-detected drift as well as the deterministic logo/font checks.
**Why:** Brand QA was previously advisory-only even when it clearly identified palette or styling drift. Folding that critique into the existing budget-gated repair path keeps the one-pass safety model, preserves user-visible warnings, and avoids adding Firecrawl latency to the synchronous generation request.

### 2026-09-06: Brand-repair regeneration timeout must be long enough for full HTML rewrites
**By:** Backend
**What:** `BRAND_REPAIR_TIMEOUT_MS` now uses a realistic 180-second ceiling instead of 15 seconds, while still being clipped by `availableRepairBudgetMs` so the repair pass cannot exceed the 280-second app target or 300-second nginx ceiling.
**Why:** The repair path calls the same `requestToolHtml()` full-document generation flow as initial tool creation, so a 15-second hard cap guaranteed live timeout failures before any fidelity-driven or deterministic repair could complete. Raising the ceiling fixes the functional bug without relaxing the overall budget guardrail.

### 2026-09-06: Brand enforcement now pins body text to the authoritative brand text token
**By:** Backend
**What:** The managed brand-enforcement stylesheet now applies `color: var(--ls-brand-color-text) !important` on `body` and makes form controls inherit that text color, so the final served HTML cannot quietly fall back to an accent/near-black body color after repair.
**Why:** Live Stripe verification showed that the longer repair timeout let the corrective pass finish, but the resulting document could still keep non-authoritative body text color in its own CSS. Deterministic post-enforcement closes that gap and provides a verifiable before/after fix in the final HTML.

### 2026-09-06: Refresh brand-fidelity reporting after a successful repair
**By:** Backend
**What:** When a fidelity-driven repair succeeds, the generator now runs one post-repair `requestBrandFidelityCheck()` against the repaired HTML, replaces the response's `brandFidelity` value with that fresh verdict, and removes the stale warning entirely if the repaired tool now passes. If there is not enough time left for the re-check, the response explicitly says the fix was applied but not re-verified instead of surfacing stale pre-repair notes. The fidelity-review excerpt now also preserves the managed `data-letterstory-brand-enforcement` style tag when the HTML is large, so the re-check can see deterministic post-processing like enforced body text color.
**Why:** Live verification showed the repair path could fix the actual HTML while the API response still claimed the old failure, which misled reviewers. A single budget-gated post-repair re-check keeps the one-pass repair model while making the reported QA state match the delivered artifact, and carrying the managed enforcement CSS into the truncated review payload prevents the checker from missing the final applied fix on large documents.

### 2026-09-06: Deterministic color verification overrides contradictory LLM recheck color claims
**By:** Backend
**What:** After a fidelity-driven color repair, the generator now deterministically verifies the repaired HTML contains the declared brand color tokens and that body text uses the brand text color when that token was part of the critique. If that deterministic check passes, contradictory color-mismatch language from the post-repair LLM recheck is suppressed, while any remaining non-color warning text (for example font fallback) is still surfaced.
**Why:** Live Stripe verification showed the LLM could flip-flop and incorrectly claim the repaired `#000EFF` text token was wrong even though it matched `brandSnapshot.colors.text`. Using the repository's own ground-truth brand tokens for color verification fixes that blind spot without throwing away the LLM recheck for qualitative concerns we still cannot verify deterministically.
