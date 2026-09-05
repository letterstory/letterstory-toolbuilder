/**
 * Planned CLI ↔ MCP parity coverage.
 *
 * The mapping table itself is stable from Lead's plan, so those assertions run now.
 * File-content checks stay skipped until Backend lands `cli/commands/*.mjs`.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const EXPECTED_CAPABILITIES = [
	"get_health",
	"ingest_brand_context",
	"validate_brand_fidelity",
	"list_generated_tools",
	"get_generated_tool",
	"generate_tool",
	"rollback_generated_tool",
] as const;

const CURATED_COMMAND_MAPPINGS = [
	{ file: "health.mjs", cliCommand: "toolbuilder health", toolName: "get_health" },
	{
		file: "brand.mjs",
		cliCommand: "toolbuilder brand ingest --site-url <url>",
		toolName: "ingest_brand_context",
	},
	{
		file: "brand.mjs",
		cliCommand: "toolbuilder brand validate --site-url <url> --profile-file <path>|--stdin",
		toolName: "validate_brand_fidelity",
	},
	{ file: "tools.mjs", cliCommand: "toolbuilder tools list", toolName: "list_generated_tools" },
	{ file: "tools.mjs", cliCommand: "toolbuilder tools get <id>", toolName: "get_generated_tool" },
	{
		file: "tools.mjs",
		cliCommand: "toolbuilder tools generate --prompt <text>",
		toolName: "generate_tool",
	},
	{
		file: "tools.mjs",
		cliCommand: "toolbuilder tools rollback <id> --version <n>",
		toolName: "rollback_generated_tool",
	},
] as const;

const repoRoot = process.cwd();
const cliCommandsDir = path.join(repoRoot, "cli", "commands");
const cliCommandsExist = existsSync(cliCommandsDir);
const describeWhenReady = cliCommandsExist ? describe : describe.skip;

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("planned curated CLI ↔ MCP mapping table", () => {
	it("covers the exact seven parity capabilities from Lead's plan", () => {
		expect(new Set(CURATED_COMMAND_MAPPINGS.map((mapping) => mapping.toolName))).toEqual(
			new Set(EXPECTED_CAPABILITIES)
		);
	});

	it("keeps CLI command names unique", () => {
		const commands = CURATED_COMMAND_MAPPINGS.map((mapping) => mapping.cliCommand);
		expect(new Set(commands).size).toBe(commands.length);
	});

	it("targets the expected curated command files", () => {
		expect(new Set(CURATED_COMMAND_MAPPINGS.map((mapping) => mapping.file))).toEqual(
			new Set(["health.mjs", "brand.mjs", "tools.mjs"])
		);
	});
});

describeWhenReady("curated CLI implementations", () => {
	it("includes the planned command files once the CLI lands", async () => {
		for (const file of new Set(CURATED_COMMAND_MAPPINGS.map((mapping) => mapping.file))) {
			expect(existsSync(path.join(cliCommandsDir, file))).toBe(true);
		}
	});

	it("keeps generic MCP registry discovery behind tools list --registry", async () => {
		const source = await readFile(path.join(cliCommandsDir, "tools.mjs"), "utf8");
		expect(source).toContain("options.registry");
		expect(source).toContain("client.listTools()");
		expect(source).toContain('client.callTool("list_generated_tools", {})');
	});

	it.each(CURATED_COMMAND_MAPPINGS)(
		`keeps $cliCommand wired to MCP tool "$toolName"`,
		async ({ file, toolName }) => {
			const source = await readFile(path.join(cliCommandsDir, file), "utf8");
			expect(source).toMatch(new RegExp(`["'\`]${escapeRegex(toolName)}["'\`]`));
		}
	);
});
