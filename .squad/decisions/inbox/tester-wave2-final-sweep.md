# 2026-09-06
**By:** Tester

Ran the final combined local sweep on branch `fix/rollback-and-dropdown-stacking` with `npm run dev` and Playwright MCP.

## Result
All requested branch scenarios passed.

## What I verified
- Chat suggestion chip → edit submission → in-flight state: request entered loading cleanly, composer/Theme/history controls disabled sensibly, no crash/race.
- Topbar **Theme** button from Preview switched to Dashboard and opened Brand snapshot edit mode directly.
- Searchable font picker worked with live search + category filter; selected **Playfair Display** and changed colors to `#7C3AED / #FFF7ED / #1F2937`.
- **Apply** triggered a real regeneration that produced **v3**; rendered tool at `/t/30ed2309-06a9-48d0-8540-293bf0161078?v=3` reflected:
  - `bodyBg = rgb(255, 247, 237)`
  - `bodyColor = rgb(31, 41, 55)`
  - `heading/input/button/paragraph font = "Playfair Display"...`
  - `Submit button bg = rgb(124, 58, 237)`
- Assistant success messages showed real per-message disclosures (`Thought for 58s`, `Thought for 61s`) plus working hover **Revert** actions only on version-producing messages.
- Per-message Revert to **v2** restored visible version directly to **v2** (no forward bump), appended chat acknowledgment, and preserved prior state in history.
- Version-history dropdown rendered above the preview (`topInsideDropdown: true` in DOM overlap check) and Escape closed it.
- Restoring **v1** from the version-history panel also restored the visible version directly to **v1** (no forward bump) while keeping **v2** and **v3** available in history.
- After both rollback paths, chat disclosures and per-message Revert buttons stayed correctly linked (`Revert to version 2`, `Revert to version 3`), and version numbers stayed consistent with topbar/history.
- Dismissing the preview URL bar did not interfere with Theme flow or dropdown behavior.

## Validation
- `npx tsc --noEmit`: clean, no output, exit 0
- `npm test`:
  - `Test Files  23 passed | 1 skipped (24)`
  - `      Tests  203 passed | 1 skipped (204)`
