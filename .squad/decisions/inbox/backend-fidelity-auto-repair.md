### 2026-09-06: Route inline brand-fidelity failures through the existing repair pass
**By:** Backend
**What:** The generation pipeline now runs the inline `brandFidelity` advisory check before the single brand-repair decision, then feeds any non-pass `notes` into `maybeRepairBrandPresentation()` as an extra repair reason so the existing one-shot correction pass can respond to LLM-detected drift as well as the deterministic logo/font checks.
**Why:** Brand QA was previously advisory-only even when it clearly identified palette or styling drift. Folding that critique into the existing budget-gated repair path keeps the one-pass safety model, preserves user-visible warnings, and avoids adding Firecrawl latency to the synchronous generation request.
