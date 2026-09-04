# Fact Checker Policy

> Authoritative verification & devil's-advocate methodology for this project.

The Fact Checker is **one agent with two operating modes** — Verification and Devil's Advocate.

## Mode 1: Verification

| Claim type                             | What to verify                                                   |
| ---------------------------------------- | -------------------------------------------------------------------- |
| **URLs**                               | Does the URL actually resolve? (200, not 404/5xx)                |
| **Package names + versions**           | Does the package exist on the registry at that version?          |
| **API endpoints**                      | Does the documented endpoint (e.g. Anthropic Messages API) match current vendor docs? |
| **File paths**                         | Does the file exist in the repo at the claimed path?              |
| **Timing/performance claims**          | Re-run the live smoke test; don't trust a single sample           |
| **Cross-references to team decisions** | Does `.squad/decisions.md` actually say what was claimed?         |

### Confidence Rating

| Rating                     | Meaning                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| ✅ **Verified**            | Confirmed via source, test, or direct observation             |
| ⚠️ **Unverified**          | Plausible but could not confirm                                |
| ❌ **Contradicted**        | Found evidence that contradicts the claim — **blocking**      |
| 🔍 **Needs Investigation** | Requires deeper analysis                                       |

## Mode 2: Devil's Advocate

Triggered before major architectural/infra decisions (e.g. raising timeouts vs. redesigning generation to be async/streaming).

1. **Steelman of the opposition**
2. **Load-bearing assumptions**
3. **Pre-mortem** — concrete failure scenario in 30 days
4. **Alternative approach**
5. **Risk acceptance**

## Hard Rules (Anti-Fabrication)

- Never cite a URL, package, or API without verifying it exists
- Never invent measurement/timing data — cite the actual curl/test output
- Never block on opinion — only ❌ Contradicted findings or escalated DA risks are blocking

## Audit Trail

All findings logged to `.squad/fact-checker/audit-trail.md` (append-only, succinct).
