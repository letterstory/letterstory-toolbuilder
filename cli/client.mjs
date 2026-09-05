const DEFAULT_API_URL = process.env.TOOLBUILDER_API_URL || "http://localhost:3000";

export function parseArgv(argv) {
	const positionals = [];
	const options = {};
	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index];
		if (!value.startsWith("--")) {
			positionals.push(value);
			continue;
		}
		const key = value.slice(2);
		const next = argv[index + 1];
		if (next !== undefined && !next.startsWith("--")) {
			options[key] = next;
			index += 1;
			continue;
		}
		options[key] = true;
	}
	return { positionals, options };
}

export async function readJsonInput({ file, stdin }) {
	if (file) {
		const fs = await import("node:fs/promises");
		return JSON.parse(await fs.readFile(file, "utf8"));
	}
	if (stdin) {
		const chunks = [];
		for await (const chunk of process.stdin) chunks.push(chunk);
		const text = Buffer.concat(chunks).toString("utf8").trim();
		return text ? JSON.parse(text) : {};
	}
	return null;
}

export class ToolbuilderClient {
	constructor({ baseUrl = DEFAULT_API_URL } = {}) {
		this.baseUrl = baseUrl.replace(/\/$/, "");
		this.endpoint = `${this.baseUrl}/api/mcp`;
		this.nextId = 1;
	}

	async discovery() {
		const response = await fetch(this.endpoint, {
			headers: { Accept: "application/json" },
		});
		if (!response.ok) throw new Error(`Discovery failed with HTTP ${response.status}`);
		return response.json();
	}

	async rpc(method, params = {}) {
		const response = await fetch(this.endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: this.nextId++,
				method,
				params,
			}),
		});
		const payload = await response.json();
		if (payload.error) {
			const error = new Error(payload.error.message);
			error.code = payload.error.code;
			error.data = payload.error.data;
			throw error;
		}
		return payload.result;
	}

	initialize() {
		return this.rpc("initialize", {});
	}

	listTools() {
		return this.rpc("tools/list", {});
	}

	callTool(name, args = {}) {
		return this.rpc("tools/call", { name, arguments: args });
	}
}

export function printJson(value) {
	console.log(JSON.stringify(value, null, 2));
}

export function commandFailed(result) {
	return Boolean(
		result &&
			typeof result === "object" &&
			"status" in result &&
			typeof result.status === "string" &&
			result.status !== "success"
	);
}
