/**
 * NOTE: This script depends on Backend's planned MCP registry (`src/lib/mcp/registry.ts`)
 * and curated CLI command files (`cli/commands/*.mjs`) landing first.
 *
 * It is intentionally defensive so CI fails with a clear message when parity files
 * have not been implemented yet, or when MCP/CLI capability drift is introduced later.
 */

import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
	{ file: "health.mjs", toolName: "get_health", cliCommand: "toolbuilder health" },
	{
		file: "brand.mjs",
		toolName: "ingest_brand_context",
		cliCommand: "toolbuilder brand ingest --site-url <url>",
	},
	{
		file: "brand.mjs",
		toolName: "validate_brand_fidelity",
		cliCommand: "toolbuilder brand validate --site-url <url> --profile-file <path>|--stdin",
	},
	{ file: "tools.mjs", toolName: "list_generated_tools", cliCommand: "toolbuilder tools list" },
	{ file: "tools.mjs", toolName: "get_generated_tool", cliCommand: "toolbuilder tools get <id>" },
	{
		file: "tools.mjs",
		toolName: "generate_tool",
		cliCommand: "toolbuilder tools generate --prompt <text>",
	},
	{
		file: "tools.mjs",
		toolName: "rollback_generated_tool",
		cliCommand: "toolbuilder tools rollback <id> --version <n>",
	},
] as const;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_FILE = path.join(REPO_ROOT, "src", "lib", "mcp", "registry.ts");
const CLI_COMMANDS_DIR = path.join(REPO_ROOT, "cli", "commands");

function fail(errors: string[]): never {
	for (const error of errors) {
		console.error(`parity-check: ${error}`);
	}
	process.exit(1);
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRegistryCandidate(moduleExports: Record<string, unknown>): unknown {
	return (
		moduleExports.MCP_TOOL_REGISTRY ??
		moduleExports.TOOLS ??
		moduleExports.registry ??
		moduleExports.default ??
		null
	);
}

function extractRegistryToolNames(candidate: unknown): Set<string> {
	if (!candidate) {
		throw new Error(
			"Registry module did not export a recognized tool collection. Expected a `TOOLS` export (preferred), object, array, or Map."
		);
	}

	if (candidate instanceof Map) {
		return new Set(
			Array.from(candidate.entries()).flatMap(([key, value]) => {
				if (typeof key === "string") return [key];
				if (value && typeof value === "object" && "name" in value && typeof value.name === "string") {
					return [value.name];
				}
				return [];
			})
		);
	}

	if (Array.isArray(candidate)) {
		return new Set(
			candidate.flatMap((entry) => {
				if (entry && typeof entry === "object" && "name" in entry && typeof entry.name === "string") {
					return [entry.name];
				}
				return [];
			})
		);
	}

	if (candidate && typeof candidate === "object") {
		const objectCandidate = candidate as Record<string, unknown>;
		const values = Object.values(objectCandidate);
		const namedValues = values.flatMap((entry) => {
			if (entry && typeof entry === "object" && "name" in entry && typeof entry.name === "string") {
				return [entry.name];
			}
			return [];
		});

		if (namedValues.length > 0) return new Set(namedValues);

		return new Set(
			Object.keys(objectCandidate).filter((key) => {
				const value = objectCandidate[key];
				return value !== undefined && value !== null;
			})
		);
	}

	throw new Error(`Unsupported registry export type: ${typeof candidate}`);
}

function extractCallToolReferences(source: string): string[] {
	const references = new Set<string>();
	const callToolPatterns = [
		/callTool\s*\(\s*["'`]([^"'`]+)["'`]/g,
		/callTool\s*\(\s*\{\s*name\s*:\s*["'`]([^"'`]+)["'`]/g,
	];

	for (const pattern of callToolPatterns) {
		for (const match of source.matchAll(pattern)) {
			if (match[1]) references.add(match[1]);
		}
	}

	return Array.from(references);
}

async function loadRegistryToolNames(): Promise<Set<string>> {
	const moduleUrl = pathToFileURL(REGISTRY_FILE).href;
	const registryModule = (await import(moduleUrl)) as Record<string, unknown>;
	return extractRegistryToolNames(getRegistryCandidate(registryModule));
}

async function main() {
	const errors: string[] = [];

	if (!(await pathExists(REGISTRY_FILE))) {
		errors.push(
			`missing MCP registry at ${path.relative(REPO_ROOT, REGISTRY_FILE)}. Backend step 1 from the parity plan has not landed yet.`
		);
	}

	if (!(await pathExists(CLI_COMMANDS_DIR))) {
		errors.push(
			`missing curated CLI commands directory at ${path.relative(REPO_ROOT, CLI_COMMANDS_DIR)}. Backend step 2 from the parity plan has not landed yet.`
		);
	}

	if (errors.length > 0) fail(errors);

	const registryToolNames = await loadRegistryToolNames();

	for (const capability of EXPECTED_CAPABILITIES) {
		if (!registryToolNames.has(capability)) {
			errors.push(`registry is missing expected capability "${capability}".`);
		}
	}

	const commandFiles = (await readdir(CLI_COMMANDS_DIR))
		.filter((entry) => entry.endsWith(".mjs"))
		.sort((left, right) => left.localeCompare(right));

	if (commandFiles.length === 0) {
		errors.push(
			`no curated CLI command files were found in ${path.relative(REPO_ROOT, CLI_COMMANDS_DIR)}.`
		);
	}

	for (const expectedFile of new Set(CURATED_COMMAND_MAPPINGS.map(({ file }) => file))) {
		if (!commandFiles.includes(expectedFile)) {
			errors.push(`expected curated CLI command file "${path.join("cli", "commands", expectedFile)}" is missing.`);
		}
	}

	for (const commandFile of commandFiles) {
		const filePath = path.join(CLI_COMMANDS_DIR, commandFile);
		const source = await readFile(filePath, "utf8");
		const referencedTools = extractCallToolReferences(source);

		if (referencedTools.length === 0) {
			errors.push(
				`${path.relative(REPO_ROOT, filePath)} does not contain any recognizable callTool(...) MCP references.`
			);
			continue;
		}

		for (const referencedTool of referencedTools) {
			if (!registryToolNames.has(referencedTool)) {
				errors.push(
					`${path.relative(REPO_ROOT, filePath)} references "${referencedTool}", but that tool is not present in src/lib/mcp/registry.ts.`
				);
			}
		}
	}

	for (const mapping of CURATED_COMMAND_MAPPINGS) {
		const filePath = path.join(CLI_COMMANDS_DIR, mapping.file);
		if (!(await pathExists(filePath))) continue;

		const source = await readFile(filePath, "utf8");
		const expectedReference = new RegExp(`["'\`]${escapeRegex(mapping.toolName)}["'\`]`);
		if (!expectedReference.test(source)) {
			errors.push(
				`${path.relative(REPO_ROOT, filePath)} is expected to back "${mapping.cliCommand}" but does not reference MCP tool "${mapping.toolName}".`
			);
		}
	}

	if (errors.length > 0) fail(errors);

	console.log(
		`parity-check: OK — verified ${registryToolNames.size} MCP tools and ${commandFiles.length} curated CLI command file(s).`
	);
}

void main().catch((error) => {
	console.error(`parity-check: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
