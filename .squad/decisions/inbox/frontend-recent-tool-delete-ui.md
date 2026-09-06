### 2026-09-06: Recent tools dropdown now supports confirmed delete actions
**By:** Frontend
**What:** I added a delete affordance to each Recent tools row in `BuilderTopbar`, threading a new `onDeleteRecent(tool)` callback down from `ToolBuilderWorkspace`. The dropdown rows are now a rounded flex container with the reopen action and delete action as sibling buttons, so the delete control is no longer nested inside the row click target. For confirmation, the delete button uses an inline two-step state: first click arms that specific row and swaps the control to a destructive `Confirm` button; second click issues `DELETE /api/tools/{id}`. On success the recent list is updated locally, the status message reports the outcome, and deleting the currently active tool resets the workspace back to the existing “new tool” state.
**Why:** Backend shipped delete support, but users still had no UI path to remove stale generated tools. Keeping the confirmation inline avoids adding a new modal primitive just for this flow, stays lightweight inside the existing popover, and the sibling-button layout prevents accidental reopen/navigation when the destructive action is clicked.

Validation:
- `npx tsc --noEmit` ✅
- `npm test -- --run` ✅ (246 passed, 1 skipped)
- Manual Playwright check ✅
  - First delete click changed the action to a confirm state and did **not** issue a delete request
  - Confirm click sent `DELETE /api/tools/{id}` and removed the row from the Recent tools list
  - Deleting the currently active tool reset the workspace to the default “New tool” state
  - Delete clicks did not trigger the row reopen action
