import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	IFRAME_SANDBOX,
	TOOL_RESIZE_MESSAGE_SOURCE,
	buildEmbedIframeTag,
	buildEmbedListenerScript,
} from "../src/lib/embed/contract";

const DEFAULT_BASE_URL =
	process.env.TOOL_GENERATOR_BASE_URL?.trim() ||
	"https://web-22301-57c6c7ab-4p0z458q.onporter.run";
const DEFAULT_TIMEOUT_MS = Number(process.env.TOOL_GENERATOR_TIMEOUT_MS ?? 330_000);
const RESPONSE_PREVIEW_LIMIT = 1_200;
const BRAND_NOTE_LIMIT = 180;
const MIN_HTML_LENGTH = 300;

interface DomainCase {
	domain: string;
	projectName: string;
	prompt: string;
}

interface CliOptions {
	baseUrl: string;
	timeoutMs: number;
	jsonOutPath: string | null;
	screenshotDir: string | null;
}

interface ServerTimingEntry {
	name: string;
	durMs: number | null;
}

interface AttemptRecord {
	kind: "generate" | "iframe";
	status: number;
	contentType: string;
	elapsedMs: number;
}

interface DomainTestResult {
	domain: string;
	projectName: string;
	prompt: string;
	generationStatus: number;
	generationElapsedMs: number;
	toolId: string | null;
	iframeStatus: number | null;
	iframeContentType: string | null;
	resizeScriptFound: boolean;
	nonTrivialHtml: boolean;
	statusLabel: "pass" | "fail";
	brandNote: string;
	brandFidelityNote: string;
	serverTiming: ServerTimingEntry[];
	serverTimingRaw: string | null;
	attemptHeader: string | null;
	errorMessage: string | null;
	generationResponsePreview: string;
	iframeResponsePreview: string;
	screenshotPath: string | null;
	attempts: AttemptRecord[];
}

interface GenerateSuccessBody {
	status: "success";
	tool: {
		id: string;
		brandSnapshot?: {
			brandName?: string | null;
			colors?: Record<string, string> | null;
			fonts?: string[] | null;
		} | null;
		brandFidelity?: {
			verdict?: string;
			notes?: string;
		} | null;
	};
}

const DOMAIN_CASES: DomainCase[] = [
	{
		domain: "gymshark.com",
		projectName: "BMI Calculator",
		prompt:
			"Build a BMI Calculator that lets someone enter height and weight, calculates BMI instantly, explains the BMI category, and looks polished enough to embed on a branded landing page.",
	},
	{
		domain: "stripe.com",
		projectName: "Payment Processing Fee Calculator",
		prompt:
			"Build a Payment Processing Fee Calculator that lets someone enter a transaction amount and estimated card fee percentage, then shows fee amount and net revenue in a polished branded layout.",
	},
	{
		domain: "notion.so",
		projectName: "Reading Time Estimator",
		prompt:
			"Build a Reading Time Estimator where someone pastes text and instantly sees estimated reading time, word count, and a short reading pace note in a polished branded layout.",
	},
	{
		domain: "allbirds.com",
		projectName: "Carbon Footprint Calculator",
		prompt:
			"Build a Carbon Footprint Calculator that asks for daily commute miles and trips per week, then estimates weekly and yearly emissions with a clean, consumer-friendly explanation.",
	},
	{
		domain: "airbnb.com",
		projectName: "Trip Cost Splitter",
		prompt:
			"Build a Trip Cost Splitter that lets a group enter lodging, transport, food, and activity costs plus number of travelers, then shows total and per-person split clearly.",
	},
	{
		domain: "mailchimp.com",
		projectName: "Email Open Rate Calculator",
		prompt:
			"Build an Email Open Rate Calculator that takes delivered emails and opens, calculates the open rate, and explains the result in marketer-friendly language with polished branded styling.",
	},
];

function parseArgs(argv: string[]): CliOptions {
	let baseUrl = DEFAULT_BASE_URL;
	let timeoutMs = DEFAULT_TIMEOUT_MS;
	let jsonOutPath: string | null = null;
	let screenshotDir: string | null = null;

	for (const arg of argv) {
		if (arg.startsWith("--base-url=")) {
			baseUrl = arg.slice("--base-url=".length).trim() || baseUrl;
			continue;
		}
		if (arg.startsWith("--timeout-ms=")) {
			timeoutMs = Number(arg.slice("--timeout-ms=".length));
			continue;
		}
		if (arg.startsWith("--json-out=")) {
			jsonOutPath = arg.slice("--json-out=".length).trim() || null;
			continue;
		}
		if (arg.startsWith("--screenshot-dir=")) {
			screenshotDir = arg.slice("--screenshot-dir=".length).trim() || null;
		}
	}

	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new Error(`Invalid timeout: ${timeoutMs}`);
	}

	return {
		baseUrl: baseUrl.replace(/\/$/, ""),
		timeoutMs,
		jsonOutPath,
		screenshotDir,
	};
}

function toDomainSlug(domain: string): string {
	return domain.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function truncate(value: string, limit = RESPONSE_PREVIEW_LIMIT): string {
	if (value.length <= limit) return value;
	return `${value.slice(0, limit)}…`;
}

function parseServerTiming(header: string | null): ServerTimingEntry[] {
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

function describeBrandSnapshot(value: GenerateSuccessBody["tool"]["brandSnapshot"]): string {
	if (!value) return "No brand snapshot returned.";

	const colorPreview = Object.entries(value.colors ?? {})
		.slice(0, 4)
		.map(([name, hex]) => `${name}:${hex}`)
		.join(", ");
	const fontPreview = (value.fonts ?? []).slice(0, 3).join(", ");
	const note = [
		value.brandName ? `brand=${value.brandName}` : null,
		colorPreview ? `colors=${colorPreview}` : null,
		fontPreview ? `fonts=${fontPreview}` : null,
	]
		.filter(Boolean)
		.join(" | ");

	return truncate(note || "Brand snapshot present but empty.", BRAND_NOTE_LIMIT);
}

function describeBrandFidelity(body: GenerateSuccessBody): string {
	const fidelity = body.tool.brandFidelity;
	if (!fidelity) return "No brand fidelity advisory returned.";
	const verdict = fidelity.verdict?.trim() || "unknown";
	const notes = fidelity.notes?.trim() || "No notes.";
	return truncate(`${verdict}: ${notes}`, BRAND_NOTE_LIMIT);
}

function safeJsonParse<T>(raw: string): T | null {
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

function isNonTrivialHtml(body: string): boolean {
	const lower = body.toLowerCase();
	return body.length >= MIN_HTML_LENGTH && (lower.includes("<!doctype html") || lower.includes("<html"));
}

function formatDuration(ms: number | null): string {
	if (ms === null || Number.isNaN(ms)) return "n/a";
	return `${(ms / 1000).toFixed(1)}s`;
}

function summarizeTiming(entries: ServerTimingEntry[]): string {
	if (!entries.length) return "n/a";
	return entries.map((entry) => `${entry.name}=${formatDuration(entry.durMs)}`).join(", ");
}

function assertEmbedContractInvariant(baseUrl: string) {
	if (IFRAME_SANDBOX.includes("allow-same-origin")) {
		throw new Error(`Unexpected iframe sandbox drift: ${IFRAME_SANDBOX}`);
	}

	const iframe = buildEmbedIframeTag({
		origin: baseUrl,
		toolId: "contract-check",
		projectName: "Contract Check",
	});
	const listener = buildEmbedListenerScript("contract-check");

	if (!iframe.includes(`sandbox="${IFRAME_SANDBOX}"`)) {
		throw new Error("Embed iframe tag is missing the shared sandbox contract.");
	}
	if (!iframe.includes('loading="lazy"')) {
		throw new Error('Embed iframe tag is missing loading="lazy".');
	}
	if (!listener.includes(TOOL_RESIZE_MESSAGE_SOURCE) || !listener.includes("event.source")) {
		throw new Error("Embed listener script is missing the resize source or frame-window guard.");
	}
	if (!listener.includes("data.version")) {
		throw new Error("Embed listener script is missing the resize contract version guard.");
	}
}

async function ensureParentDir(filePath: string) {
	const parent = path.dirname(filePath);
	await mkdir(parent, { recursive: true });
}

async function captureIframeScreenshot(iframeUrl: string, outputPath: string): Promise<void> {
	const { chromium } = await import("playwright");
	await ensureParentDir(outputPath);

	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage({
			viewport: { width: 1440, height: 1600 },
			deviceScaleFactor: 1,
		});
		await page.goto(iframeUrl, { waitUntil: "networkidle", timeout: 60_000 });
		await page.evaluate(async () => {
			await document.fonts?.ready;
			await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		});
		await page.screenshot({ path: outputPath, fullPage: true });
	} finally {
		await browser.close();
	}
}

async function runDomainCase(
	baseUrl: string,
	timeoutMs: number,
	domainCase: DomainCase,
	screenshotDir: string | null
): Promise<DomainTestResult> {
	const generateUrl = `${baseUrl}/api/tools/generate`;
	const startedAt = performance.now();
	const attempts: AttemptRecord[] = [];
	const payload = {
		projectName: domainCase.projectName,
		siteUrl: `https://${domainCase.domain}`,
		prompt: domainCase.prompt,
	};

	console.log(`\n=== ${domainCase.domain} :: ${domainCase.projectName} ===`);
	console.log(`POST ${generateUrl}`);

	try {
		const generateResponse = await fetch(generateUrl, {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
			},
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(timeoutMs),
		});
		const generationElapsedMs = Math.round(performance.now() - startedAt);
		const generationContentType = generateResponse.headers.get("content-type") ?? "";
		const serverTimingRaw = generateResponse.headers.get("server-timing");
		const attemptHeader = generateResponse.headers.get("x-tool-generation-attempts");
		const generationRawBody = await generateResponse.text();
		const generationBody = safeJsonParse<GenerateSuccessBody & { status?: string; message?: string }>(generationRawBody);

		attempts.push({
			kind: "generate",
			status: generateResponse.status,
			contentType: generationContentType || "(missing)",
			elapsedMs: generationElapsedMs,
		});

		const toolId =
			generateResponse.ok &&
			generationBody?.status === "success" &&
			typeof generationBody.tool?.id === "string" &&
			generationBody.tool.id.trim()
				? generationBody.tool.id
				: null;

		let iframeStatus: number | null = null;
		let iframeContentType: string | null = null;
		let resizeScriptFound = false;
		let nonTrivialHtml = false;
		let iframeResponsePreview = "";
		let screenshotPath: string | null = null;
		let errorMessage =
			generationBody && generationBody.status !== "success" ? generationBody.message ?? "Unknown generation error." : null;
		const brandNote =
			toolId && generationBody?.status === "success" ? describeBrandSnapshot(generationBody.tool.brandSnapshot) : "n/a";
		const brandFidelityNote =
			toolId && generationBody?.status === "success" ? describeBrandFidelity(generationBody) : "n/a";

		if (toolId) {
			const iframeUrl = `${baseUrl}/t/${encodeURIComponent(toolId)}`;
			console.log(`GET ${iframeUrl}`);

			const iframeStartedAt = performance.now();
			const iframeResponse = await fetch(iframeUrl, {
				headers: { accept: "text/html" },
				signal: AbortSignal.timeout(timeoutMs),
			});
			const iframeElapsedMs = Math.round(performance.now() - iframeStartedAt);
			const iframeBody = await iframeResponse.text();

			iframeStatus = iframeResponse.status;
			iframeContentType = iframeResponse.headers.get("content-type");
			resizeScriptFound =
				iframeBody.includes(TOOL_RESIZE_MESSAGE_SOURCE) && iframeBody.includes("ResizeObserver");
			nonTrivialHtml = isNonTrivialHtml(iframeBody);
			iframeResponsePreview = truncate(iframeBody);
			attempts.push({
				kind: "iframe",
				status: iframeResponse.status,
				contentType: iframeContentType ?? "(missing)",
				elapsedMs: iframeElapsedMs,
			});

			if (!iframeResponse.ok) {
				errorMessage = `Embed fetch returned ${iframeResponse.status}.`;
			} else if (!(iframeContentType ?? "").toLowerCase().includes("text/html")) {
				errorMessage = `Embed content-type was ${iframeContentType ?? "(missing)"}.`;
			} else if (!resizeScriptFound) {
				errorMessage = "Resize reporter script markers were missing from /t/[id] HTML.";
			} else if (!nonTrivialHtml) {
				errorMessage = "Embed HTML looked too small or malformed.";
			} else if (screenshotDir) {
				const relativeScreenshotPath = path.join(screenshotDir, `${toDomainSlug(domainCase.domain)}.png`);
				const absoluteScreenshotPath = path.resolve(relativeScreenshotPath);
				await captureIframeScreenshot(iframeUrl, absoluteScreenshotPath);
				screenshotPath = relativeScreenshotPath.split(path.sep).join("/");
			}
		} else if (!errorMessage && !generateResponse.ok) {
			errorMessage = `Generation returned ${generateResponse.status}.`;
		} else if (!errorMessage) {
			errorMessage = "Generation succeeded without a usable tool id.";
		}

		const statusLabel =
			generateResponse.ok &&
			Boolean(toolId) &&
			iframeStatus === 200 &&
			(iframeContentType ?? "").toLowerCase().includes("text/html") &&
			resizeScriptFound &&
			nonTrivialHtml
				? "pass"
				: "fail";

		console.log(
			`result=${statusLabel} generation=${generateResponse.status} iframe=${iframeStatus ?? "n/a"} time=${formatDuration(
				generationElapsedMs
			)} timing=[${summarizeTiming(parseServerTiming(serverTimingRaw))}]`
		);
		if (brandNote !== "n/a") console.log(`brand=${brandNote}`);
		if (brandFidelityNote !== "n/a") console.log(`brandFidelity=${brandFidelityNote}`);
		if (errorMessage) console.log(`error=${truncate(errorMessage, 400)}`);

		return {
			domain: domainCase.domain,
			projectName: domainCase.projectName,
			prompt: domainCase.prompt,
			generationStatus: generateResponse.status,
			generationElapsedMs,
			toolId,
			iframeStatus,
			iframeContentType,
			resizeScriptFound,
			nonTrivialHtml,
			statusLabel,
			brandNote,
			brandFidelityNote,
			serverTiming: parseServerTiming(serverTimingRaw),
			serverTimingRaw,
			attemptHeader,
			errorMessage,
			generationResponsePreview: truncate(generationRawBody),
			iframeResponsePreview,
			screenshotPath,
			attempts,
		};
	} catch (error) {
		const generationElapsedMs = Math.round(performance.now() - startedAt);
		const message = error instanceof Error ? error.message : String(error);
		console.log(`result=fail generation=threw time=${formatDuration(generationElapsedMs)}`);
		console.log(`error=${truncate(message, 400)}`);

		return {
			domain: domainCase.domain,
			projectName: domainCase.projectName,
			prompt: domainCase.prompt,
			generationStatus: 0,
			generationElapsedMs,
			toolId: null,
			iframeStatus: null,
			iframeContentType: null,
			resizeScriptFound: false,
			nonTrivialHtml: false,
			statusLabel: "fail",
			brandNote: "n/a",
			brandFidelityNote: "n/a",
			serverTiming: [],
			serverTimingRaw: null,
			attemptHeader: null,
			errorMessage: message,
			generationResponsePreview: "",
			iframeResponsePreview: "",
			screenshotPath: null,
			attempts,
		};
	}
}

async function main() {
	const { baseUrl, timeoutMs, jsonOutPath, screenshotDir } = parseArgs(process.argv.slice(2));
	assertEmbedContractInvariant(baseUrl);

	console.log(`Running ${DOMAIN_CASES.length} sequential domain checks against ${baseUrl}`);
	console.log(`timeoutMs=${timeoutMs}`);
	if (screenshotDir) console.log(`screenshotDir=${screenshotDir}`);

	const results: DomainTestResult[] = [];
	for (const domainCase of DOMAIN_CASES) {
		results.push(await runDomainCase(baseUrl, timeoutMs, domainCase, screenshotDir));
	}

	const passed = results.filter((result) => result.statusLabel === "pass").length;
	const summary = {
		baseUrl,
		timeoutMs,
		passed,
		total: results.length,
		results,
	};

	console.log(`\nSummary: ${passed}/${results.length} passed.`);
	for (const result of results) {
		console.log(
			`- ${result.domain}: ${result.statusLabel.toUpperCase()} | gen=${result.generationStatus} | iframe=${
				result.iframeStatus ?? "n/a"
			} | resize=${result.resizeScriptFound ? "yes" : "no"}`
		);
	}

	if (jsonOutPath) {
		const resolved = path.resolve(jsonOutPath);
		await ensureParentDir(resolved);
		await writeFile(resolved, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
		console.log(`Wrote JSON report to ${resolved}`);
	}

	if (passed !== results.length) {
		process.exitCode = 1;
	}
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
