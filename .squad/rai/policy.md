# RAI Policy

> Responsible AI policy for this project. Rai enforces these standards.

## Principles

1. **Safety first** — No output should cause harm to individuals or groups.
2. **Transparency** — Users should know when they're interacting with AI-generated content.
3. **Fairness** — Systems should not discriminate based on protected characteristics.
4. **Privacy** — Personal data must be handled with minimal exposure and explicit consent.
5. **Accountability** — Every decision has an owner; every finding has a remediation path.

## Critical Violations (🔴 — Always Blocked)

### Credentials & Secrets
- Hardcoded API keys, tokens, passwords, connection strings (`ANTHROPIC_API_KEY`, Firecrawl keys, Porter tokens)
- Private keys committed to source control
- Secrets in environment variable defaults or config templates

### Injection Vulnerabilities
- SQL injection, command injection, path traversal via user-supplied brand/site URLs

### Harmful Content
- Hate speech, slurs, or derogatory language targeting groups
- Content promoting violence or self-harm
- Sexually explicit content without appropriate context/gating

### Deceptive Patterns
- Ungrounded factual claims presented as authoritative
- Hallucinated citations, references, or statistics
- Instructions that bypass AI safety guidelines or content filters
- **Deceptive landing-page/"ghost brand" patterns** presented as legitimate brands without disclosure — flag if generated conversion pages misrepresent affiliation

## Advisory Concerns (🟡 — Flagged, Not Blocked)

### Privacy & Data
- PII in logs or responses
- Overly broad data collection without stated purpose (project is stateless by design — see decisions.md)

### Bias & Fairness
- Algorithms using demographic features without justification

### Inclusive Language
- Gendered/ableist/culturally assumptive terms in generated copy

### Security Posture
- Missing rate limiting on user-facing generation endpoints
- Overly permissive CORS on iframe-embed endpoints
- Insufficient input validation on brand/site URLs

## Terminology Standards

| Avoid               | Prefer                 | Reason                |
| -------------------- | ----------------------- | ---------------------- |
| whitelist/blacklist | allowlist/blocklist    | Racial connotation    |
| master/slave        | primary/replica        | Racial connotation    |
| sanity check        | validation, smoke test | Ableist               |
| dummy value         | placeholder, sample    | Potentially offensive |
| guys                | everyone, team, folks  | Gendered              |

## Escalation Path

1. **🟢 Green** — No action needed. Work proceeds.
2. **🟡 Yellow** — Suggestions attached to work output. Author decides.
3. **🔴 Red** — Work blocked. Reviewer Rejection Protocol activates.

## Policy Updates

Changes require justification logged to `.squad/rai/audit-trail.md` and team acknowledgment. No retroactive enforcement.
