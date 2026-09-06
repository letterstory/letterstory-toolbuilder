### 2026-09-05: Fix CLI brand fixture drift and non-JSON 503 handling
**By:** Backend
**What:** Replaced `tests/fixtures/brand-profile.json` with a realistic Stripe-shaped payload that matches the current `brandProfileSchema` exactly, updated CLI/docs examples to point at that fixture, and added coverage that the fixture remains schema-valid. Also changed `cli/client.mjs` to catch JSON parse failures and surface a clear `Server returned a non-JSON response (HTTP <status>)... (Content-Type: <type>)` error, with a CLI-level test proving the message is shown and the command exits with code `1`.
**Why:** Live parity testing showed two production-facing issues: the checked-in fixture had drifted from the contract used by `validate_brand_fidelity`, and cold-start / proxy HTML `503` pages were bubbling up as raw `Unexpected token '<'` parse errors. These fixes keep the documented fixture usable and make transient upstream failures understandable to operators.

**Verification:**
- `npm test -- --run tests/unit/cli-client.test.ts tests/unit/cli-mcp-parity.test.ts`
- `npm test`
- `npm run typecheck`
- `npm run parity:check`
