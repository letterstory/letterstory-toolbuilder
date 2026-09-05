### 2026-09-05: Ramp UX rules are now first-class generation constraints

**By:** Backend
**What:** Encoded the Ramp benchmark's four UX rules directly into the HTML-generation system prompt with concrete examples, and added lightweight post-processing that can move a marked brand CTA after the tool/result when generated HTML opts into `data-letterstory-tool`, `data-letterstory-result`, and `data-letterstory-brand-cta` markers.
**Why:** Generated tool HTML is served raw from `/t/[id]`, so the builder dashboard is not the right enforcement point. Prompt rules now set the design bar, and deterministic CTA ordering is only feasible for markup that includes the explicit marker contract; anything outside that contract still relies on the prompt.
