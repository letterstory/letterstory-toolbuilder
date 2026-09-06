### 2026-09-06: Topbar theme shortcut opens dashboard brand editing
**By:** Frontend
**What:** Lifted the Brand snapshot edit-open state into `tool-builder-workspace.tsx`, passed it down as a controlled prop to `builder-dashboard-panel.tsx`, and added a topbar `Theme` shortcut in `builder-topbar.tsx` that switches to Dashboard and opens the brand editor in one click.
**Why:** The editable Brand snapshot shipped inside Dashboard, but the workflow was buried behind a manual tab switch plus an extra Edit click. The shortcut matches existing tool-gated topbar controls and preserves the dashboard panel's existing cancel/apply behavior while making theme editing directly reachable.
