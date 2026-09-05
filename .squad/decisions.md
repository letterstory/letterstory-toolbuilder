# Squad Decisions

## Active Decisions

### 2026-09-04: Toolbuilder is stateless for now

**By:** Lead (relaying Mathew's guidance, captured by Squad Coordinator)
**What:** No persistent storage of generated tool output for now — the tool generates output on the fly. Extraction/storage of tool output may be added later.
**Why:** Mathew's explicit guidance — avoid building in persistent data until there's a clear need.

### 2026-09-04: porter.yaml `ingressAnnotations` is currently unsynced with the live dashboard

**By:** Infra (captured by Squad Coordinator)
**What:** `porter.yaml`'s `ingressAnnotations` block (nginx proxy timeouts) does not reliably propagate via CI's `porter apply`. The live, authoritative config for ingress timeouts is currently set directly via the Porter dashboard (Services → web → Advanced → Custom NGINX annotations), currently `proxy-connect-timeout: 60`, `proxy-read-timeout: 300`, `proxy-send-timeout: 300`.
**Why:** Confirmed via live 504 timing tests and dashboard inspection — the repo's porter.yaml (180s) does not match the live 300s dashboard values. Needs investigation before config-as-code can be treated as authoritative for this field.

### 2026-09-04: Generated-tool file-store fallback now degrades to in-memory on read-only hosts

**By:** Backend
**What:** When Supabase is not configured and the local filesystem is read-only (as on the current Porter container at `/app`), generated-tool storage now falls back from `.data/tools` files to process-memory instead of crashing the request.
**Why:** Live production generation was succeeding far enough to hit storage, but the file-backed fallback could not `mkdir /app/.data`. In-memory fallback preserves the stateless current-product posture and keeps real customer generations working until a durable store is configured in production.

### 2026-09-04: Generation smoke tests take base URL as runtime input

**By:** Tester
**What:** The reusable `/api/tools/generate` smoke test reads the target origin from `TOOL_GENERATOR_BASE_URL` or `--base-url=...` and defaults to `http://localhost:3000` for local dev.
**Why:** The authoritative deployed domain is not source-controlled in this repo, but the same Gymshark/BMI verification path needs to run unchanged against local, staging, and production environments.

### 2026-09-04: Production verification uses the current Porter URL and a 300-second edge budget

**By:** Squad Coordinator, Backend, and Tester
**What:** The current production deployment for live verification is `https://web-22301-57c6c7ab-4p0z458q.onporter.run`. The branded generation path now budgets roughly 160–210 seconds for the primary Anthropic generation call, runs advisory generation work in parallel, emits structured `Server-Timing` diagnostics, and depends on the live 300-second nginx ingress ceiling to preserve enough end-to-end time for real branded runs.
**Why:** Production failures were caused first by an app-level 120-second Anthropic timeout that was too tight for branded generation and then by a read-only-filesystem crash in the no-Supabase file fallback. After trimming the main prompt payload, parallelizing advisory calls, and switching the read-only fallback to in-memory storage, the live Gymshark BMI Calculator smoke test completed successfully in 70.6 seconds end-to-end.

### 2026-09-04: Any Context.dev integration into toolbuilder should start as an additive compatibility layer with Firecrawl fallback

**By:** Lead and Fact Checker
**What:** If Mir approves Phase 1, toolbuilder should accept an optional upstream `brandContext` or `brandSnapshot` payload from `letterstory`, map it into toolbuilder's existing generation snapshot shape, prefer that upstream brand data when present, and keep the current `siteUrl -> Firecrawl` ingestion path as fallback and rollback. Do not do a hard cutover or direct cross-repo DB/API dependency as the first move.
**Why:** `letterstory/letterstory#1350` is merged and establishes a Context.dev-backed org-level source of truth for brand context, but the "browser hydration + more accurate than Firecrawl" claim is still unverified for toolbuilder's already validated six-domain generation flow. An additive compatibility boundary preserves the proven Firecrawl path, avoids immediate cross-repo auth coupling, and creates room for a feature-flag/parity phase before any default flip.

### 2026-09-04: Lead directive — full cutover to Context.dev, Firecrawl deprecated

**By:** Squad Coordinator (relaying explicit direction from the Lead/stakeholder, overriding the squad's prior conditional recommendation)
**What:** Toolbuilder will switch brand ingestion completely to Context.dev. Firecrawl is being left behind — not kept as a fallback path. This supersedes the additive-compatibility-layer / feature-flag recommendation above.
**Why:** Explicit instruction from the Lead. The squad's prior concerns (unverified accuracy claim, no parity proof, risk of regressing the freshly-verified 6-domain pipeline) still stand as real risks to actively manage during the cutover — not reasons to block it. Tester will re-run the same 6-domain parity suite against the new pipeline post-implementation so we get real before/after proof instead of anecdote, and Fact Checker will issue a verdict on whether the switch delivered.


### 2026-09-04: Context.dev is now the sole brand-ingestion source in toolbuilder
**By:** Backend
**What:** Toolbuilder now talks directly to Context.dev with `CONTEXT_DEV_API_KEY` and optional `CONTEXT_DEV_BASE_URL` (default `https://api.context.dev/v1`); Firecrawl env vars were removed. `pullBrandProfile()` remains the compatibility seam by mapping Context.dev's `brand/retrieve`, `web/styleguide`, `web/fonts`, and `web/scrape/markdown` responses back into the existing `BrandProfile` shape. Visual-similarity scoring in `/api/brand/compare` is temporarily unavailable because the agreed Context.dev endpoint set does not include a screenshot source, and `/api/brand/validate` now exposes `referenceUrl` from rendered markdown instead of a Firecrawl `screenshotUrl`.
**Why:** The cutover replaced Firecrawl while preserving the downstream brand-profile contract, and the compare/validate surfaces were updated so the product describes Context.dev-backed evidence honestly.

### 2026-09-04: Multi-domain tool generation passed, but brand-fidelity advisories still catch polish drift
**By:** Tester
**What:** Sequential production verification across Gymshark, Stripe, Notion, Allbirds, Airbnb, and Mailchimp all passed `/api/tools/generate` plus `/t/{id}` iframe serving, but Gymshark, Notion, and Allbirds still triggered non-blocking brand-fidelity advisory warnings around font fallback, logo treatment, or generic white background usage.
**Why:** This means the generation/embedding pipeline is broadly healthy and ready for wider smoke coverage, while brand fidelity should still be reviewed as a quality dimension separate from basic pass/fail pipeline health.

### 2026-09-04: Context.dev parity retest preserved functional parity but slightly regressed brand fidelity
**By:** Tester
**What:** Re-ran the six-domain live production suite against the Context.dev-backed pipeline at `https://web-22301-57c6c7ab-4p0z458q.onporter.run`. All 6/6 domains still passed generation plus the `/t/[id]` iframe contract checks (HTTP 200, `text/html`, resize reporter present), overall generation time improved from 477.7s to 443.3s total versus the Firecrawl baseline, and rendered iframe screenshots from the same run were captured under `docs/screenshots/contextdev-cutover/`.
**Why:** The cutover needed an apples-to-apples parity check before the squad treats Context.dev as proven. The retest shows the pipeline is functionally healthy and slightly faster on average, but brand-fidelity outcomes are mixed: Notion improved, Gymshark stayed the same, Stripe/Mailchimp stayed strong, and Airbnb regressed from an advisory pass to a warning because the rendered logo/header used legacy Airbnb red (`#FF5A5F`) instead of the captured teal/plum brand colors. Backend should review that Airbnb-specific drift before we call fidelity strictly improved post-cutover.

### 2026-09-04: Airbnb brand-palette drift came from prompt-level logo/token omission
**By:** Backend
**What:** Tool generation now passes through reasonably sized inline brand logos (up to 18k chars) and explicitly tells Claude to treat Context.dev brand tokens as authoritative, even when they conflict with a famous brand's historical palette.
**Why:** Airbnb's Context.dev snapshot already contained the correct teal/plum colors, but the generation prompt always omitted the inline logo and left enough ambiguity for Claude to invent a legacy red wordmark/header from prior knowledge. Including the canonical inline logo plus stronger token-priority instructions fixes the real failure point without changing Context.dev ingestion itself.

### 2026-09-04: Context.dev cutover is validated with known fidelity issues, not as a blanket accuracy improvement
**By:** Fact Checker
**What:** Verdict: **validated-with-known-issues**. The live six-domain production retest is strong enough to validate the Firecrawl → Context.dev cutover for functional safety/soundness (6/6 generation passes, `/t/[id]` iframe contract preserved, total runtime improved), but it does **not** verify the stronger claim that Context.dev is "more accurate than Firecrawl." That accuracy-superiority claim is now best rated **❌ Contradicted** by the available evidence: fidelity moved slightly worse overall, with one modest improvement (Notion) offset by a clear regression (Airbnb) plus unresolved typography drift on Gymshark/Allbirds.
**Why:** I checked the cited evidence in `docs/tool-builder-domain-tests.md`, Tester's parity memo, and the rendered screenshots under `docs/screenshots/contextdev-cutover/`. For **Notion**, the baseline doc recorded a custom “N” logo warning, while the cutover doc says that warning disappeared; the new screenshot supports that as a **✅ Verified (medium confidence)** improvement because the top branding presents as a full Notion wordmark/header treatment rather than an obvious standalone boxed “N” artifact (`docs/tool-builder-domain-tests.md:31,140`, screenshot `docs/screenshots/contextdev-cutover/notion-so.png`). For **Airbnb**, the regression is **✅ Verified (high confidence)**: the cutover screenshot’s top wordmark/header region is visibly coral-red (matching legacy `#FF5A5F`) while the main card/body uses teal accents, matching the parity retest's finding that the rendered header/logo reverted to old Airbnb red instead of the captured teal/plum palette (`docs/tool-builder-domain-tests.md:33,104,161`, screenshot `docs/screenshots/contextdev-cutover/airbnb-com.png`). Counter-hypothesis considered: improved timing/pass-rate could indicate a healthier system even if fidelity slipped; the evidence supports exactly that. So the cutover should be treated as production-validated **for functional parity and operational health**, but only **with known brand-fidelity issues still open**, not as proof that Context.dev is categorically more accurate than Firecrawl.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
