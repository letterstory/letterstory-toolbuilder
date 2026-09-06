### 2026-09-06: Preprod/staging environment recommendation for `feature/chat-scroll-version-history`
**By:** Infra
**What:** I investigated whether Mir can get a safe preprod URL for `feature/chat-scroll-version-history` on Porter without touching the only live/prod app, and compared local-only review, a second permanent app, and Porter's native preview environments.
**Why:** Adding a second environment changes cost and cluster load, and this Porter cluster has already proven it cannot reliably place a second app pod during normal rolling deploys.

## Executive summary

- **Fastest answer today:** use a local build/run on the feature branch. It requires no infra, no commit, and no risk to production.
- **Best long-term Porter shape:** use **Porter native preview environments**, not a permanent second app.
- **Blunt reality:** on **cluster 6018 as it exists today**, I do **not** trust either a second permanent app **or** an active Porter preview to run reliably beside production without a capacity change first. The last failure mode was exactly “cannot place one extra pod”.

## What I verified

### 1) Porter does support preview environments natively

Evidence:

- `porter apply --help` includes:
  - `--preview   apply as preview environment based on current git branch`
- Porter docs confirm:
  - preview environments are a native feature
  - they are created from a **preview template**
  - Porter normally adds a GitHub Actions workflow like `porter-preview-<app>.yml`
  - preview environments are created per PR and destroyed on merge/close
- `porter target list --preview --cluster 6018 --project 19766` returned:
  - `mcp-cli-api-parity` on cluster `6018`

### 2) This repo/app is not fully wired for automatic PR previews today

Evidence:

- `gh workflow list --repo letterstory/letterstory-toolbuilder` shows only:
  - `Deploy to letterstory-toolbuilder`
- Main branch contains only:
  - `.github/workflows/porter-app-6018-letterstory-toolbuilder.yml`
- I did **not** find any `porter-preview-*.yml` workflow in the repo.
- Porter docs say previews require a configured preview template and merged preview workflow.

Interpretation:

- The Porter project/cluster appears to have **preview capability available** (because a preview target exists).
- But this repository is **not currently set up for automatic PR preview creation**.
- There may have been prior partial/manual preview experimentation (`mcp-cli-api-parity` target), but nothing in the repo indicates a finished PR-preview setup for the current app.

### 3) The requested feature branch is not deployable via Git-linked Porter automation yet

Evidence:

- Current local branch: `feature/chat-scroll-version-history`
- Local working tree has uncommitted UI changes.
- Remote branch check returned **no** `origin/feature/chat-scroll-version-history`.
- `gh pr list --head MirRaonaq:feature/chat-scroll-version-history` returned `[]`.
- Porter GitHub branch listing currently knows only:
  - `main`
  - `mcp-cli-api-parity`
  - `porter/add-workflows-6018-8b109f5e189d`

Interpretation:

- **Anything GitHub/Porter-managed (preview workflow or branch-specific deploy workflow) requires a commit + push first.**
- The only review path that works **immediately, right now, with the exact local uncommitted code** is a local build/run.

## Capacity assessment

### 4) A second running app on cluster 6018 is likely to hit the same wall

Known verified prior evidence from live deploy investigation:

- Current production app runs:
  - `instances: 1`
  - `cpuCores: 0.5`
  - `ramMegabytes: 512`
- The cluster previously failed to roll out the next revision because Kubernetes could not place the **additional** pod:
  - `FailedScheduling`
  - `Too many pods`
  - `max node group size reached`
  - `no instance type has enough resources`
- Production only became deployable again after switching to the two-step **scale-to-zero-first** workflow, which avoids old+new pods coexisting.

Interpretation:

- A **second permanent app** means prod pod + staging pod coexist all the time.
- An **active preview environment** also means prod pod + preview pod coexist while the preview is up.
- That is structurally the same resource problem as the failed rolling deploy: the cluster must fit **one more running pod** than it could fit before.

### 5) Could a smaller/cheaper staging app fit?

Porter preview overrides can reduce service resources, and a second app could use a smaller manifest than production.

However, I do **not** recommend assuming that will solve this, because the previous scheduling failure was not only about CPU/RAM:

- it also included **pod-count exhaustion** (`Too many pods`)
- and **eligible-node constraints / taints**

So even if we lower CPU or memory, a second app still adds at least one more pod on a cluster that has already refused one extra pod. A smaller footprint might help, but there is **not enough evidence to count on it**.

## Options

### Option A — Local build test

**What it is**

- Run the feature branch locally with existing scripts:
  - `npm run build && npm run start`
  - or `npm run dev`

**Pros**

- Immediate
- Zero infra work
- Zero Porter cost/risk
- Works with the **exact uncommitted** local changes Mir already has

**Cons**

- Not a public/shared URL
- Not a real Porter-hosted environment

**Recommendation status**

- **Best immediate path** if Mir just wants to click through the UI now.

### Option B — Second separate minimal Porter app

**What it would take**

- Create a **new app** in Porter, separate from production
  - e.g. `letterstory-toolbuilder-preprod`
- Give it its own domain/URL
- Decide whether to:
  - reuse `letterstory-toolbuilder-secrets`, or
  - create a **separate staging env group** (safer isolation; recommended if keys should differ)
- Add a second deploy path, probably by copying the existing GitHub Actions workflow and changing:
  - app name
  - branch trigger (`feature/chat-scroll-version-history`, or better a durable `preprod` / `staging` branch)
  - any manifest path / app override
- Because the current feature work is uncommitted, Mir would first need to **commit and push** the branch.

**Important caveat**

- The production app’s scale-to-zero-first trick fixes **deploy surge on a single app**.
- It does **not** solve the steady-state problem of running **prod + preprod at the same time** on the same tight cluster.

**Recommendation status**

- Feasible only if Mir explicitly wants a permanent second environment **and** accepts that cluster 6018 may need more capacity first.
- I do **not** recommend this as the default path today.

### Option C — Porter native preview environments

**What it would take**

- Confirm/enable a **preview template** for `letterstory-toolbuilder` in Porter
- Merge the Porter-generated preview workflow, or add a custom preview workflow
- Push the feature branch and open a PR
- Configure preview-specific env vars / env group as needed

Important Porter behavior from docs:

- Preview apps inherit base app env vars, but **attached env groups are stripped out by default**
- So preview environments likely need:
  - preview env vars added directly, or
  - a dedicated preview env group attached in the preview template

**Why this is better than a permanent second app**

- Proper lifecycle: spin up on PR, tear down after merge/close
- Less long-term app sprawl
- Better match for “review before merge”

**Big caveat**

- A live preview still needs cluster capacity while it exists.
- So previews are the **right product shape**, but not guaranteed to work on this cluster **today** without capacity headroom.

**Recommendation status**

- **Best long-term infra solution**, but only after Mir commits/pushes the branch and confirms willingness to either:
  - test whether cluster 6018 can handle it, or
  - add/request more cluster capacity first.

## Secrets / config notes

- Production currently attaches env group `letterstory-toolbuilder-secrets`.
- Prior verified investigation found `SUPABASE_*` not present in the merged env of the live app.
- For a **second app**, that env group could be reused mechanically, but that couples staging to prod secrets and still omits any staging-only values.
- For **preview environments**, Porter docs say env groups are stripped by default, so a preview-specific env group or explicit preview env vars will be needed anyway.

## Recommendation

1. **Right now:** Mir should use **Option A (local build/run)** if he wants immediate UI review of the exact current uncommitted feature work.
2. **If Mir wants a real external review URL before merge:** prefer **Option C (Porter native previews)** over a permanent second app.
3. **But:** I would **not** promise Option B or C to work on cluster 6018 as-is. The honest blocker is cluster capacity. The prior failure pattern strongly suggests “one more running pod” is already unsafe on this cluster.

## Explicit decision needed from Mir before I would proceed

Mir needs to choose one of these:

- **Stay local for review now** (no infra changes), or
- **Authorize infra work for a real preprod URL**, in which case I recommend:
  1. commit + push the feature branch,
  2. prefer **Porter native previews** over a permanent second app,
  3. and accept that we may first need Porter/dashboard action to confirm or add enough cluster capacity.

If Mir wants me to proceed after approval, my default next step would be: **set up/verify Porter preview-environment support for this app, not create a permanent second app first.**
