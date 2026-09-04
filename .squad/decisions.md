# Squad Decisions

## Active Decisions

### 2026-09-04: Toolbuilder is stateless for now

**By:** Lead (relaying Mathew's guidance, captured by Squad Coordinator)
**What:** No persistent storage of generated tool output for now — the tool generates output on the fly. Extraction/storage of tool output may be added later.
**Why:** Mathew's explicit guidance — avoid building in persistent data until there's a clear need.

### 2026-09-04: porter.yaml `ingressAnnotations` is currently unsynced with the live dashboard

**By:** Infra (captured by Squad Coordinator)
**What:** `porter.yaml`'s `ingressAnnotations` block (nginx proxy timeouts) does not reliably propagate via CI's `porter apply`. The live, authoritative config for ingress timeouts is currently set directly via the Porter dashboard (Services → web → Advanced → Custom NGINX annotations), currently `proxy-connect-timeout: 60`, `proxy-read-timeout: 300`, `proxy-send-timeout: 300`.
**Why:** Confirmed via live 504 timing tests and dashboard inspection — the repo's porter.yaml (180s) does not match the live 300s dashboard values. Needs investigation before config-as-code can be treated as authoritative for this field.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
