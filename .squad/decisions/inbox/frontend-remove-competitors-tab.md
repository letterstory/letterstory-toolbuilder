### 2026-09-04: Remove competitors workspace and compare backend
**By:** Frontend
**What:** Removed the Brand Workspace's Competitors tab, deleted the unused `/api/brand/compare` route, and stripped competitor-comparison logic/tests so brand ingestion and validation remain the only supported brand-analysis flows.
**Why:** Mir requested retiring the Claude-vision competitor visual-similarity feature, and repo-wide caller checks confirmed the compare route was only used by that tab.
