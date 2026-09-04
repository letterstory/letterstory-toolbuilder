---
last_updated: 2026-09-04T21:16:11.000Z
---

# Team Wisdom

Reusable patterns and heuristics learned through work. NOT transcripts — each entry is a distilled, actionable insight.

## Patterns

<!-- Append entries below. Format: **Pattern:** description. **Context:** when it applies. -->

**Pattern:** Browser-native `type="url"` inputs block form submission on bare domains (no protocol) before any JS runs. **Context:** Any URL input field — use `type="text"` + `inputMode="url"` and normalize (prepend `https://`) client-side instead of relying on native validation.

**Pattern:** shadcn `CardHeader` is CSS Grid-based; ad-hoc `flex-row justify-between` classes silently break into a 2-row layout. **Context:** Any header with an action button — wrap the button in `<CardAction>` to trigger the built-in 2-column grid layout.

**Pattern:** Porter's nginx ingress has a ~60s default `proxy-read-timeout`; multi-step LLM generation calls can exceed it, producing a 504 HTML page that looks like a JSON parse error client-side. **Context:** Always guard fetch responses with a content-type check before `response.json()`. `porter.yaml`'s `ingressAnnotations` config-as-code is unreliable via CI `porter apply` — the Porter dashboard (Services → Advanced → Custom NGINX annotations) is currently the authoritative source for ingress timeout config on this app.
