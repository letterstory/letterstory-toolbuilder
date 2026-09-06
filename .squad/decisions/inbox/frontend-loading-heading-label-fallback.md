### 2026-09-06: Remove duplicate "your" fallback in generation takeover heading
**By:** Frontend
**What:** Changed the preview-canvas loading heading to use an empty-string fallback when both `brandName` and `projectName` are missing, and render the optional label plus trailing space only when a real label exists.
**Why:** Tool names are now optional more often, so the old `"your"` fallback produced the broken copy "Building your your tool" during generation. Conditional label rendering keeps the heading natural in both labeled and unlabeled states.
