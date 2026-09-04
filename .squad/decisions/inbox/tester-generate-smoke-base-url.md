### 2026-09-04: Generation smoke tests take base URL as runtime input
**By:** Tester
**What:** The reusable `/api/tools/generate` smoke test reads the target origin from `TOOL_GENERATOR_BASE_URL` or `--base-url=...` and defaults to `http://localhost:3000` for local dev.
**Why:** The authoritative deployed domain is not source-controlled in this repo, but the same Gymshark/BMI verification path needs to run unchanged against local, staging, and production environments.
