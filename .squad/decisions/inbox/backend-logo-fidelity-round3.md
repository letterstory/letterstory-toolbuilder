# Backend decision — logo fidelity round 3

## Context

Re-investigated the recurring logo/header fidelity failures for `mailchimp.com` and `doordash.com` after the earlier prompt-cap and mode-aware logo-selection fixes.

## Evidence

- Raw production ingestion payloads saved under `artifacts/production-brand-ingest/`.
- Live pre-fix generated HTML saved under `artifacts/live-generation-before/`.
- Live post-deploy verification artifacts saved under `artifacts/live-generation-after/`.

## Definitive root cause by domain

### Mailchimp

- Context.dev **does return usable real logo assets** today.
- `artifacts/production-brand-ingest/mailchimp-com-contextBrand.json` shows multiple `type: "logo"` assets, and the parsed production `brandSnapshot` includes an inline `logoDataUri`.
- The backend passed that logo through, but the model still generated a custom drawn header mark instead of rendering the supplied asset. `artifacts/live-generation-before/mailchimp-com.html` proves this: the header contains inline SVG, not the provided data URI asset.
- Root cause: **model non-compliance downstream of a correct asset handoff**. Prompt-only guidance was not reliable enough.

### DoorDash

- Context.dev **does not return a trustworthy full logo/wordmark** today. `artifacts/production-brand-ingest/doordash-com-contextBrand.json` only contains `type: "icon"` assets.
- Previous fallback behavior still treated icon-only assets as if they were safe brand logos, which encouraged Claude to invent a badge-like faux logo.
- Typography data is noisy upstream: `artifacts/production-brand-ingest/doordash-com-contextStyleguide.json` and `...-contextFonts.json` include both branded `DD Norms` data and generic `Times New Roman`, and the prior parser over-trusted paragraph/body fallback data.
- Root cause: **upstream lacks a safe full logo, and downstream fallback/prompt/parser behavior let Claude invent an icon and drift to serif body type**.

## What changed

1. **Separated logo intent into explicit policies**
   - `exact_asset`: a trustworthy full logo exists and must be rendered exactly.
   - `text_only`: no trustworthy full logo exists, so branding must be text-only with no invented icon.

2. **Improved Context.dev font parsing**
   - Prefer branded/custom UI fonts over generic paragraph fallbacks when styleguide/fonts data disagree.
   - This prevents generic serif fallbacks like DoorDash’s `Times New Roman` from winning over branded UI faces like `DD Norms`.

3. **Strengthened prompt rules**
   - Exact-logo mode now explicitly instructs the model to render the provided asset via `<img>` and forbids redraw/simplification.
   - Text-only mode now explicitly forbids invented badges, icons, mascots, monograms, or faux app-icons.

4. **Added a second-pass brand repair step**
   - If the model ignores the exact logo, invents a graphic for a text-only brand, or drops the required body font, the backend now runs a targeted revision pass.

5. **Added deterministic post-generation enforcement**
   - If the repair pass still fails or remains incomplete, the backend now rewrites the header/CSS itself:
     - exact-logo brands get a deterministic `<img>` header lockup
     - icon-only brands get a deterministic text-only wordmark header
     - missing body-font usage gets a CSS override
- This is the key systemic hardening: **brand fidelity no longer depends solely on Claude obeying the prompt**.

## Validation

- Added unit regressions covering:
  - icon-only brands → `text_only`
  - exact-logo repair behavior
  - deterministic fallback when repair fails
  - branded custom font preference over generic paragraph fallback
- Local validation passed:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`

## Follow-up

- If DoorDash later gets a trustworthy full logo/wordmark from Context.dev, the pipeline should automatically switch from `text_only` to `exact_asset`.
