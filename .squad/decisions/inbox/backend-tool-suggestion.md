### 2026-09-05: Brand-aware tool suggestion flow uses the existing brand snapshot plus an Anthropic ideation pass
**By:** Backend
**What:** `/api/tools/suggest` now reuses `pullBrandProfile()` for Context.dev ingestion, then asks Anthropic for 3-5 single-purpose embeddable tool ideas tailored to the site's actual business. The build UI surfaces those suggestions only in the empty pre-build state, and selecting one pre-fills the tool name and prompt without auto-submitting.
**Why:** This keeps suggestions aligned with the same brand context the generator already trusts, avoids decorative dead-end controls, and preserves the product's plain-language prompt-first workflow while lowering the blank-page burden for customers who do not know what to build.
