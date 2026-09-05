/**
 * Planned CLI ↔ MCP parity coverage.
 *
 * The mapping table itself is stable from Lead's plan, so those assertions run now.
 * File-content checks stay skipped until Backend lands `cli/commands/*.mjs`.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runBrandCommand } from "../../cli/commands/brand.mjs";
import { runHealthCommand } from "../../cli/commands/health.mjs";
import { runToolsCommand } from "../../cli/commands/tools.mjs";

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
const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
	consoleLog.mockClear();
	consoleError.mockClear();
});

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createClient() {
	return {
		baseUrl: "https://toolbuilder.example.com",
		callTool: vi.fn().mockResolvedValue({ output: { status: "success" } }),
		listTools: vi.fn().mockResolvedValue({
			tools: [{ name: "generate_tool", description: "Generate a tool" }],
		}),
	};
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

describe("documented CLI command behavior", () => {
	it("routes health to get_health", async () => {
		const client = createClient();

		await expect(runHealthCommand({ client })).resolves.toBe(0);
		expect(client.callTool).toHaveBeenCalledWith("get_health", {});
	});

	it("routes brand ingest with documented --site-url syntax", async () => {
		const client = createClient();

		await expect(
			runBrandCommand({
				client,
				argv: ["ingest", "--site-url", "https://stripe.com"],
			})
		).resolves.toBe(0);
		expect(client.callTool).toHaveBeenCalledWith("ingest_brand_context", {
			siteUrl: "https://stripe.com",
		});
	});

	it("routes brand validate with documented --profile-file syntax", async () => {
		const client = createClient();

		await expect(
			runBrandCommand({
				client,
				argv: [
					"validate",
					"--site-url",
					"https://stripe.com",
					"--profile-file",
					path.join(repoRoot, "tests", "fixtures", "brand-profile.json"),
				],
			})
		).resolves.toBe(0);
		expect(client.callTool).toHaveBeenCalledWith("validate_brand_fidelity", {
			siteUrl: "https://stripe.com",
			profile: {
				brandName: "Stripe",
				voice: {
					tone: "clear",
				},
			},
		});
	});

	it("routes tools list to generated tools by default", async () => {
		const client = createClient();

		await expect(runToolsCommand({ client, argv: ["list"] })).resolves.toBe(0);
		expect(client.callTool).toHaveBeenCalledWith("list_generated_tools", {});
		expect(client.listTools).not.toHaveBeenCalled();
	});

	it("routes tools list --registry to MCP discovery", async () => {
		const client = createClient();

		await expect(runToolsCommand({ client, argv: ["list", "--registry"] })).resolves.toBe(0);
		expect(client.listTools).toHaveBeenCalledTimes(1);
		expect(client.callTool).not.toHaveBeenCalled();
	});

	it("routes tools generate with documented flag syntax", async () => {
		const client = createClient();

		await expect(
			runToolsCommand({
				client,
				argv: [
					"generate",
					"--prompt",
					"BMI calculator",
					"--project-name",
					"BMI Calculator",
					"--site-url",
					"https://gymshark.com",
					"--tool-id",
					"bmi-calculator",
				],
			})
		).resolves.toBe(0);
		expect(client.callTool).toHaveBeenCalledWith("generate_tool", {
			projectName: "BMI Calculator",
			siteUrl: "https://gymshark.com",
			prompt: "BMI calculator",
			toolId: "bmi-calculator",
		});
	});

	it("routes tools show to MCP registry lookup", async () => {
		const client = createClient();

		await expect(runToolsCommand({ client, argv: ["show", "generate_tool"] })).resolves.toBe(0);
		expect(client.listTools).toHaveBeenCalledTimes(1);
	});

	it("routes tools call --json to the requested MCP tool", async () => {
		const client = createClient();

		await expect(
			runToolsCommand({
				client,
				argv: ["call", "generate_tool", "--json", '{"prompt":"BMI calculator"}'],
			})
		).resolves.toBe(0);
		expect(client.callTool).toHaveBeenCalledWith("generate_tool", {
			prompt: "BMI calculator",
		});
	});

	it("routes tools get to get_generated_tool", async () => {
		const client = createClient();

		await expect(runToolsCommand({ client, argv: ["get", "tool-123"] })).resolves.toBe(0);
		expect(client.callTool).toHaveBeenCalledWith("get_generated_tool", { id: "tool-123" });
	});

	it("prints the server-provided embed snippet for tools get", async () => {
		const client = createClient();
		client.callTool.mockResolvedValueOnce({
			output: {
				status: "success",
				tool: {
					id: "tool-123",
					projectName: "BMI Calculator",
					embedSnippet: "<iframe src=\"https://server.example.com/t/tool-123\"></iframe>",
				},
			},
		});

		await expect(runToolsCommand({ client, argv: ["get", "tool-123"] })).resolves.toBe(0);
		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining("Embed snippet:\n<iframe src=\"https://server.example.com/t/tool-123\"></iframe>")
		);
	});

	it("falls back to the CLI base URL when generate succeeds without a server embed snippet", async () => {
		const client = createClient();
		client.callTool.mockResolvedValueOnce({
			output: {
				status: "success",
				tool: {
					id: "tool-123",
					projectName: "BMI Calculator",
				},
			},
		});

		await expect(
			runToolsCommand({
				client,
				argv: ["generate", "--prompt", "BMI calculator"],
			})
		).resolves.toBe(0);
		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining('src="https://toolbuilder.example.com/t/tool-123"')
		);
		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining('sandbox="allow-scripts allow-forms allow-popups allow-modals"')
		);
	});

	it("routes tools rollback with documented --version syntax", async () => {
		const client = createClient();

		await expect(
			runToolsCommand({ client, argv: ["rollback", "tool-123", "--version", "2"] })
		).resolves.toBe(0);
		expect(client.callTool).toHaveBeenCalledWith("rollback_generated_tool", {
			id: "tool-123",
			version: 2,
		});
	});
});
