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
