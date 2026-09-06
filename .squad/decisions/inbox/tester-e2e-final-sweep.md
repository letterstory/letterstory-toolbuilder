### 2026-09-06: Final E2E sweep found a rollback→brand-edit regeneration failure
**By:** Tester
**What:** Confirmed a real end-to-end regression in the editable Brand snapshot flow when exercised in the combined rollback/version-history path: the UI records a successful brand-edit regeneration and bumps the visible version, but the regenerated hosted preview can ignore both the requested colors and the requested font, leaving the stored HTML on the old palette/system font while the workspace copy claims the new brand edit is live.
**Why:** This was reproduced twice in realistic combined flows on `/build` after rollbacking an older version, using the new dashboard Brand editor, version-history dropdown, suggestion chips, and hosted preview together.

## Repro flow
1. Run `npm run dev` and open `/build`.
2. Reopen a versioned tool with history. In my run this was `Tester Combined Flow Seed 1788712129200` (`ae30576e-e553-4630-a256-66afad664fd8`).
3. Open **Version history** and restore **Version 1**. Confirm the topbar changes to `v1` and the preview iframe URL changes to `/t/ae30576e-e553-4630-a256-66afad664fd8?v=1`.
4. Use a suggestion chip (`Add input validation`) so the combined chat state is active, then switch to **Dashboard** → **Brand snapshot** → **Edit**.
5. Apply a brand edit. I reproduced it with both of these updates:
   - Attempt A: primary `#009966`, background `#FFF0C2`, font `Merriweather`
   - Attempt B: primary `#CC0066`, background `#E0F7FF`, font `Poppins`
6. Wait for the success state. The workspace reports success and bumps the visible version to `v2`.
7. Open the hosted preview directly at `/t/ae30576e-e553-4630-a256-66afad664fd8?v=2` (or inspect `.data/tools/ae30576e-e553-4630-a256-66afad664fd8.json`).

## Expected
- The regenerated `v2` preview should visually use the requested colors and font.
- If fonts are still broken, we at least expected the requested font family to be present/imported in the generated HTML so we could characterize the known font gap precisely.

## Actual
- Both updates returned **200 success** from `POST /api/tools/generate` and the workspace assistant said the new brand tokens were live.
- The visible version still incremented/rolled back correctly, but the hosted preview content did **not** adopt the requested colors or font.
- This is broader than the known note about “font imported but computed family still resolving to system UI”:
  - In these reproductions, the requested fonts were **not present in the stored/generated HTML at all**.
  - The preview also kept the **old brand colors** instead of the requested ones.

## Concrete proof
### Attempt A (Merriweather / `#009966` / `#FFF0C2`)
- `POST /api/tools/generate` response headers:
  - `x-tool-generation-attempts: 1:success:6815/210000`
  - `server-timing: total;dur=18659, brand;dur=0, build;dur=18621, advisory;dur=2698`
- Success copy shown in the UI:
  - `Version 2 of Tester Combined Flow Seed 1788712129200 is ready... Swap in Acme Labs' signature green, warm background, and Merriweather typography across every element...`
- But the response body already showed stale tokens:
  - `brandSnapshot.fonts: ["Inter"]`
  - generated HTML font-family was the system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`)
  - generated HTML brand variables were still `#5A3FF2 / #F97316 / #FFF7ED`
- Playwright computed styles on `/t/ae30576e-e553-4630-a256-66afad664fd8?v=2`:
  - `body.fontFamily = -apple-system, "system-ui", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
  - `heading.fontFamily = -apple-system, "system-ui", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
  - `button.fontFamily = -apple-system, "system-ui", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
  - `button.backgroundColor = rgb(249, 115, 22)`
  - `hasMerriweatherText = false`

### Attempt B (Poppins / `#CC0066` / `#E0F7FF`)
- Stored file after the successful update: `.data/tools/ae30576e-e553-4630-a256-66afad664fd8.json`
- That stored `v2` record still contains:
  - `brandSnapshot.fonts: ["Inter"]`
  - `brandSnapshot.colors.primary: "#5A3FF2"`
  - `brandSnapshot.colors.background: "#FFF7ED"`
  - no `Poppins`, no `#CC0066`, no `#E0F7FF` in the generated HTML
- Playwright computed styles on `/t/ae30576e-e553-4630-a256-66afad664fd8?v=2` after reloading:
  - `body.fontFamily = -apple-system, "system-ui", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
  - `heading.fontFamily = -apple-system, "system-ui", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
  - `button.fontFamily = -apple-system, "system-ui", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
  - `button.backgroundColor = rgb(90, 63, 242)`
  - `hasPoppinsText = false`
  - `styleHasRequestedPrimary = false`
  - `styleHasRequestedBackground = false`

## Scope / impact
- Combined regression path exercised together:
  - rollback to older version
  - version-history dropdown open/restore
  - suggestion chip population
  - dashboard Brand snapshot edit + Apply
  - hosted preview/version history after regeneration
- Rollback/version-number behavior itself looked correct in this pass.
- Dropdown stacking/Escape behavior looked correct in this pass.
- The broken area is the real regeneration result for editable brand changes in this combined flow, with evidence that **at least Merriweather and Poppins both fail**, and colors fail alongside fonts.

## Affected files to inspect
- `src/components/tools/builder-dashboard-panel.tsx`
- `src/components/tools/builder-brand-update.ts`
- `src/components/tools/tool-builder-workspace.tsx`
- `src/lib/generation/orchestrator.ts`
- `src/app/api/tools/generate/route.ts`
