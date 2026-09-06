### 2026-09-05: Live deploy verification for PR #2 merge
**By:** Infra
**What:** Verified the auto-deploy workflow and production MCP/API parity status after merge commit `e62680e7288cdb0baa7cf8492093af0c2c944aea`.
**Why:** Mir explicitly requested live production verification after pushing the merged changes to `main`.

## Workflow run

- **Workflow:** `porter-app-6018-letterstory-toolbuilder.yml`
- **Run ID:** `33974593041`
- **Run URL:** https://github.com/letterstory/letterstory-toolbuilder/actions/runs/33974593041
- **Trigger:** push to `main` for merge commit `e62680e7288cdb0baa7cf8492093af0c2c944aea`
- **Status:** `completed`
- **Conclusion:** `failure`
- **Started:** `2026-09-05T15:22:19Z`
- **Finished:** `2026-09-05T15:34:48Z`
- **Elapsed:** `12m29s`

## Failure details

- `gh run watch 33974593041 --exit-status` was monitored through completion.
- The `porter-deploy` job built and pushed image tag `e62680e7288cdb0baa7cf8492093af0c2c944aea`.
- Porter then created new revision `e3c29b6b-3c12-417d-b3d7-2f1870d07f87`.
- The deploy failed during rollout wait:

```text
Waiting up to 20 minutes for all services to deploy
Error: deployment failed for new revision
deployment failed for new revision
```

- Porter app inventory still shows the app exists:

```text
NAME                     CLUSTER   DEPLOYMENT TARGET   CREATED AT         GIT REPOSITORY                      IMAGE REPOSITORY
letterstory-toolbuilder  6018      default             2026-09-04 19:43   letterstory/letterstory-toolbuilder 406382424918.dkr.ecr.us-east-1.amazonaws.com/letterstory-toolbuilder
```

## Production verification

Base URL: `https://web-22301-57c6c7ab-4p0z458q.onporter.run`

- `porter app logs letterstory-toolbuilder --since 30m --limit 120` showed active traffic on `web v24`, indicating production remained on the previously successful revision while the new rollout failed.

### `GET /api/health`

- Result: **200 OK**
- Response body:

```json
{"ok":true,"service":"letterstory-toolbuilder","status":{"modules":[{"name":"Brand ingestion","state":"configured","summary":"Context.dev-backed brand extraction is live behind env gating, with URL safety checks and a probe script for real-site validation.","nextSteps":["Run the live ingestion probe against representative customer sites.","Add follow-up validation for tone, imagery, and layout fidelity.","Layer in LLM/competitor cross-checks once baseline extraction is stable."]},{"name":"Tool generation","state":"stubbed","summary":"The orchestration boundary is in place for prompt-driven tool builds, without any live agent wiring yet.","nextSteps":["Define the generation job contract.","Attach coding-agent execution flow.","Store manifests and preview metadata."]},{"name":"Porter deployment","state":"pending-config","summary":"Deployment hooks are organized under a Porter-specific module, waiting on credentials and topology decisions.","nextSteps":["Confirm Porter account owner and invite timeline.","Fill in provider credentials.","Implement deploy status + runtime handoff once the embed contract is defined."]}]}}
```

### `GET /api/mcp`

- Result: **404 Not Found**
- This means the new MCP discovery endpoint is **not live** on production yet.

### `POST /api/mcp` with `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`

- Result: **404 Not Found**
- Expected 7-tool JSON-RPC response was **not** returned because the deploy never rolled out successfully.

## Current conclusion

Production is still serving the older build: health is up, but `/api/mcp` remains absent and CLI/API/MCP parity is **not** verified live yet. The immediate blocker is the failed Porter rollout for revision `e3c29b6b-3c12-417d-b3d7-2f1870d07f87`.

## Root cause investigation

- **Actual pod-level failure reason:** the new revision never started a container. It failed at the **Kubernetes scheduling** stage, not at app startup.
- Evidence from `porter kubectl -- describe pod letterstory-toolbuilder-web-74bfbc79f7-nbsmb`:
  - `porter.run/app-revision-id=e3c29b6b-3c12-417d-b3d7-2f1870d07f87`
  - `Status: Pending`
  - `Node: <none>`
  - `Conditions: PodScheduled False`
- Scheduler / autoscaler events during the failed rollout window (`2026-09-05T15:22Z`–`15:35Z`) show repeated capacity failures, not crashes:

```text
2026-09-05T15:24:36Z Normal  SuccessfulCreate   ReplicaSet/letterstory-toolbuilder-web-74bfbc79f7   Created pod: letterstory-toolbuilder-web-74bfbc79f7-nbsmb
2026-09-05T15:34:45Z Warning FailedScheduling  Pod/letterstory-toolbuilder-web-74bfbc79f7-nbsmb     0/7 nodes are available: 2 Too many pods, 5 node(s) had untolerated taint(s).
2026-09-05T15:34:46Z Normal  NotTriggerScaleUp Pod/letterstory-toolbuilder-web-74bfbc79f7-nbsmb     pod didn't trigger scale-up: 2 max node group size reached
2026-09-05T15:34:57Z Warning FailedScheduling  Pod/letterstory-toolbuilder-web-74bfbc79f7-nbsmb     Failed to schedule pod, did not tolerate taint (taint=porter.run/node-group-id=37a33d1c-f006-4dfa-a3e4-5529a1240908:NoSchedule); no instance type has enough resources ... resources={"cpu":"705m","memory":"873760Ki","pods":"8"}
```

- Deployment-level evidence from `porter kubectl -- describe deploy letterstory-toolbuilder-web`:
  - `Progressing False   ProgressDeadlineExceeded`
  - `Replicas: 1 desired | 1 updated | 2 total | 1 available | 1 unavailable`
- The pod request for the failed revision is `cpu: 500m`, `memory: 512M` (limit `512M`). There is **no** `CrashLoopBackOff`, `OOMKilled`, container exit code, readiness failure, or health-check failure because the pod was never scheduled onto a node.
- `porter app logs` for the rollout window did not show startup errors for the failed revision, which is consistent with the pod never launching.
- I also checked the PR change in `src/lib/config/env.server.ts` (`git show dedf628 -- src/lib/config/env.server.ts`): it only adds `TOOLBUILDER_BASE_URL` as an optional getter returning `""` when unset. That change does **not** explain this rollout failure.

### Diagnosis

This rollout failed because the Porter/Kubernetes cluster could not place the new pod for revision `e3c29b6b-3c12-417d-b3d7-2f1870d07f87`. The blocker is **cluster capacity / scheduling constraints** (node taints, pod density, and autoscaler max node group size), not application code, env validation, or `/api/health`.

### What would need to change to fix it

Either:
- free or add schedulable capacity in the Porter cluster / node pool,
- raise the node group autoscaling ceiling,
- adjust taints / placement so this workload can land on eligible nodes,
- or reduce this service's scheduling footprint enough to fit available capacity.

No application or env-group fix is indicated by the evidence gathered here.
