import { commandFailed, printJson } from "../client.mjs";

export async function runHealthCommand({ client }) {
	const response = await client.callTool("get_health", {});
	printJson(response.output);
	return commandFailed(response.output) ? 1 : 0;
}
