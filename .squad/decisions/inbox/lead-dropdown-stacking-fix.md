### 2026-09-06: Builder dropdown stacking fix above preview canvas
**By:** Lead
**What:** Fixed the builder workspace stacking so the topbar and its dropdown overlays paint above the preview pane by isolating the workspace stacking context and giving the topbar sibling a higher z-layer than the preview grid; also added Escape-to-close for both the version-history and recent-tools dropdowns.
**Why:** Tester proved the version-history panel was trapped inside a local stacking context created by `backdrop-blur`, so its `z-30` could still render underneath the preview card after the full-bleed desktop layout change. Raising the topbar subtree above the preview subtree at their shared parent is the smallest robust fix for this codebase and preserves the existing hand-rolled dropdown behavior.
