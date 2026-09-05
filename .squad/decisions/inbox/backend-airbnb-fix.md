### 2026-09-04: Airbnb brand-palette drift came from prompt-level logo/token omission
**By:** Backend
**What:** Tool generation now passes through reasonably sized inline brand logos (up to 18k chars) and explicitly tells Claude to treat Context.dev brand tokens as authoritative, even when they conflict with a famous brand's historical palette.
**Why:** Airbnb's Context.dev snapshot already contained the correct teal/plum colors, but the generation prompt always omitted the inline logo and left enough ambiguity for Claude to invent a legacy red wordmark/header from prior knowledge. Including the canonical inline logo plus stronger token-priority instructions fixes the real failure point without changing Context.dev ingestion itself.
