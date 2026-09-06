### 2026-09-05: Porter deployment investigation for MCP/API/CLI parity branch
**By:** Infra
**What:** I investigated how the existing Porter app deploys, whether a safe branch/preview deploy path exists for `mcp-cli-api-parity`, whether the required secrets are attached, and whether I could safely deploy parity code without merging to `main`. I did **not** deploy because the existing app appears to be the live production URL, preview-environment readiness could not be confirmed from CLI-only access, and the attached secret set does not include the requested Supabase keys.
**Why:** The request explicitly prohibited disrupting production and required stopping instead of guessing if Porter preview/dashboard setup or credentials were missing.

#### Findings

- **Existing live app**
  - `porter app list --cluster 6018 --project 19766` shows one app:
    - name: `letterstory-toolbuilder`
    - cluster: `6018`
    - deployment target: `default`
    - git repository: `letterstory/letterstory-toolbuilder`
  - `porter app yaml letterstory-toolbuilder --cluster 6018 --project 19766 --target default` shows:
    - public domain: `web-22301-57c6c7ab-4p0z458q.onporter.run`
    - build method: `docker`
    - linked env group: `letterstory-toolbuilder-secrets`
    - health check: `/api/health`
    - env includes `PORTER_ENVIRONMENT=staging`

- **How this app deploys**
  - `.github/workflows/porter-app-6018-letterstory-toolbuilder.yml` deploys **on `push` to `main`** and runs:
    - `actions/checkout@v4`
    - `porter apply`
  - `porter apply --help` and Porter docs confirm:
    - it reads `porter.yaml`
    - **builds a new container image**
    - deploys the application
    - expects to run from a local git repo by default
    - `--app` / `PORTER_APP_NAME` overrides the app name
    - `--preview` deploys a preview environment based on the current git branch
  - Conclusion: for this docker-based app, Porter is **not independently tracking `main` as a branch inside the app definition**; the **workflow/checkout** determines which code gets deployed. A local `porter apply` would deploy the **currently checked-out local worktree/build context** to whichever app name is targeted.

- **Why I did not deploy the branch to the existing app**
  - The repo `porter.yaml` says `name: letterstory-toolbuilder-staging`, but the **actual live app** is named `letterstory-toolbuilder`.
  - `.squad/decisions.md` and `docs/tool-builder-domain-tests.md` both identify `https://web-22301-57c6c7ab-4p0z458q.onporter.run` as the **production/live verification URL**.
  - Because the live Porter app/domain are already treated elsewhere in-repo as production-facing, I could not safely assume this was an isolated staging target even though `PORTER_ENVIRONMENT=staging`.
  - Deploying `mcp-cli-api-parity` to the same existing app with local `porter apply` would therefore risk changing the live environment.

- **Preview / PR environment status**
  - Porter CLI supports preview deploys (`porter apply --preview`).
  - Porter docs say preview environments require a configured **preview template** and normally a Porter-generated PR workflow.
  - This repo currently has only the main-branch deploy workflow; I did **not** find a Porter preview workflow.
  - `porter apply --dry-run --preview -f porter.yaml --app letterstory-toolbuilder --cluster 6018 --project 19766 -x default` only validated config syntax/server-side config; it did **not** prove that a preview template/environment is actually configured and usable.
  - Without Porter dashboard access or a preview-specific workflow/template artifact, preview readiness could not be confirmed safely.

- **Secrets attached**
  - `porter app yaml ...` confirms env group attachment: `letterstory-toolbuilder-secrets`
  - `porter env list --cluster 6018 --project 19766 --json` shows that group exists and is active.
  - `porter env pull --app letterstory-toolbuilder --merged --cluster 6018 --project 19766 | sed 's/=.*//' | sort`
    returned these relevant keys:
    - present: `ANTHROPIC_API_KEY`
    - present: `CONTEXT_DEV_API_KEY`
    - **missing from merged key list:** `SUPABASE_URL`
    - **missing from merged key list:** `SUPABASE_SERVICE_ROLE_KEY`
  - Also still present in the merged key list:
    - `FIRECRAWL_API_KEY`
    - `FIRECRAWL_BASE_URL`
  - Conclusion: the env group is attached, but the requested Supabase keys were not visible in the app’s merged env set.

- **Smoke checks against the current live app**
  - `curl -fsS https://web-22301-57c6c7ab-4p0z458q.onporter.run/api/health`
    - result: **200 OK**
    - body included `{"ok":true,"service":"letterstory-toolbuilder",...}`
  - `curl -fsSI https://web-22301-57c6c7ab-4p0z458q.onporter.run/api/mcp || true`
    - result: **404 Not Found**
  - This indicates MCP parity is **not** currently deployed at the live URL.

#### Exact commands run

```bash
git --no-pager branch --show-current && git --no-pager status --short && git --no-pager branch --list mcp-cli-api-parity && git --no-pager branch -r --list origin/mcp-cli-api-parity
porter app list
porter app -h
porter version
porter -h
porter app update --help
porter app create --help
porter apply --help
porter app build --help
porter app push --help
porter github --help
porter github branches --help
porter app list --cluster 6018
porter app list --project 19766 --cluster 6018
porter app yaml letterstory-toolbuilder --cluster 6018 --target default
porter env --help
porter env list --help
porter env list --cluster 6018 --project 19766 --json
porter env pull --help
porter env pull --app letterstory-toolbuilder --merged --cluster 6018 --project 19766 | sed 's/=.*//' | sort
porter apply --dry-run --preview -f porter.yaml --app letterstory-toolbuilder --cluster 6018 --project 19766 -x default
curl -fsS https://web-22301-57c6c7ab-4p0z458q.onporter.run/api/health
curl -fsSI https://web-22301-57c6c7ab-4p0z458q.onporter.run/api/mcp || true
```

#### Blocking items / safest next step

- To proceed **safely without touching the live app**, someone with Porter dashboard access should confirm one of:
  1. a Porter **preview template** is configured for this app/repo and a branch/PR preview deployment path is enabled, or
  2. there is a **separate non-production staging app** intended for branch testing.
- If the intent is to use the existing `letterstory-toolbuilder` app as a non-prod staging target, that needs explicit confirmation because current repo evidence treats its live URL as production-facing.
- If Supabase is expected for staging parity validation, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` need to be attached to the app/env group before deployment validation.
