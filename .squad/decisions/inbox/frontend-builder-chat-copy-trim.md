# Frontend decision: trim new-tool builder chat copy

Date: 2026-09-06
Owner: Frontend

## Changes
1. Header helper copy: removed the redundant "Brand ingestion + hosted iframe" badge and shortened the helper line to a single sentence focused on the required brand-site input and logo/color/font extraction.
2. Generation pipeline card: suppressed the entire section when the panel is fully idle with no active run, no telemetry, no activity steps, and no brand summary; left all other pipeline states unchanged.
3. First-prompt onboarding card: removed the dashed explanatory card entirely to reduce vertical clutter before the first run.
4. Idle status line: shortened the new-tool idle headline above the composer from setup instructions to "Ready when you are." while preserving all other status-line branches.
