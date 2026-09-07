### 2026-09-06: Brand prompt now defaults to restrained color usage
**By:** Backend
**What:** Replaced the single color instruction in `buildBrandPrompt()` — `"Use the supplied colors as the header, CTA, and highlight anchors. Ignore any conflicting legacy palette."` — with a five-line rule set:
- default to white/off-white/neutral surfaces with sparing color use unless the detected `background` color itself is clearly saturated and non-neutral
- do not use a solid saturated brand-color fill for the header/hero by default; prefer neutral header surfaces with only a small accent
- keep structural chrome neutral by default; input borders, field labels, helper text, dividers, and secondary text should stay gray/neutral, while full-strength brand color is reserved for one or two focal points
- keep card/panel borders and shadows subtle and neutral by default
- still ignore any conflicting legacy palette

**Why:** The old instruction was too vague and biased the model toward over-applying the primary brand color as a dominant header fill and across form chrome. That matched the YouTube failure pattern from the critique: a solid red header bar that was too dominant, bright blue labels and input borders that clashed with YouTube’s near-monochrome UI, and visually heavy color-outlined containers. Because `buildBrandPrompt()` is reused by both initial generation and the visual-congruence repair pass, fixing it here reduces the same systemic failure mode in both paths.

**Visual verification:** Ran a live `/api/tools/generate` request for `https://youtube.com` using a subscriber-growth estimator prompt, rendered the returned `.tool.html` with Playwright, and inspected the screenshot plus computed styles. After the prompt change, the generated tool used a white header with a thin red top accent instead of a full solid-red header fill; labels rendered in near-black (`rgb(15, 15, 15)`) instead of bright blue; input borders rendered neutral gray (`rgb(208, 208, 208)`); and the main card used a subtle neutral border/shadow instead of a heavy saturated outline. The primary red accent was concentrated on the `Calculate` CTA, with a secondary blue treatment only on the tool title pill, which is materially closer to the critique’s requested restraint than the previous failure pattern.
