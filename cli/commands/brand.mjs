import { commandFailed, parseArgv, printJson, readJsonInput } from "../client.mjs";

function requireSiteUrl(options) {
	const siteUrl = typeof options["site-url"] === "string" ? options["site-url"] : "";
	if (!siteUrl.trim()) throw new Error("Missing required --site-url <url>.");
	return siteUrl;
}

export async function runBrandCommand({ client, argv }) {
	const { positionals, options } = parseArgv(argv);
	const action = positionals[0];

	if (action === "ingest") {
		const response = await client.callTool("ingest_brand_context", { siteUrl: requireSiteUrl(options) });
		printJson(response.output);
		return commandFailed(response.output) ? 1 : 0;
	}

	if (action === "validate") {
		const profile = await readJsonInput({
			file: typeof options["profile-file"] === "string" ? options["profile-file"] : null,
			stdin: options.stdin === true,
		});
		if (!profile) throw new Error("Provide --profile-file <path> or --stdin.");
		const response = await client.callTool("validate_brand_fidelity", {
			siteUrl: requireSiteUrl(options),
			profile,
		});
		printJson(response.output);
		return commandFailed(response.output) ? 1 : 0;
	}

	throw new Error("Usage: toolbuilder brand <ingest|validate> [...options]");
}
