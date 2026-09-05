import { commandFailed, parseArgv, printJson, readJsonInput } from "../client.mjs";

function requiredPositional(positionals, index, label) {
	const value = positionals[index];
	if (!value) throw new Error(`Missing required ${label}.`);
	return value;
}

const CLI_IFRAME_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals";

function buildCliEmbedSnippet({ origin, toolId, projectName }) {
	const domId = `letterstory-tool-${toolId}`;
	const iframeTag = `<iframe id="${domId}" src="${origin}/t/${toolId}" sandbox="${CLI_IFRAME_SANDBOX}" style="width:100%;min-height:200px;border:0" title="${escapeHtmlAttribute(projectName)}"></iframe>`;
	const listenerScript = `<script>(function(){
  var frame = document.getElementById(${JSON.stringify(domId)});
  if (!frame) return;
  var expectedOrigin = null;
  try { expectedOrigin = new URL(frame.src, window.location.href).origin; } catch (e) {}
  window.addEventListener("message", function(event){
    if (expectedOrigin && event.origin !== expectedOrigin) return;
    var data = event.data;
    if (!data || data.source !== "letterstory-tool" || data.toolId !== ${JSON.stringify(toolId)}) return;
    if (typeof data.height === "number" && data.height > 0) {
      frame.style.height = data.height + "px";
    }
  });
})();</script>`;
	return `${iframeTag}\n${listenerScript}`;
}

function escapeHtmlAttribute(value) {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function ensureEmbedSnippet(tool, client) {
	if (!tool || typeof tool !== "object") return null;
	if (typeof tool.embedSnippet === "string" && tool.embedSnippet.trim()) {
		return tool.embedSnippet;
	}
	if (typeof tool.id !== "string" || typeof tool.projectName !== "string") return null;
	const origin = typeof client?.baseUrl === "string" && client.baseUrl.trim() ? client.baseUrl : "http://localhost:3000";
	return buildCliEmbedSnippet({ origin: origin.replace(/\/$/, ""), toolId: tool.id, projectName: tool.projectName });
}

function printToolResult(output, client) {
	printJson(output);
	if (commandFailed(output) || !output || typeof output !== "object" || !("tool" in output)) return;
	const embedSnippet = ensureEmbedSnippet(output.tool, client);
	if (!embedSnippet) return;
	console.error(`\nEmbed snippet:\n${embedSnippet}`);
}

export async function runToolsCommand({ client, argv }) {
	const { positionals, options } = parseArgv(argv);
	const action = positionals[0];

	if (action === "list") {
		if (options.registry) {
			const result = await client.listTools();
			printJson(result.tools);
			return 0;
		}
		const response = await client.callTool("list_generated_tools", {});
		printJson(response.output);
		return commandFailed(response.output) ? 1 : 0;
	}

	if (action === "get") {
		const id = requiredPositional(positionals, 1, "tool id");
		const response = await client.callTool("get_generated_tool", { id });
		printToolResult(response.output, client);
		return commandFailed(response.output) ? 1 : 0;
	}

	if (action === "generate") {
		const prompt = typeof options.prompt === "string" ? options.prompt : "";
		if (!prompt.trim()) throw new Error("Missing required --prompt <text>.");
		const response = await client.callTool("generate_tool", {
			projectName: typeof options["project-name"] === "string" ? options["project-name"] : undefined,
			siteUrl: typeof options["site-url"] === "string" ? options["site-url"] : undefined,
			prompt,
			toolId: typeof options["tool-id"] === "string" ? options["tool-id"] : undefined,
		});
		printToolResult(response.output, client);
		return commandFailed(response.output) ? 1 : 0;
	}

	if (action === "rollback") {
		const id = requiredPositional(positionals, 1, "tool id");
		const version = Number(options.version);
		if (!Number.isInteger(version)) throw new Error("Missing required --version <number>.");
		const response = await client.callTool("rollback_generated_tool", { id, version });
		printJson(response.output);
		return commandFailed(response.output) ? 1 : 0;
	}

	if (action === "show") {
		const toolName = requiredPositional(positionals, 1, "tool name");
		const result = await client.listTools();
		const tool = result.tools.find((entry) => entry.name === toolName);
		if (!tool) throw new Error(`Unknown MCP tool: ${toolName}`);
		printJson(tool);
		return 0;
	}

	if (action === "call") {
		const toolName = requiredPositional(positionals, 1, "tool name");
		const inline = typeof options.json === "string" ? JSON.parse(options.json) : null;
		const stdinPayload = options.stdin === true ? await readJsonInput({ stdin: true, file: null }) : null;
		const response = await client.callTool(toolName, inline ?? stdinPayload ?? {});
		printJson(response.output);
		return commandFailed(response.output) ? 1 : 0;
	}

	throw new Error(
		"Usage: toolbuilder tools <list|get|generate|rollback|show|call> [...options]"
	);
}
