# Squad Team

> letterstory-toolbuilder

## Coordinator

| Name  | Role        | Notes                                              |
| ----- | ----------- | -------------------------------------------------- |
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name         | Role             | Charter                               | Status      |
| ------------ | ---------------- | -------------------------------------- | ----------- |
| Lead         | Lead / Architect | .squad/agents/lead/charter.md         | 🏗️ Active   |
| Backend      | Backend Dev      | .squad/agents/backend/charter.md      | 🔧 Active   |
| Frontend     | Frontend Dev     | .squad/agents/frontend/charter.md     | ⚛️ Active   |
| Infra        | DevOps           | .squad/agents/infra/charter.md        | ⚙️ Active   |
| Tester       | Tester           | .squad/agents/tester/charter.md       | 🧪 Active   |
| Scribe       | Scribe           | .squad/agents/scribe/charter.md       | 📋 Scribe   |
| Ralph        | Work Monitor     | .squad/agents/ralph/charter.md        | 🔄 Ralph    |
| Rai          | RAI Reviewer     | .squad/agents/Rai/charter.md          | 🛡️ RAI      |
| Fact Checker | Fact Checker     | .squad/agents/fact-checker/charter.md | 🔍 Verifier |

## Coding Agent

<!-- copilot-auto-assign: false -->

| Name     | Role         | Charter | Status          |
| -------- | ------------ | ------- | --------------- |
| @copilot | Coding Agent | —       | 🤖 Coding Agent |

### Capabilities

**🟢 Good fit — auto-route when enabled:**

- Bug fixes with clear reproduction steps
- Test coverage (adding missing tests, fixing flaky tests)
- Lint/format fixes and code style cleanup
- Dependency updates and version bumps
- Small isolated features with clear specs
- Boilerplate/scaffolding generation
- Documentation fixes and README updates

**🟡 Needs review — route to @copilot but flag for squad member PR review:**

- Medium features with clear specs and acceptance criteria
- Refactoring with existing test coverage
- API endpoint additions following established patterns
- Porter/CI config changes with well-defined scope

**🔴 Not suitable — route to squad member instead:**

- Architecture decisions and system design
- Multi-system integration requiring coordination
- Ambiguous requirements needing clarification
- Security-critical changes (auth, credentials, access control)
- Porter ingress/timeout/infra changes without a clear rollback plan
- Changes requiring cross-team discussion

## Project Context

- **Project:** letterstory-toolbuilder (Next.js + TypeScript)
- **Created:** 2026-09-04
- **User:** MirRaonaq
- **What it does:** Generates client-branded micro-tools (e.g. calculators) for iframe embedding. Ingests a client's brand guidelines (colors, fonts, logos) via Firecrawl, then uses Anthropic Claude to generate a branded, embeddable tool on demand. Stateless by design — no persistent storage of tool output yet (per Mathew's guidance), output is generated on the fly with extraction/storage possible later.
- **Deploy target:** Porter (porter.run), deployed via GitHub Actions CI (`porter apply`).
- **Current initiative:** Landing pages / "Landings" and micro-tool generation reliability — recent work fixed URL-normalization UX, a CardHeader layout bug, and a Porter nginx ingress gateway-timeout (504) issue affecting multi-step Claude generation calls.
