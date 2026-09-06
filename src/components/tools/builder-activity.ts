import type {
	BuilderActivityStep,
	BuilderConversationMessage,
	BuilderGenerationRun,
	BuilderRunPhase,
	GenerationTelemetry,
	ToolSummary,
} from "@/components/tools/builder-types";

const WITH_BRAND_PHASES: BuilderRunPhase[] = [
	{
		key: "brand-profile",
		title: "Fetching brand profile",
		description: "Pulling the source site and resolving the core brand snapshot.",
		durationMs: 8_000,
	},
	{
		key: "logo",
		title: "Resolving logo asset",
		description: "Finding the strongest available logo treatment for the generated header.",
		durationMs: 9_000,
	},
	{
		key: "colors",
		title: "Extracting brand colors",
		description: "Collecting usable primary, secondary, accent, background, and text tokens.",
		durationMs: 10_000,
	},
	{
		key: "fonts",
		title: "Extracting brand fonts",
		description: "Capturing heading/body font families so the tool can inherit the brand voice.",
		durationMs: 12_000,
	},
	{
		key: "copy-layout",
		title: "Generating tool copy & layout",
		description: "Writing the experience, interactions, and branded structure for the tool.",
		durationMs: 28_000,
	},
	{
		key: "html",
		title: "Writing embeddable HTML",
		description: "Producing the self-contained HTML/CSS/JS document served in the live preview.",
		durationMs: 18_000,
	},
];

const WITHOUT_BRAND_PHASES: BuilderRunPhase[] = [
	{
		key: "brief",
		title: "Interpreting build brief",
		description: "Turning your prompt into a concrete interface, logic plan, and output structure.",
		durationMs: 10_000,
	},
	{
		key: "copy-layout",
		title: "Generating tool copy & layout",
		description: "Writing the experience, interactions, and supporting copy for the tool.",
		durationMs: 30_000,
	},
	{
		key: "html",
		title: "Writing embeddable HTML",
		description: "Producing the self-contained HTML/CSS/JS document served in the live preview.",
		durationMs: 20_000,
	},
];

export function buildGenerationRun(input: {
	projectName: string;
	siteUrl: string;
	toolId?: string;
	brandName?: string | null;
	reusesExistingBrand: boolean;
}): BuilderGenerationRun {
	const includeBrandStages = Boolean(input.siteUrl) && !input.reusesExistingBrand;
	return {
		startedAt: Date.now(),
		projectName: input.projectName,
		siteUrl: input.siteUrl,
		toolId: input.toolId,
		brandName: input.brandName,
		phases: includeBrandStages ? WITH_BRAND_PHASES : WITHOUT_BRAND_PHASES,
	};
}

export function estimateActivitySteps(
	run: BuilderGenerationRun,
	now = Date.now(),
	telemetry?: GenerationTelemetry | null
): BuilderActivityStep[] {
	const elapsedMs = Math.max(0, now - run.startedAt);
	let spentMs = 0;

	return run.phases.map((phase, index) => {
		const phaseStart = spentMs;
		const phaseEnd = phaseStart + phase.durationMs;
		spentMs = phaseEnd;

		const isComplete = telemetry ? true : elapsedMs >= phaseEnd;
		const isActive = !telemetry && !isComplete && elapsedMs >= phaseStart;
		const status: BuilderActivityStep["status"] = isComplete
			? "complete"
			: isActive
				? "active"
				: "pending";

		return {
			key: phase.key,
			title: phase.title,
			description: phase.description,
			status,
			detail: formatPhaseDetail({
				phase,
				stepIndex: index,
				telemetry,
				elapsedMs,
				phaseStart,
			}),
		};
	});
}

export function estimateProgress(run: BuilderGenerationRun, now = Date.now()): number {
	const totalMs = run.phases.reduce((sum, phase) => sum + phase.durationMs, 0);
	if (!totalMs) return 0;
	const elapsed = Math.max(0, now - run.startedAt);
	return Math.max(6, Math.min(96, Math.round((elapsed / totalMs) * 100)));
}

export function parseGenerationTelemetry(response: Response): GenerationTelemetry {
	const serverTiming = response.headers.get("server-timing");
	const attemptsHeader = response.headers.get("x-tool-generation-attempts");
	const durations = new Map<string, number>();

	for (const entry of (serverTiming ?? "").split(",")) {
		const [label, ...rest] = entry.trim().split(";");
		const durToken = rest.find((part) => part.trim().startsWith("dur="));
		const duration = Number(durToken?.trim().replace(/^dur=/, ""));
		if (label && Number.isFinite(duration)) durations.set(label, duration);
	}

	return {
		totalMs: durations.get("total") ?? null,
		brandMs: durations.get("brand") ?? null,
		buildMs: durations.get("build") ?? null,
		advisoryMs: durations.get("advisory") ?? null,
		attemptsSummary: attemptsHeader ? summarizeAttempts(attemptsHeader) : null,
	};
}

export function buildSuccessReply(
	tool: ToolSummary,
	isUpdate: boolean
): BuilderConversationMessage {
	const brandName = tool.brandSnapshot?.brandName;
	const versionNote = isUpdate
		? `Version ${tool.version} of ${tool.projectName} is ready.`
		: `${tool.projectName} is ready.`;
	const summaryNote = tool.copy?.supportingCopy
		? ensureSentence(tool.copy.supportingCopy)
		: isUpdate
			? "Your latest changes are live in the preview."
			: "You can review it in the live preview now.";
	const brandNote = brandName
		? `I used ${brandName}'s brand context${tool.siteUrl ? ` from ${tool.siteUrl}` : ""}.`
		: tool.siteUrl
			? `I used brand context from ${tool.siteUrl}.`
			: "I built this without a linked brand site, so styling comes from the prompt alone.";
	const warningNote = tool.warnings.length
		? ` There ${tool.warnings.length === 1 ? "is" : "are"} ${tool.warnings.length} generation note${tool.warnings.length === 1 ? "" : "s"} in the dashboard tab.`
		: "";
	const closingNote = " Want to tweak anything else, or add another feature?";

	return {
		id: crypto.randomUUID(),
		role: "assistant",
		content: `${versionNote} ${summaryNote} ${brandNote}${warningNote}${closingNote}`,
		meta: isUpdate ? `Updated · v${tool.version}` : "Generated",
		resultVersion: tool.version,
		actionSummary: buildMessageActionSummary(tool.projectName, tool.prompt, isUpdate),
	};
}

export function buildLoadedConversation(tool: ToolSummary): BuilderConversationMessage[] {
	const reply = tool.copy?.supportingCopy
		? tool.copy.supportingCopy
		: tool.brandSnapshot?.brandName
			? `Loaded ${tool.projectName} with ${tool.brandSnapshot.brandName} brand context.`
			: `Loaded ${tool.projectName}.`;

	return [
		{
			id: `${tool.id}-prompt`,
			role: "user",
			content: tool.prompt,
			meta: `Saved prompt · v${tool.version}`,
		},
		{
			id: `${tool.id}-reply`,
			role: "assistant",
			content: reply,
			meta: `Loaded ${formatTimestamp(tool.updatedAt)}`,
		},
	];
}

export function buildRestoredConversationMessage(version: number): BuilderConversationMessage {
	return {
		id: crypto.randomUUID(),
		role: "system",
		content: `Restored version ${version}. The preview now points at that version's content and can be edited again from here.`,
		meta: "Rollback complete",
	};
}

export function formatTimestamp(iso: string): string {
	try {
		return new Date(iso).toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	} catch {
		return iso;
	}
}

export function buildMessageActionSummary(
	projectName: string,
	prompt: string | null | undefined,
	isUpdate: boolean
): string {
	const label = `${isUpdate ? "Edited" : "Wrote"} ${projectName.trim() || "the tool"}`;
	const requestSummary = summarizePrompt(prompt);
	return requestSummary ? `${label} · ${requestSummary}` : label;
}

export function formatDuration(ms: number | null | undefined): string | null {
	if (!ms || !Number.isFinite(ms)) return null;
	if (ms >= 60_000) {
		const minutes = Math.floor(ms / 60_000);
		const seconds = Math.round((ms % 60_000) / 1_000);
		return `${minutes}m ${seconds}s`;
	}
	return `${Math.max(1, Math.round(ms / 1_000))}s`;
}

export function formatThoughtDuration(ms: number | null | undefined): string | null {
	if (!ms || !Number.isFinite(ms)) return null;
	return `Thought for ${Math.max(1, Math.round(ms / 1_000))}s`;
}

function summarizeAttempts(header: string): string {
	const attempts = header
		.split("|")
		.map((segment) => segment.trim())
		.filter(Boolean)
		.map((segment) => {
			const [attempt, outcome, duration] = segment.split(":");
			return `Attempt ${attempt} ${outcome.replace(/_/g, " ")} (${duration?.split("/")[0] ?? "?"}ms)`;
		});
	return attempts.join(" · ");
}

function ensureSentence(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function summarizePrompt(value: string | null | undefined): string | null {
	const normalized = value?.trim().replace(/\s+/g, " ");
	if (!normalized) return null;
	return normalized.length > 96 ? `${normalized.slice(0, 93).trimEnd()}…` : normalized;
}

function formatPhaseDetail(input: {
	phase: BuilderRunPhase;
	stepIndex: number;
	telemetry?: GenerationTelemetry | null;
	elapsedMs: number;
	phaseStart: number;
}): string | undefined {
	const { phase, stepIndex, telemetry, elapsedMs, phaseStart } = input;

	if (telemetry) {
		if (
			phase.key === "brand-profile" ||
			phase.key === "logo" ||
			phase.key === "colors" ||
			phase.key === "fonts"
		) {
			const brandDetail = formatDuration(telemetry.brandMs);
			return brandDetail
				? `Completed within the ${brandDetail} brand-ingestion window.`
				: undefined;
		}
		if (phase.key === "copy-layout" || phase.key === "html" || phase.key === "brief") {
			const buildDetail = formatDuration(telemetry.buildMs);
			return buildDetail ? `Completed within the ${buildDetail} generation window.` : undefined;
		}
		return undefined;
	}

	if (elapsedMs < phaseStart) return undefined;
	if (phaseStart === 0 && stepIndex === 0) return "Started just now.";
	return `Estimated ${formatDuration(Math.max(1_000, elapsedMs - phaseStart)) ?? "1s"} so far.`;
}
