/**
 * Live smoke test for /api/tools/generate.
 *
 * Local dev:
 *   npm run smoke:generate
 *
 * Production/staging:
 *   TOOL_GENERATOR_BASE_URL="https://your-deployed-origin" npm run smoke:generate
 *   npm run smoke:generate -- --base-url=https://your-deployed-origin --timeout-ms=330000
 */

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_TIMEOUT_MS = 330_000;
const RESPONSE_PREVIEW_LIMIT = 1200;

interface CliOptions {
	baseUrl: string;
	timeoutMs: number;
}

function parseArgs(argv: string[]): CliOptions {
	let baseUrl = process.env.TOOL_GENERATOR_BASE_URL?.trim() || DEFAULT_BASE_URL;
	let timeoutMs = Number(process.env.TOOL_GENERATOR_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

	for (const arg of argv) {
		if (arg.startsWith("--base-url=")) {
			baseUrl = arg.slice("--base-url=".length).trim() || baseUrl;
			continue;
		}
		if (arg.startsWith("--timeout-ms=")) {
			timeoutMs = Number(arg.slice("--timeout-ms=".length));
		}
	}

	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new Error(`Invalid timeout: ${timeoutMs}`);
	}

	return {
		baseUrl: baseUrl.replace(/\/$/, ""),
		timeoutMs,
	};
}

function truncate(value: string): string {
	if (value.length <= RESPONSE_PREVIEW_LIMIT) return value;
	return `${value.slice(0, RESPONSE_PREVIEW_LIMIT)}…`;
}

function parseServerTiming(header: string | null): Array<{ name: string; durMs: number | null }> {
	if (!header) return [];
	return header
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			const [name, ...params] = part.split(";");
			const durParam = params.find((param) => param.trim().startsWith("dur="));
			const durMs = durParam ? Number(durParam.trim().slice("dur=".length)) : Number.NaN;
			return {
				name: name.trim(),
				durMs: Number.isFinite(durMs) ? durMs : null,
			};
		});
}

async function main() {
	const { baseUrl, timeoutMs } = parseArgs(process.argv.slice(2));
	const url = `${baseUrl}/api/tools/generate`;
	const payload = {
		projectName: "BMI Calculator",
		siteUrl: "gymshark.com",
		prompt:
			"Build a BMI Calculator that lets someone enter height and weight, calculates BMI instantly, explains the BMI category, and looks polished enough to embed on a branded landing page.",
	};

	console.log(`POST ${url}`);
	console.log(`timeoutMs=${timeoutMs}`);
	console.log(`payload=${JSON.stringify(payload)}`);

	const startedAt = performance.now();

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json",
			},
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(timeoutMs),
		});

		const elapsedMs = Math.round(performance.now() - startedAt);
		const contentType = response.headers.get("content-type") ?? "(missing)";
		const serverTiming = response.headers.get("server-timing");
		const attemptHeader = response.headers.get("x-tool-generation-attempts");
		const rawBody = await response.text();
		const preview = truncate(rawBody);

		console.log(`elapsedMs=${elapsedMs}`);
		console.log(`httpStatus=${response.status}`);
		console.log(`contentType=${contentType}`);
		console.log(`serverTiming=${serverTiming ?? "(missing)"}`);
		console.log(`attempts=${attemptHeader ?? "(missing)"}`);
		for (const timing of parseServerTiming(serverTiming)) {
			console.log(`serverTiming.${timing.name}=${timing.durMs ?? "n/a"}ms`);
		}
		console.log(`responsePreview=${preview}`);

		if (!contentType.toLowerCase().includes("application/json")) {
			console.error("Smoke test failed: response was not JSON.");
			process.exitCode = 1;
			return;
		}

		try {
			JSON.parse(rawBody);
		} catch (error) {
			console.error(
				`Smoke test failed: response body was not valid JSON (${error instanceof Error ? error.message : String(error)}).`
			);
			process.exitCode = 1;
			return;
		}

		if (!response.ok) {
			console.error("Smoke test failed: endpoint returned a non-2xx status.");
			process.exitCode = 1;
			return;
		}

		console.log("Smoke test passed.");
	} catch (error) {
		const elapsedMs = Math.round(performance.now() - startedAt);
		console.log(`elapsedMs=${elapsedMs}`);
		console.error(`Smoke test failed: ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	}
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
