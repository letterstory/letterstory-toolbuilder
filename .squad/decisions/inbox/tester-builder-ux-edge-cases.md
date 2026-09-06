### 2026-09-06: Builder UX edge-case verification and regression capture
**By:** Tester
**What:** I verified the merged `/build` full-bleed/history work against a local production server, confirmed two blocking regressions, added failing regression coverage for both domains (Vitest for rollback logic, Playwright script for dropdown stacking), and documented the rest of the edge-case sweep outcomes below.
**Why:** Mir asked for proof, not guesses, before Frontend/Backend own the fixes.

## Environment

- Built locally with `npm run build`.
- Served locally with `npm run start -- --hostname 127.0.0.1 --port 3000`.
- Browser verification used Playwright at realistic desktop widths (`1280x900`, `1440x900`) plus mobile/tablet resize checks.

## Confirmed broken

### 1) Frontend / z-index-stacking bug — version-history dropdown renders under the preview card

**Repro:**
1. Open `/build` on desktop with a tool that has history.
2. Reopen `Secondary Recent Tool For Dropdown Interaction Checks` (short enough that the History button sits on the same row as Edit).
3. Stay on Preview.
4. Open the History dropdown.

**Observed:**
- The dropdown physically overlaps the preview pane.
- At the overlap point, `document.elementFromPoint(...)` returns the preview header text node (`Live preview`), not a descendant of the dropdown.
- Playwright proof from `tests/playwright/builder-history-dropdown-stacking.test.ts` failed with:
  - dropdown rect: `x=567.6..907.6`, `y=137..435.5`
  - preview header card rect: `x=398..1243`, `y=184..242`
  - overlap: `340px x 58px`
  - `topInsideDropdown: false`
  - `topElementText: "Live preview"`

**Why / implicated files:**
- `src/components/tools/builder-topbar.tsx`: dropdown is `absolute ... z-30` under the History button.
- `src/components/tools/builder-preview-canvas.tsx`: the preview header card sits later in the DOM and paints above the dropdown in the overlap region.
- `src/app/(dashboard)/layout.tsx` and `src/components/tools/tool-builder-workspace.tsx`: the new full-bleed desktop shell introduced the `lg:h-dvh` / `lg:overflow-hidden` / split-pane containment that changed how the two panes overlap.
- Computed-style inspection showed **no** `transform`, `filter`, `will-change`, or `isolation` on the relevant ancestors. The notable stacking-context property present on both subtrees is `backdrop-filter: blur(8px)` from the `backdrop-blur` utility; the dropdown's `z-30` is only winning inside its own subtree, not above the preview card's subtree.

### 2) Backend / rollback-version bug — restoring an old version creates a brand-new forward version

**Unit-level proof:**
- `rollbackGeneratedTool()` in both `src/lib/generation/store.file.ts` and `src/lib/generation/store.supabase.ts` still delegates to `updateGeneratedTool(id, contentFromHistoryEntry(target))`.
- `updateGeneratedTool()` increments `version` and prepends the current record into `history`, so restore uses the normal "new revision" path instead of true rollback semantics.

**Direct HTTP repro against local prod server:**
```bash
curl -s -X POST http://127.0.0.1:3000/api/tools/<tool-id>/rollback \
  -H 'Content-Type: application/json' \
  -d '{"version":2}'
```

**Observed summarized response:**
```json
{
  "status": "success",
  "version": 8,
  "prompt": "Stress history tool v2",
  "historyVersions": [7, 6, 5, 4, 3]
}
```

That proves the current behavior: restoring version 2 from version 7 did **not** return to version 2; it minted version 8 with version-2 content.

**Why / implicated files:**
- `src/lib/generation/store.file.ts` (`rollbackGeneratedTool`, currently calls `updateGeneratedTool(...)`).
- `src/lib/generation/store.supabase.ts` (`rollbackGeneratedTool`, same pattern).
- Shared helpers in `src/lib/generation/store.types.ts` (`contentFromHistoryEntry`, `buildHistoryEntry`, `MAX_HISTORY_ENTRIES`) define the data that gets re-saved via the normal update path.

## Regression coverage added

### Failing now by design
- `tests/unit/store-file.test.ts`
  - `fileToolStore > does not create a brand-new forward version when rolling back`
  - **Current failure:** actual version is `4`, expected `1`.
- `tests/unit/store-supabase.test.ts`
  - `supabaseToolStore > does not create a brand-new forward version when rolling back`
  - **Current failure:** actual version is `4`, expected `1`.
- `tests/playwright/builder-history-dropdown-stacking.test.ts`
  - Run with `node --import tsx tests/playwright/builder-history-dropdown-stacking.test.ts`
  - **Current failure:** overlap point is owned by the preview pane (`Live preview`) instead of the dropdown.

## Edge cases explicitly checked and outcome

### Version-history dropdown
- **Zero history / v1 only:** PASS. History button is truly disabled (`disabled === true`), no ghost dropdown.
- **Many versions (> `MAX_HISTORY_ENTRIES` including current):** PASS. Internal scroll region is `overflow-y:auto`; measured `scrollHeight 415 > clientHeight 320`; no page-level horizontal overflow.
- **History open → recent tools open:** PASS. Opening recent tools closes history first; both do not stay open together.
- **History click while `requestState !== idle`:** PASS. With a delayed mocked update request, the History button had `disabled === true` and could not be opened.
- **Rapid double-click Restore:** PASS under real Playwright double-click. I only got one rollback request. (A same-tick programmatic DOM double-dispatch can queue two, but I did not classify that as a real user-facing bug.)
- **Click outside to close:** PASS.
- **Long tool/project names:** PASS for layout containment. No page-level horizontal overflow; long labels wrap/truncate without blowing out the viewport.
- **After successful restore:** MIXED. UI stays internally consistent (dropdown closes; topbar version label, iframe `?v=...`, and Dashboard badge/history all update together), but the underlying version number is wrong because of the backend rollback bug.
- **Keyboard:** PARTIAL. Tabbing reaches restore buttons, but there is no focus trap and `Escape` does **not** close the dropdown. Not routing this as a blocker today, but it is a real accessibility gap.
- **Recent-tools dropdown shares same stacking bug?:** NO. Its panel stays at `x=20..340`, left of the preview pane (`preview left = 398`), so it does not overlap the preview card in the tested layout.

### Full-bleed layout / independent scroll
- **Very short conversation (reopened tool = 2 messages):** PASS. Layout looked stable; no empty-shell breakage.
- **Long conversation (20+ synthetic messages via repeated failed update submissions):** PASS. Left chat scroller grew to `scrollHeight 3135`, stayed independently scrollable, composer stayed visible (`bottom 816 < viewport 900`), preview header top stayed fixed at `195px`, and page `scrollY` remained `0` on desktop.
- **Switch Preview ↔ Dashboard mid-scroll:** PASS. Left-panel scroll position stayed intact in my stress run (`scrollTop` preserved at `2827`).
- **Resize across `lg` breakpoint:** PASS. Desktop returned to bounded panes (`bodyScrollHeight = viewport`, desktop page scroll `0`); mobile/tablet returned to natural page scroll (`bodyScrollHeight 2581`, `windowScrollY` changed as expected) and recovered cleanly when resized back to desktop.
- **Preview/right pane anchored on desktop:** PASS, confirmed by unchanged preview header position while left pane scrolled.
- **Mobile layout:** PASS in the tested flows. Natural page scroll worked; I did not hit clipping from the shared `lg:` rules.
- **`/brand` page on shared shell:** PASS. Rendered normally at mobile width; no clipping or overflow regression observed.
- **Toast/status hidden behind preview canvas:** NOT REPRODUCED. Status UI stayed in the left column and did not overlap the preview pane in the tested states.

## Recommendation for Backend (non-binding)

My test asserts the minimum product requirement: restoring version `N` should not mint `N+1`. If Backend wants extra audit history for restores, that should be represented separately from the customer-visible forward version number.

## Files I touched

- `tests/unit/store-file.test.ts`
- `tests/unit/store-supabase.test.ts`
- `tests/playwright/builder-history-dropdown-stacking.test.ts`

I also created temporary `.data/tools/*.json` seed records for local browser reproduction and removed them after testing.
