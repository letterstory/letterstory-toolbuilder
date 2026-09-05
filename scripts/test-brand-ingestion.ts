import { pullBrandProfile } from "../src/lib/brand";

interface ProbeTarget {
	label: string;
	url: string;
}

const DEFAULT_TARGETS: ProbeTarget[] = [
	{ label: "Stripe", url: "stripe.com" },
	{ label: "Ramp", url: "ramp.com" },
	{ label: "Duolingo", url: "duolingo.com" },
	{ label: "Basecamp", url: "basecamp.com" },
];

function describeMap(values: Record<string, string>): string {
	const entries = Object.entries(values);
	if (!entries.length) return "none";

	return entries.map(([key, value]) => `${key}=${value}`).join(", ");
}

function summarizeValue(value: string | null): string {
	if (!value) return "none";
	if (value.length <= 120) return value;
	return `${value.slice(0, 117)}...`;
}

async function main() {
	const argTargets =
		process.argv.slice(2).length > 0
			? process.argv.slice(2).map((url) => ({
					label: url,
					url,
				}))
			: DEFAULT_TARGETS;

	console.log(
		`Running Context.dev brand-ingestion probe for ${argTargets.length} site${argTargets.length === 1 ? "" : "s"}.\n`
	);

	for (const target of argTargets) {
		console.log(`=== ${target.label} (${target.url}) ===`);

		try {
			const profile = await pullBrandProfile(target.url);
			console.log(`normalized url: ${profile.url}`);
			console.log(`brand name: ${profile.brandName ?? "none"}`);
			console.log(`confidence: ${profile.confidence ?? "none"}`);
			console.log(`primary logo: ${summarizeValue(profile.primaryLogoUrl)}`);
			console.log(
				`logo urls (${profile.logoUrls.length}): ${
					profile.logoUrls.length
						? profile.logoUrls.map((logoUrl) => summarizeValue(logoUrl)).join(", ")
						: "none"
				}`
			);
			console.log(`colors (${Object.keys(profile.colors).length}): ${describeMap(profile.colors)}`);
			console.log(
				`fonts (${profile.fonts.length}): ${profile.fonts.length ? profile.fonts.join(", ") : "none"}`
			);
			console.log(
				`typography keys: ${
					Object.keys(profile.typography).length
						? Object.keys(profile.typography).join(", ")
						: "none"
				}`
			);
			console.log(
				`spacing keys: ${Object.keys(profile.spacing).length ? Object.keys(profile.spacing).join(", ") : "none"}`
			);
			console.log(
				`component keys: ${
					Object.keys(profile.components).length
						? Object.keys(profile.components).join(", ")
						: "none"
				}`
			);
			console.log(
				`image keys: ${Object.keys(profile.images).length ? Object.keys(profile.images).join(", ") : "none"}`
			);
			console.log(
				`personality keys: ${
					Object.keys(profile.personality).length
						? Object.keys(profile.personality).join(", ")
						: "none"
				}`
			);
			console.log(
				`design-system keys: ${
					Object.keys(profile.designSystem).length
						? Object.keys(profile.designSystem).join(", ")
						: "none"
				}`
			);
			if (Object.keys(profile.metadata).length) {
				const title = typeof profile.metadata.title === "string" ? profile.metadata.title : "n/a";
				const statusCode =
					typeof profile.metadata.statusCode === "number"
						? String(profile.metadata.statusCode)
						: "n/a";
				console.log(`page metadata: title="${title}", statusCode=${statusCode}`);
			}
		} catch (error) {
			console.log(`error: ${error instanceof Error ? error.message : String(error)}`);
		}

		console.log("");
	}
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
