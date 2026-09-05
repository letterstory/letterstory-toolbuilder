### 2026-09-05: Deterministic real-logo headers now get a neutral contrast container
**By:** Backend
**What:** Exact-asset logo lockups injected by `brand-enforcement.ts` now render inside a white rounded container with a subtle border/shadow, even if the generated page keeps a dark or brand-colored `<header>` background.
**Why:** Live Stripe generation proved the selected Context.dev logo asset was the correct light-mode wordmark, but the generated CSS still applied `header { background: var(--accent); }` with a near-black accent. The bug was not layout or variant sizing; it was that header background choice ignored the embedded logo's contrast needs, so a deterministic neutral container is the safest cross-brand fix without fragile PNG color analysis.
