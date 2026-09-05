### 2026-09-04: Prefer porting specific letterstory brand-ingestion logic over direct service integration
**By:** Lead
**What:** Keep toolbuilder's standalone Context.dev client, but port the few superior normalization/persistence ideas from letterstory instead of making toolbuilder call letterstory's org-scoped brand-context API directly right now. The highest-value ports are: (1) keep full logo variant metadata and choose the logo mode-aware instead of collapsing to the first `type=logo`, and (2) preserve Context.dev `fontLinks` / loadability metadata so toolbuilder can distinguish Google-loadable fonts from custom faces and optionally embed/self-host them later. Do **not** invest in direct letterstory API integration until toolbuilder actually has an org model or multiple consumers need one shared cross-product brand cache.
**Why:** The upstream data source is not materially richer at the endpoint level: letterstory PR #1350 pulls the same three Context.dev endpoints for brand/styleguide/fonts that toolbuilder already uses (`/brand/retrieve`, `/web/styleguide`, `/web/fonts`), while toolbuilder additionally calls `/web/scrape/markdown` for reference content. The real differences are in post-processing and storage, not hidden provider coverage. Letterstory stores every logo variant with `mode`, `type`, dimensions, colours, and rehosts them to its own bucket; later consumers choose a mode-appropriate logo and avoid `has_opaque_background` marks. Toolbuilder already ported most of the hard rasterization logic from letterstory's `rehost-logo.ts` into `src/lib/brand/logo.ts`, but it still collapses the provider result too early to a single preferred logo and loses the mode-aware selection layer. Font-wise, letterstory normalizes Next/font hashes and also preserves `fontLinks` as loadable Google/custom font metadata (`google`, `category`, `files`, `fallbacks`); toolbuilder normalizes the hashy names too, but throws away loadability/file-url data and then explicitly forbids remote font URLs in generated tools, so a direct API swap would not by itself fix custom-font fidelity. Direct integration cost is real: `GET/POST /api/organizations/[id]/brand-context` is gated by authenticated user org membership and writes through the service role, not by an existing service-secret path; letterstory's OAuth server supports authorization-code/refresh, not client-credentials, so toolbuilder cannot just mint a machine token. To make toolbuilder call letterstory directly, we'd need new service-to-service auth plus an org/domain mapping story on top of a repo that currently has no org concept. That is a multi-repo coupling project with auth, secret management, API-shape, cache-refresh, and ownership risks. Porting the missing logic locally is far cheaper and addresses the fidelity gap more directly.

#### Findings

- **Context.dev endpoint coverage**
  - letterstory PR #1350 brand import: `/brand/retrieve` + `/web/styleguide` + `/web/fonts`.
  - toolbuilder current ingest: the same three endpoints, plus `/web/scrape/markdown`.
  - Conclusion: letterstory is **not** getting extra logo/font data from additional Context.dev endpoints; any quality edge comes from normalization and persistence layers.

- **Logo handling**
  - letterstory stores **all** logo variants with `mode`, `type`, dimensions, and dominant colours, then rehosts each into its own bucket for CORS-safe downstream rendering.
  - letterstory's render-facing resolver explicitly prefers a logo matching the active mode and skips `has_opaque_background` marks when possible.
  - toolbuilder already imported the hard part of letterstory's canonicalization pipeline (SVG rasterization, ICO decoding, banner rejection), but its normalized profile still promotes one early pick and does not retain mode-aware logo selection as a first-class concept.
  - Net: there is **some** superior logo logic worth porting, but it is local business logic, not evidence that toolbuilder must call letterstory.

- **Font handling**
  - letterstory preserves `fontLinks` metadata and resolves fonts into structured `BrandFontFace` objects with Google/custom classification and weight-to-file URLs.
  - toolbuilder currently keeps mostly font family names plus fallback stacks.
  - However, toolbuilder's generator prompt explicitly bans external font URLs, so even perfect upstream `fontLinks` would not change output fidelity unless toolbuilder also adds a local embed/self-host step or another render-time font strategy.
  - Net: letterstory captures **better font metadata**, but that alone does not justify a service dependency.

- **Auth / integration reality**
  - letterstory's brand-context route is user-session + org-membership gated today.
  - letterstory does have cross-service shared-secret patterns elsewhere (kernel/letterprove), so a headless route is feasible in principle, but it does **not** exist for brand-context today.
  - toolbuilder would also need a stable org/domain mapping into letterstory because `org_brand_profiles` is keyed by `org_id`, and toolbuilder does not currently model org membership.

#### Option assessment

1. **Keep toolbuilder as-is**
   - **Effort:** near-zero.
   - **Risk:** quality risk stays high; known logo/font fidelity misses remain.
   - **Verdict:** acceptable only as a short holding pattern, not as the better architecture.

2. **Port specific superior logic into toolbuilder (recommended)**
   - **Effort:** low-to-medium.
   - **Likely scope:** keep richer logo candidate metadata, add letterstory-style mode-aware selection, preserve `fontLinks`/loadability metadata, and only if needed add a separate font embedding/self-hosting step for custom fonts.
   - **Risk:** contained to one repo; no auth/org coupling; easy rollback.
   - **Verdict:** best cost/benefit.

3. **Direct toolbuilder -> letterstory service integration**
   - **Effort:** medium-to-high, multi-repo.
   - **Required work:** design a new service-auth path (shared secret or equivalent), decide how toolbuilder resolves/owns letterstory `org_id`, define cache-refresh semantics, deploy/provision secrets in both apps, and accept runtime coupling to letterstory availability and auth.
   - **Risk:** architectural coupling is much larger than the fidelity gain currently demonstrated.
   - **Verdict:** only worth it if toolbuilder later becomes org-aware or several products truly need one shared persisted brand-profile service.

#### Recommendation

Stay standalone. Port letterstory's remaining **local** advantages into toolbuilder — especially mode-aware logo selection and richer font metadata/loadability tracking — but do **not** route toolbuilder through letterstory's org-scoped API now. If later we need a shared cross-product brand-profile platform, revisit a dedicated service-authenticated brand service then; today's fidelity bugs do not justify that dependency jump.
