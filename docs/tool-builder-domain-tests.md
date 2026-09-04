# Tool Builder Multi-Domain Verification

Date: 2026-09-04  
Production base URL: `https://web-22301-57c6c7ab-4p0z458q.onporter.run`

## What was verified

- Sequential live POSTs to `/api/tools/generate` for 6 real domains
- Extraction of generated tool ids from the JSON success payload (`tool.id`)
- HTTP-level iframe contract verification via GET `/t/{id}`
- `text/html` response type, non-trivial HTML body, and injected resize reporter markers (`letterstory-tool`, `ResizeObserver`)
- Shared embed contract invariants from `src/lib/embed/contract.ts`:
  - sandbox remains `allow-scripts allow-forms allow-popups allow-modals`
  - no `allow-same-origin`
  - listener script still guards on `event.origin` and the shared resize message source

## Summary

6/6 domains passed the full pipeline and iframe serve contract.

Common pattern: generation and serving were consistently successful, but brand-fidelity advisories were stricter than pass/fail. Gymshark, Notion, and Allbirds all produced usable branded tools that passed the pipeline, yet the advisory check still flagged font/logo/background drift worth manual review.

## Results

| Domain | Tool Built | Gen Time | Status | iFrame Serve | Resize Script Found | Good | Bad |
|---|---|---:|---|---|---|---|---|
| gymshark.com | BMI Calculator | 83.9s | Pass | 200 text/html | Yes | Correct Gymshark palette detected; `/t/{id}` served branded HTML with resize reporter. | Brand advisory warned the font stack fell back to Arial instead of Gymshark fonts. |
| stripe.com | Payment Processing Fee Calculator | 67.9s | Pass | 200 text/html | Yes | Strong Stripe snapshot (`#533AFD`, Sohne/SF Pro Display) and clean pass on brand advisory. | No functional failures; only normal live latency. |
| notion.so | Reading Time Estimator | 66.1s | Pass | 200 text/html | Yes | Fastest successful branded run besides Stripe; Inter + blue/white palette looked plausible. | Brand advisory warned the output used a custom “N” mark and ignored one detected token, so fidelity is good-not-perfect. |
| allbirds.com | Carbon Footprint Calculator | 91.2s | Pass | 200 text/html | Yes | Domain/tool pairing felt natural; colors/fonts were pulled and embed serve succeeded. | Brand advisory warned the card background/text colors drifted toward generic white/dark defaults. |
| airbnb.com | Trip Cost Splitter | 93.8s | Pass | 200 text/html | Yes | Airbnb Cereal/Circular/Roboto snapshot and advisory both looked solid; iframe route worked cleanly. | Slowest brand-fetch stage (15.6s) of the run set, though still within budget. |
| mailchimp.com | Email Open Rate Calculator | 74.8s | Pass | 200 text/html | Yes | Good marketer/domain fit; Mailchimp yellow/plum colors and Graphik/Means Web were captured. | No failures; only routine generation time. |

## Per-domain notes

### gymshark.com — BMI Calculator

- Result: Passed end-to-end.
- Tool id: `d8793db7-0beb-42f3-b271-a909a44458d3`
- Server-Timing: total 83.7s, brand 10.8s, build 73.0s, advisory 2.8s
- Brand snapshot looked credible: Gymshark with `#007DB5`, `#00699B`, `#C69735`, `#FFFFFF`, fonts `SN Skandia` and `Plaak Gymshark`.
- Advisory note was useful rather than blocking: palette fidelity looked good, but the generated implementation apparently fell back to Arial. This is not a pipeline failure, but it is a brand-polish gap.

### stripe.com — Payment Processing Fee Calculator

- Result: Passed end-to-end.
- Tool id: `fae8d67d-f085-45d2-977a-6542a56eb392`
- Server-Timing: total 67.9s, brand 7.4s, build 60.5s, advisory 3.2s
- Snapshot was plausible and specific: Stripe, `#533AFD`, `#FFE0EF`, white background, fonts `Sohne` and `SF Pro Display`.
- Best overall brand-fidelity outcome in this batch: advisory passed with no notes.

### notion.so — Reading Time Estimator

- Result: Passed end-to-end.
- Tool id: `dcc0a267-fee9-4a27-b8be-3c0f4fdef200`
- Server-Timing: total 66.1s, brand 9.9s, build 56.2s, advisory 3.6s
- Snapshot was plausible for Notion as ingested here: Inter plus a blue/white token set.
- Advisory flagged two non-blocking fidelity issues: one detected token was unused, and the logo treatment was a custom blue square with “N” instead of a more faithful Notion mark/treatment.

### allbirds.com — Carbon Footprint Calculator

- Result: Passed end-to-end.
- Tool id: `8cd42d86-e746-4adf-968e-fa8777361d38`
- Server-Timing: total 91.2s, brand 8.8s, build 82.4s, advisory 9.6s
- Snapshot felt appropriate for Allbirds: `#E0DACF`, `#136F99`, `#1990C6`, `#ECE9E2`, fonts `Geograph` and `Akkurat Mono`.
- Advisory warning was again polish-oriented: the generated card apparently drifted to white instead of leaning into the warmer Allbirds background palette.

### airbnb.com — Trip Cost Splitter

- Result: Passed end-to-end.
- Tool id: `8f5133e1-a37d-42e4-b645-d30679bf0b49`
- Server-Timing: total 93.8s, brand 15.6s, build 78.2s, advisory 3.0s
- Snapshot looked credible: Airbnb with `#008489`, `#EAF3FD`, `#914669`, fonts `Airbnb Cereal VF`, `Circular`, `Roboto`.
- Advisory passed with no notes. This was the slowest run overall, driven mostly by a slower brand-context phase, but still comfortably under the 300s edge budget.

### mailchimp.com — Email Open Rate Calculator

- Result: Passed end-to-end.
- Tool id: `3834757d-adb0-4313-aa4f-82d37fb43693`
- Server-Timing: total 74.8s, brand 6.4s, build 68.3s, advisory 3.4s
- Snapshot looked strong: Mailchimp with `#FFE01B`, `#692340`, white background, fonts `Graphik Web` and `Means Web`.
- Advisory passed with no notes; this was a clean example of both branding and iframe delivery behaving as expected.

## Harness usage

Run locally against production or another deployment:

```bash
TOOL_GENERATOR_BASE_URL="https://web-22301-57c6c7ab-4p0z458q.onporter.run" \
npm run smoke:domains -- --json-out="./artifacts/tool-builder-domain-tests.json"
```

Notes:

- The suite runs sequentially on purpose to avoid overloading generation.
- Default timeout is 330000ms and can be overridden with `TOOL_GENERATOR_TIMEOUT_MS` or `--timeout-ms=...`.
- The script emits a JSON artifact suitable for turning into docs or CI summaries.
