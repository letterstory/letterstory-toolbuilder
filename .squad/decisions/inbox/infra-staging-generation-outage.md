### 2026-09-06: Investigated intermittent staging tool-generation outage on Porter revision 820debd
**By:** Infra
**What:** Investigated live Porter staging/runtime behavior for commit `820debd16b319af583673b29a3117f76b1740e9e` at `https://web-22301-57c6c7ab-4p0z458q.onporter.run` after repeated `/api/tools/generate` HTTP 500s with `Tool generation failed unexpectedly: fetch failed`. Findings: the app logs do **not** include the low-level undici `.cause`, so the exact socket/DNS/TLS error is not recoverable from current runtime logs; however the live pod currently has a valid Anthropic key and working outbound connectivity to Anthropic/Context.dev, while the Porter pod/node show overlapping health instability (readiness/liveness probe timeouts, `NodeNotReady`, recent scheduling/capacity pressure). This points to an **intermittent Porter runtime/node instability issue**, not a missing/expired secret or a deterministic application-code regression.
**Why:** The live route code only logs `error.message` (`[tool-generation-route] fetch failed`) instead of the full error object/stack/cause, so I had to combine Porter logs, Kubernetes pod events, live endpoint retries, and in-pod network checks to narrow the failure domain without changing code or secrets.

#### 1) Most recent deploy / live revision confirmed
- GitHub Actions deploy workflow `Deploy to letterstory-toolbuilder` run `34071687861` for `820debd` completed successfully.
- Live Porter deployment is serving image tag `820debd16b319af583673b29a3117f76b1740e9e` on deployment revision `193` / app revision id `4b5b3994-1e1d-4ba3-b6e3-06175f6577b9`.
- Live app YAML still shows:
  - `instances: 1`
  - `cpuCores: 0.5`
  - `ramMegabytes: 512`
  - ingress timeouts `connect=60`, `read=330`, `send=330`

#### 2) What Porter runtime logs actually show for 820debd
Recent route-level failures under `web v193`:
- `2026-09-07T01:18:57Z [tool-generation-route] fetch failed`
- `2026-09-07T01:19:14Z [tool-generation-route] fetch failed`
- `2026-09-07T01:29:38Z [tool-generation-route] The operation was aborted due to timeout`

Important limitation:
- The route implementation logs only `error.message`:
  - `console.error("[tool-generation-route]", message)`
- So Porter logs do **not** expose the underlying undici/network `.cause` (for example `ENOTFOUND`, `ECONNRESET`, `ETIMEDOUT`, TLS cause, etc.). I could not recover a deeper stack trace from live logs alone.

#### 2a) Most likely failure point for the two `fetch failed` requests
The two route-level `fetch failed` errors at `01:18:57Z` and `01:19:14Z` were **not** accompanied by:
- `build_started`
- `html_generation_prompt_prepared`
- `html_generation_failed`
- `build_failed`

But the same window **did** show successful brand-context completion:
- `2026-09-07T01:19:08Z ... brand_context_resolved ... https://youtube.com ... durationMs 12420`
- `2026-09-07T01:19:29Z ... brand_context_resolved ... https://stripe.com ... durationMs 16203`

That pattern matters because `generateTool()` does two async steps in parallel **before** `build_started`:
1. soft-fail brand context resolution, and
2. `prepareToolLogic()`

`prepareToolLogic()` always makes an Anthropic `requestAnthropicText()` call for the server-logic classifier, even for simple tools, and that classifier path currently has **no internal retry** and can fail the whole request if its fetch throws. So the best fit for the two transient failures is:

- brand context finished normally
- the parallel Anthropic logic-classifier fetch failed at the network layer
- the route caught only `error.message === "fetch failed"` and returned HTTP 500

This is the strongest explanation that fits the exact log ordering for the two failures.

#### 3) Secret / outbound-API checks from inside the live pod
Using `porter app run ... --existing_pod` against the running `820debd` pod:
- `ANTHROPIC_API_KEY` is present (`length 108`)
- `CONTEXT_DEV_API_KEY` is present (`length 44`)
- DNS resolution from the pod works:
  - `api.anthropic.com -> 160.79.104.10`
- Anonymous outbound HTTPS checks worked:
  - `POST https://api.anthropic.com/v1/messages` without key returned `401 x-api-key header is required`
  - `GET https://api.context.dev/v1/web/fonts?domain=stripe.com` with invalid bearer returned `401 API key not found`
- Real Anthropic call with the live `ANTHROPIC_API_KEY` succeeded from inside the live pod:
  - returned HTTP `200` and a valid Claude response
- Repeated in-pod Anthropic calls (5 in a row) all succeeded in ~0.9s–2.6s.

Conclusion from these in-pod checks:
- **Not** an expired/missing/rotated Anthropic key
- **Not** a persistent DNS block / egress block / TLS break from the Porter container to Anthropic
- **Not** a broad Context.dev egress failure either

#### 4) Is this transient or persistent?
I retried the live public endpoint 3 times, one minute apart, using the requested `curl` pattern against `/api/tools/generate`:
- Attempt 1: **HTTP 200**, success, `TOTAL 120.684970s`
- Attempt 2: **HTTP 200**, success, `TOTAL 101.172052s`
- Attempt 3: **HTTP 500**, `Tool generation failed unexpectedly: The operation was aborted due to timeout`, `TOTAL 14.092037s`

Conclusion:
- The outage is **intermittent**, not a total/persistent hard-down state.
- Generation on `820debd` is currently **flaky**: sometimes succeeds, sometimes fails.

#### 4a) Is this a known / recurring pattern?
Yes — `fetch failed` on Anthropic-bound generation calls is a **recurring transient pattern**, not unique to tonight's two failures.

Prior Porter logs show earlier occurrences:
- `2026-09-06T15:43:44Z web v125 html_generation_failed attempt 1 ... error:"fetch failed"`
- `2026-09-06T15:43:50Z web v125 html_generation_failed attempt 2 ... error:"fetch failed"`
- `2026-09-06T16:06:22Z web v129 html_generation_failed attempt 1 ... error:"fetch failed"`
- `2026-09-06T16:06:37Z web v129 html_generation_failed attempt 2 ... error:"fetch failed"`

And both of those earlier failure windows were followed shortly by clean successes:
- after the `15:43:50Z` failure, another Stripe generation on `v125` succeeded starting `15:44:33Z`
- after the `16:06:37Z` failure, another Stripe generation on `v129` started `16:07:07Z`

So the pattern is:
- brief network-layer Anthropic fetch failures
- immediate retry inside the same request may still fail
- a fresh request tens of seconds later often succeeds

That is strong evidence for a **transient transport hiccup** rather than a bad secret or stable misconfiguration.

#### 5) Porter / cluster health signals overlapping the outage window
Current live pod (`letterstory-toolbuilder-web-54b654f96c-722cc`) on `820debd`:
- `RESTARTS: 0` (so not a crash loop)
- Still `Running/Ready` when inspected
- But pod events show repeated health instability overlapping the outage window:
  - `Readiness probe failed: context deadline exceeded (Client.Timeout exceeded while awaiting headers)` **x12 over ~11m**
  - `Liveness probe failed: context deadline exceeded (Client.Timeout exceeded while awaiting headers)` **x15 over ~11m**
  - `NodeNotReady` event on the hosting node
- Cluster events around the 820debd rollout also show the same environment is capacity-constrained / unstable:
  - `FailedScheduling`
  - `Insufficient memory`
  - `NotTriggerScaleUp: 2 max node group size reached`
  - earlier Karpenter `VcpuLimitExceeded` / consolidation churn visible in events

Interpretation:
- Even though the pod is not crashing and current steady-state memory was only ~194 MB / 512 MB when sampled, the single live pod and/or its node have been intermittently unresponsive.
- That matches the observed symptom pattern much better than a bad API key: intermittent route failures, intermittent timeouts, successful in-pod Anthropic calls when the pod is responsive, and no platform-wide Porter incident posted.

#### 6) Porter platform incident check
- Official Porter status sources currently show **no reported incidents / no recent notifications** for the requested timeframe.
- So this does **not** look like a broad public Porter outage; it looks specific to this app/cluster/node/runtime situation.

#### 7) Did this start with 820debd, or did edb0dc5 already have it?
I checked the prior deployed image tag / revisions for `edb0dc5`:
- ReplicaSets `v191` and `v192` correspond to image tag `edb0dc59da4488c4168ef0974aa9b2b2e85e5399`
- Searching Porter logs between the `edb0dc5` rollout and the `820debd` rollout found multiple successful generations under `v191`:
  - `2026-09-07T00:39:24Z build_succeeded`
  - `2026-09-07T00:42:39Z build_succeeded`
  - `2026-09-07T00:43:28Z build_succeeded`
  - `2026-09-07T00:58:23Z build_succeeded`
- I did **not** find route-level `fetch failed` or `build_failed` entries in that `edb0dc5` window.

Conclusion:
- I do **not** have evidence that `edb0dc5` was failing the same way.
- The flaky failures are first visible **after** `820debd` rolled out.
- But because `820debd` also succeeds intermittently and direct in-pod Anthropic calls succeed, this still does **not** look like a deterministic code regression from `820debd`; it looks more like infra/runtime drift or node instability that happened to surface after that deploy.

#### 8) Recommendation: should we add retry-with-backoff around Anthropic fetch?
**Yes. Recommended.**

Reasoning:
- The current main HTML-generation path already allows one higher-level retry, but it retries **immediately** with no transport backoff/jitter.
- The logic-classifier Anthropic call in `prepareToolLogic()` appears to have **no retry at all**, and a single transient fetch failure there can 500 the whole request before `build_started`.
- Historical evidence shows the failure mode is often short-lived: the same endpoint fails twice quickly, then a fresh request shortly after succeeds. That is exactly the shape where **1-2 network-layer retries with jittered backoff** help.

Recommended resilience change for the application team (reporting only; not implemented here):
- wrap Anthropic `fetch()` calls with a small retry policy for **network-layer throw cases only** (`fetch failed`, connection reset, DNS/TLS/socket errors), separate from the existing HTML-validation retry logic
- use short bounded backoff/jitter (for example ~1s then ~3s, staying well inside the route budget)
- apply it to both:
  - the pre-build `requestAnthropicText()` helper used by logic classification/codegen, and
  - the main HTML-generation request path
- also log the full error object / `.cause` when a retryable network failure occurs so future incidents reveal `ENOTFOUND` vs `ECONNRESET` vs timeout instead of only `fetch failed`

Separate but important design note:
- because server-side logic generation is optional/fallbackable, the classifier path should ideally **fail open** instead of taking down the whole route when Anthropic has a brief transport blip. That is an application-behavior recommendation, not an infra change.

#### Plain-text summary
Root cause of the two observed `fetch failed` requests: **most likely a transient network-layer Anthropic fetch failure in the pre-build `prepareToolLogic()` classifier call**, with the exact low-level undici cause **not recoverable from current runtime logs** because the route only logs `error.message`, not the underlying `.cause`. Broader contributing context: this Porter environment also showed pod/node instability signals (`readiness/liveness` timeouts, `NodeNotReady`, recent capacity pressure), which make transient transport failures more plausible.

Transient or persistent: **intermittent/flaky**. I reproduced **2 successes and 1 failure** on the live public endpoint during this investigation.

Related to `820debd` deploy or pre-existing infra drift: **the failures first show up after `820debd` rolled out; prior `edb0dc5` logs show successful generations and no matching route-level fetch failures.** However, the evidence does **not** support a deterministic app-code regression in `820debd`; it points to **post-deploy infra/runtime instability** on this Porter app/cluster.

Action requiring coordinator/user approval before any fix: **any remediation beyond reporting needs approval**, especially if you want either (a) Porter-side escalation/capacity changes, or (b) an application resilience change adding retry/backoff / fail-open behavior around Anthropic fetches. I did **not** modify secrets, rotate keys, roll back, or change Porter config.
