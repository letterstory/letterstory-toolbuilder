#!/usr/bin/env node
import { ToolbuilderClient, parseArgv } from "./client.mjs";
import { runBrandCommand } from "./commands/brand.mjs";
import { runHealthCommand } from "./commands/health.mjs";
import { runToolsCommand } from "./commands/tools.mjs";

function printHelp() {
	console.log(`toolbuilder CLI

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

async function main() {
	const { positionals, options } = parseArgv(process.argv.slice(2));
	if (options.help || positionals.length === 0) {
		printHelp();
		process.exit(0);
	}

	const client = new ToolbuilderClient({
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

	process.exit(exitCode);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
