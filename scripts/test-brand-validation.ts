import { pullBrandProfile, validateBrandFidelity } from "../src/lib/brand";

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

async function main() {
	console.log(`Running full brand validation for ${DEFAULT_TARGETS.length} sites.\n`);

	for (const target of DEFAULT_TARGETS) {
		console.log(`=== ${target.label} (${target.url}) ===`);
		try {
			const profile = await pullBrandProfile(target.url);
			console.log(`brand name: ${profile.brandName ?? "none"}`);
			console.log(`colors: ${describeMap(profile.colors)}`);
			console.log(`fonts: ${profile.fonts.join(", ") || "none"}`);
			console.log(`typography hierarchy: ${profile.typography.hierarchy ?? "unknown"}`);
			console.log(`spacing rhythm: ${profile.spacing.rhythm ?? "unknown"}`);
			console.log(`tone of voice: ${profile.personality.toneOfVoice ?? "unknown"}`);
			console.log(`imagery style: ${profile.images.imageryStyle ?? "unknown"}`);
			console.log(`logo kind: ${profile.images.logo.kind ?? "unknown"}`);
			if (profile.images.notes.length) {
				console.log(`image notes: ${profile.images.notes.join(" | ")}`);
			}

			const fidelity = await validateBrandFidelity(profile, target.url);
			if (fidelity.status === "success") {
				console.log(
					`fidelity: ${fidelity.assessment.status} ${fidelity.assessment.similarityScore}/100 (${fidelity.assessment.confidence})`
				);
				console.log(`fidelity summary: ${fidelity.assessment.summary}`);
				if (fidelity.assessment.gaps.length) {
					console.log(
						`gaps: ${fidelity.assessment.gaps
							.map((gap) => `${gap.field}/${gap.severity}: ${gap.issue}`)
							.join(" | ")}`
					);
				}
			} else {
				console.log(`fidelity: ${fidelity.status} (${fidelity.code}) ${fidelity.message}`);
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
