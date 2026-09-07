## Backend: auto-title extraction + branded header alignment

### What changed

1. **Blank-name tools now resolve a real title from generated HTML**
   - The generation orchestrator now tracks `needsAutoTitle` explicitly for new tools and revisions.
   - Blank-name prompts now tell the model to generate a concise 3–6 word, brand-specific `<title>` instead of silently inheriting `"Untitled tool"`.
   - Provided tool names still get a hard instruction to appear verbatim in `<title>`.
   - After HTML generation, backend code extracts `<title>` with regex/string post-processing in `brand-enforcement.ts`, normalizes it, and accepts it only when it is non-empty, under 80 chars, and not literally `"Untitled tool"`.
   - The resolved title is now used for the persisted `projectName`, the deterministic branded header, and supporting-copy generation when available.
   - Safe fallback remains unchanged: if extraction fails, generation still succeeds with `"Untitled tool"`.

2. **Branded header now uses the same outer alignment contract as generated content**
   - The deterministic header now renders an inner wrapper (`.ls-brand-verified-header__inner`) with:
     - `max-width: 72rem`
     - `margin: 0 auto`
     - `padding: 0 1.5rem`
   - The Claude HTML prompt now requires the tool body content to use exactly one outer container with that same max-width/padding contract and forbids competing top-level left offsets.
   - This gives both the injected header and model-authored body content a shared, deterministic left edge instead of leaving alignment entirely to model luck.

### Why

- Users leaving the name blank were seeing the literal saved/rendered title `"Untitled tool"`, despite product expectations that the system would title it.
- Branded tools could visually look broken because the injected header had no shared layout contract with the model-generated page body.

### Residual risk / limitation

- Live end-to-end visual verification was **not** possible from process env because `ANTHROPIC_API_KEY` was not available there, and `.env` files were not inspected.
- The alignment fix is stronger and partly deterministic now, but the body wrapper still depends on model compliance; the new header wrapper and prompt contract together are the safety net.
