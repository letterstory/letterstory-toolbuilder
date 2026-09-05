### 2026-09-05: Remove example prompt chips from the Build page
**By:** Frontend
**What:** Deleted the clickable example prompt chip row above the primary "Generate tool" action in `src/components/tools/tool-builder-workspace.tsx` and reset the tool-description textarea to start empty instead of prefilled from a canned example.
**Why:** Mir requested a cleaner Build-page form without the three canned prompt chips. Removing the chip row also removes the only remaining dependency on the example-prompt array, so the UI no longer advertises starter prompts and the layout stays clean with the existing field spacing.
