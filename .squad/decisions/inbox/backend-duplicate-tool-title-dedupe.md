### 2026-09-06: Deterministic removal of duplicate generated tool titles
**By:** Backend
**What:** Brand enforcement now removes the first heading inside `<main>` when its text matches the project name after normalization, preserving the branded verification header and any surrounding supporting copy. The HTML-generation prompt was also tightened to tell the model not to restate the project name as its own top-level heading inside the tool document.
**Why:** The branded compliance header is authoritative and must stay, while the repeated hero `<h1>` directly below it made every embedded tool render the project name twice. A deterministic post-processing safeguard is more reliable than prompt compliance alone and keeps the wanted descriptive copy above the tool card intact.
