### 2026-09-05: Mailchimp serif fallback guard
**By:** Backend
**What:** Force unresolved heading font fallbacks back to the standard sans-serif stack whenever the brand UI/body identity is non-serif, and scrub any lingering serif font-family declarations from generated CSS.
**Why:** Prompt guidance alone still allowed LLM-authored serif heading rules to leak through for Mailchimp. Deterministic post-processing closes that gap even when the model emits its own heading CSS.
