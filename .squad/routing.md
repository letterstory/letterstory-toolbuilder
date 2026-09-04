# Work Routing

How to decide who handles what.

## Routing Table

| Work Type                      | Route To | Examples                                                                                                    |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| Backend / API / generation      | Backend  | `/api/tools/generate`, `/api/brand/**` ingestion routes, Anthropic/Firecrawl integration, generation orchestrator |
| Frontend / UI                   | Frontend | `src/components/brand/brand-workspace.tsx`, `src/components/tools/tool-builder-workspace.tsx`, shared UI primitives |
| Infra / deploy / CI              | Infra    | `porter.yaml`, GitHub Actions workflows, ingress/timeout config, Porter dashboard changes                    |
| Testing                         | Tester   | Vitest unit/integration tests, focused regressions, edge cases                                               |
| Code review                     | Lead     | Review PRs, check quality, suggest improvements                                                              |
| Scope & priorities               | Lead     | Architecture calls, sequencing, approval gating                                                              |
| Session logging                 | Scribe   | Automatic — never needs routing                                                                              |
| RAI review                      | Rai      | Content safety, bias checks, credential detection, ethical review                                            |

## Issue Routing

| Label          | Action                                               | Who          |
| -------------- | ----------------------------------------------------- | ------------ |
| `squad`        | Triage: analyze issue, assign `squad:{member}` label | Lead         |
| `squad:{name}` | Pick up issue and complete the work                  | Named member |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, the **Lead** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Lead review.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for a factual lookup.
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. The Lead handles all `squad` (base label) triage.
8. **Infra changes to Porter (ingress annotations, timeouts, service config) always route to Infra**, and should be cross-checked against the live dashboard state, not just `porter.yaml` — the two are known to drift (see decisions.md).
