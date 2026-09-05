#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { ToolbuilderClient, parseArgv } from "./client.mjs";
import { runBrandCommand } from "./commands/brand.mjs";
import { runHealthCommand } from "./commands/health.mjs";
import { runToolsCommand } from "./commands/tools.mjs";

export function printHelp(logger = console.log) {
	logger(`toolbuilder CLI

Usage:
  toolbuilder [--url <base-url>] health
  toolbuilder [--url <base-url>] brand ingest --site-url <url>
  toolbuilder [--url <base-url>] brand validate --site-url <url> (--profile-file <path> | --stdin)
  toolbuilder [--url <base-url>] tools list [--registry]
  toolbuilder [--url <base-url>] tools get <id>
  toolbuilder [--url <base-url>] tools generate --prompt <text> [--project-name <name>] [--site-url <url>] [--tool-id <id>]
  toolbuilder [--url <base-url>] tools rollback <id> --version <n>
  toolbuilder [--url <base-url>] tools show <mcp-tool-name>
  toolbuilder [--url <base-url>] tools call <mcp-tool-name> [--json <json> | --stdin]
`);
}

export async function runCli(argv = process.argv.slice(2), { createClient = (options) => new ToolbuilderClient(options) } = {}) {
	const { positionals, options } = parseArgv(argv, {
		stopAtFirstPositional: true,
	});
	if (options.help || positionals.length === 0) {
		printHelp();
		return 0;
	}

	const client = createClient({
		baseUrl: typeof options.url === "string" ? options.url : undefined,
	});

	const [command, ...rest] = positionals;
	let exitCode = 0;
	if (command === "health") {
		exitCode = await runHealthCommand({ client, argv: rest });
	} else if (command === "brand") {
		exitCode = await runBrandCommand({ client, argv: rest });
	} else if (command === "tools") {
		exitCode = await runToolsCommand({ client, argv: rest });
	} else {
		throw new Error(`Unknown command: ${command}`);
	}

	return exitCode;
}

export async function runCliMain(argv = process.argv.slice(2), { logError = console.error, createClient } = {}) {
	try {
		return await runCli(argv, { createClient });
	} catch (error) {
		logError(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const exitCode = await runCliMain();
	process.exit(exitCode);
}
