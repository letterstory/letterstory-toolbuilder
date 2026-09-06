### 2026-09-05: Lead fix for CLI subcommand flag parsing
**By:** Lead
**What:** Fixed the CLI-only argv parsing bug that broke documented flag-based subcommands such as `brand ingest --site-url ...` and `tools generate --prompt ...`, while leaving REST and MCP behavior untouched.
**Why:** Tester rejected Backend's CLI artifact as not customer-ready because documented commands failed client-side before any network call.

## Root cause

`cli/toolbuilder.mjs` parsed the entire argv array once at the top level. That consumed subcommand flags like `--site-url` and `--prompt` into the root `options` object, then passed only positional leftovers into `runBrandCommand()` / `runToolsCommand()`. Those subcommand handlers parsed argv a second time, but by then their flags were already gone, so required options appeared missing.

## Fix applied

- Updated `cli/client.mjs`:
  - `parseArgv()` now accepts `{ stopAtFirstPositional: true }` for command-dispatch use.
  - The parser now stops consuming flags after the first positional command when used at the root level, preserving subcommand arguments for the command handlers.
  - Added support for `--flag=value` in addition to the already-documented space-separated form.
- Updated `cli/toolbuilder.mjs` to parse only leading global options (`--url`, `--help`) before dispatching to subcommands.
- Left `cli/commands/brand.mjs` and `cli/commands/tools.mjs` behavior unchanged except that they now correctly receive their own argv.

## Test coverage added

- `tests/unit/cli-client.test.ts`
  - verifies space-separated flags
  - verifies `--flag=value`
  - verifies top-level parsing preserves subcommand flags
- `tests/unit/cli-mcp-parity.test.ts`
  - verifies each documented CLI command shape dispatches to the expected MCP tool
  - covers `health`, `brand ingest`, `brand validate`, `tools list`, `tools list --registry`, `tools get`, `tools generate`, `tools rollback`, `tools show`, and `tools call --json`
- Added `tests/fixtures/brand-profile.json` for documented `brand validate --profile-file` coverage.

## Verification

Manual repro / confirmation:

- `npm run cli -- brand ingest --site-url https://example.com`
  - before: `Missing required --site-url <url>.`
  - after: reaches the server and returns the expected `not_configured` payload
- `npm run cli -- tools generate --prompt "BMI calculator"`
  - before: `Missing required --prompt <text>.`
  - after: reaches the server and returns the expected `not_configured` payload
- Additional documented CLI checks:
  - `npm run cli -- --url http://localhost:3000 health`
  - `npm run cli -- brand validate --site-url https://example.com --profile-file tests/fixtures/brand-profile.json`
  - `npm run cli -- tools list`
  - `npm run cli -- tools list --registry`
  - `npm run cli -- tools show generate_tool`
  - `npm run cli -- tools call generate_tool --json '{"prompt":"BMI calculator"}'`
  - `npm run cli -- tools get fake-tool`
  - `npm run cli -- tools rollback fake-tool --version 1`

Observed result:
- All documented commands now parse and dispatch as documented.
- Commands that lack local credentials or a real tool record now fail at the server/business layer with normal payloads (`not_configured`, validation, or not-found style errors), not at the CLI parser.

Project validation:
- `npm test` ✅
- `npm run parity:check` ✅
- `npm run typecheck` ✅

Cleanup:
- Started `npm run dev` only for local verification, then stopped it and confirmed port 3000 was no longer serving.
