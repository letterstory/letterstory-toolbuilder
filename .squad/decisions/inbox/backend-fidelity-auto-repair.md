### 2026-09-06: Route inline brand-fidelity failures through the existing repair pass
**By:** Backend
**What:** The generation pipeline now runs the inline `brandFidelity` advisory check before the single brand-repair decision, then feeds any non-pass `notes` into `maybeRepairBrandPresentation()` as an extra repair reason so the existing one-shot correction pass can respond to LLM-detected drift as well as the deterministic logo/font checks.
**Why:** Brand QA was previously advisory-only even when it clearly identified palette or styling drift. Folding that critique into the existing budget-gated repair path keeps the one-pass safety model, preserves user-visible warnings, and avoids adding Firecrawl latency to the synchronous generation request.

### 2026-09-06: Brand-repair regeneration timeout must be long enough for full HTML rewrites
**By:** Backend
**What:** `BRAND_REPAIR_TIMEOUT_MS` now uses a realistic 180-second ceiling instead of 15 seconds, while still being clipped by `availableRepairBudgetMs` so the repair pass cannot exceed the 280-second app target or 300-second nginx ceiling.
**Why:** The repair path calls the same `requestToolHtml()` full-document generation flow as initial tool creation, so a 15-second hard cap guaranteed live timeout failures before any fidelity-driven or deterministic repair could complete. Raising the ceiling fixes the functional bug without relaxing the overall budget guardrail.
