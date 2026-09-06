import { createZodSchemaFromSpec, type ToolLogicContract } from "@/lib/tool-logic/spec";
import { runPorterCommand, runPorterJson } from "@/lib/tool-logic/porter-cli";

const TOOL_LOGIC_TAG_KEY = "tool_logic";
const NODE_IMAGE = "node:20-alpine";
const BUILD_SANDBOX_TTL = "5m";
const WARM_SANDBOX_TTL = "30m";
const SANDBOX_CPU = "250m";
const SANDBOX_MEMORY = "256Mi";
const DEFAULT_BUILD_TIMEOUT_MS = 180_000;
const DEFAULT_EXEC_TIMEOUT_MS = 30_000;
const HANDLER_MODULE_PATH = "/handler.js";
const INVOKE_RUNNER_PATH = "/invoke-runner.js";

interface PorterSandboxRecord {
	id: string;
	name: string;
	phase?: string;
	tags?: Record<string, string>;
}

interface PorterSnapshotRecord {
	id: string;
	sandbox_id: string;
	status: string;
	t_ready_unix_ms?: number;
}

export interface ToolLogicRuntimeMetadata {
	invokePath: string;
	toolTag: string;
	snapshotId: string;
	warmSandboxName: string | null;
	handlerModulePath: string;
	contract: ToolLogicContract;
	generatedAt: string;
	generationModel: string;
	classificationReason: string;
	handlerSource: string;
	validation: {
		staticAnalysisPassedAt: string;
		smokeTestPassedAt: string;
		smokeTestInputCount: number;
		rulesVersion: string;
	};
}

export interface ToolLogicInvocationResult {
	output: unknown;
	sandboxName: string;
	snapshotId: string;
}

const warmSandboxPromises = new Map<string, Promise<{ sandboxName: string; snapshotId: string }>>();

function sanitizeNameSegment(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "tool";
}

function makeBuildSandboxName(toolTag: string): string {
	return `${sanitizeNameSegment(toolTag)}-build-${Date.now().toString(36)}`;
}

function makeWarmSandboxName(toolTag: string, snapshotId: string): string {
	return `${sanitizeNameSegment(toolTag)}-warm-${snapshotId.slice(0, 8)}-${Date.now().toString(36)}`;
}

function buildInvokeRunnerSource(handlerModulePath: string): string {
	return String.raw`#!/usr/bin/env node
async function readStdin() {
	let raw = "";
	for await (const chunk of process.stdin) raw += chunk;
	return raw;
}

async function main() {
	const { handler } = require(${JSON.stringify(handlerModulePath)});
	if (typeof handler !== "function") {
		throw new Error("Generated handler module must export a handler function.");
	}
	const raw = await readStdin();
	const input = JSON.parse(raw || "null");
	const output = await handler(input);
	process.stdout.write(JSON.stringify(output));
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(message + "\n");
	process.exit(1);
});
`;
}

async function listTaggedSandboxes(
	toolTag: string,
	phase: "all" | "running",
	purpose?: "build" | "warm-pool"
): Promise<PorterSandboxRecord[]> {
	const args = [
		"sandbox",
		"list",
		"--json",
		"--tag",
		`${TOOL_LOGIC_TAG_KEY}=${toolTag}`,
		"--phase",
		phase,
	];
	if (purpose) args.push("--tag", `purpose=${purpose}`);
	return runPorterJson<PorterSandboxRecord[]>(args, { timeoutMs: DEFAULT_EXEC_TIMEOUT_MS });
}

async function createBuildSandbox(toolTag: string, buildTimeoutMs: number): Promise<string> {
	const name = makeBuildSandboxName(toolTag);
	await runPorterCommand(
		[
			"sandbox",
			"create",
			NODE_IMAGE,
			"--name",
			name,
			"--ttl",
			BUILD_SANDBOX_TTL,
			"--cpu",
			SANDBOX_CPU,
			"--memory",
			SANDBOX_MEMORY,
			"--tag",
			`${TOOL_LOGIC_TAG_KEY}=${toolTag}`,
			"--tag",
			"purpose=build",
			"--",
			"sleep",
			"infinity",
		],
		{ timeoutMs: buildTimeoutMs }
	);
	return name;
}

async function writeFilesIntoSandbox(
	sandboxName: string,
	handlerSource: string,
	handlerModulePath: string,
	buildTimeoutMs: number
): Promise<void> {
	const runnerSource = buildInvokeRunnerSource(handlerModulePath);
	const script = [
		`cat > ${handlerModulePath} <<'EOF_HANDLER'`,
		handlerSource,
		"EOF_HANDLER",
		`cat > ${INVOKE_RUNNER_PATH} <<'EOF_RUNNER'`,
		runnerSource,
		"EOF_RUNNER",
		`chmod +x ${handlerModulePath} ${INVOKE_RUNNER_PATH}`,
	].join("\n");
	await runPorterCommand(["sandbox", "exec", sandboxName, "--command", script], {
		timeoutMs: buildTimeoutMs,
	});
}

async function execHandler(
	sandboxName: string,
	handlerModulePath: string,
	input: unknown,
	execTimeoutMs: number
): Promise<unknown> {
	const { stdout } = await runPorterCommand(
		["sandbox", "exec", sandboxName, "-i", "--", "node", INVOKE_RUNNER_PATH],
		{
			input: JSON.stringify(input),
			timeoutMs: execTimeoutMs,
		}
	);
	return JSON.parse(stdout);
}

async function snapshotSandbox(name: string, buildTimeoutMs: number): Promise<string> {
	const snapshot = await runPorterJson<PorterSnapshotRecord>(["sandbox", "snapshot", name, "--json"], {
		timeoutMs: buildTimeoutMs,
	});
	if (!snapshot.id) throw new Error("Porter sandbox snapshot did not return an id.");
	return snapshot.id;
}

async function terminateSandbox(name: string): Promise<void> {
	await runPorterCommand(["sandbox", "terminate", name], { timeoutMs: DEFAULT_EXEC_TIMEOUT_MS });
}

async function terminateExistingWarmSandboxes(toolTag: string): Promise<void> {
	const sandboxes = await listTaggedSandboxes(toolTag, "all", "warm-pool");
	for (const sandbox of sandboxes) {
		if (sandbox.phase === "terminated") continue;
		await terminateSandbox(sandbox.name).catch((error) => {
			console.warn("[tool-logic-runtime] failed to terminate stale warm sandbox", error);
		});
	}
}

async function discoverWarmSandbox(toolTag: string, snapshotId: string): Promise<string | null> {
	const sandboxes = await listTaggedSandboxes(toolTag, "running", "warm-pool");
	const matching = sandboxes
		.filter((sandbox) => sandbox.tags?.snapshot === snapshotId)
		.sort((left, right) => right.name.localeCompare(left.name))[0];
	return matching?.name ?? null;
}

async function createWarmSandbox(toolTag: string, snapshotId: string, buildTimeoutMs: number): Promise<string> {
	const sandboxName = makeWarmSandboxName(toolTag, snapshotId);
	await terminateExistingWarmSandboxes(toolTag);
	await runPorterCommand(
		[
			"sandbox",
			"create",
			"--from-snapshot",
			snapshotId,
			"--name",
			sandboxName,
			"--ttl",
			WARM_SANDBOX_TTL,
			"--cpu",
			SANDBOX_CPU,
			"--memory",
			SANDBOX_MEMORY,
			"--tag",
			`${TOOL_LOGIC_TAG_KEY}=${toolTag}`,
			"--tag",
			"purpose=warm-pool",
			"--tag",
			`snapshot=${snapshotId}`,
			"--",
			"sleep",
			"infinity",
		],
		{ timeoutMs: buildTimeoutMs }
	);
	return sandboxName;
}

function shouldRecreateWarmSandbox(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /no running task found|not found|failed: daemon error/i.test(message);
}

export async function buildPromotedToolLogicRuntime(opts: {
	invokePath: string;
	toolTag: string;
	contract: ToolLogicContract;
	handlerSource: string;
	generationModel: string;
	classificationReason: string;
	staticAnalysisPassedAt: string;
	smokeTestInputs: unknown[];
	handlerModulePath?: string;
	buildTimeoutMs?: number;
	execTimeoutMs?: number;
}): Promise<ToolLogicRuntimeMetadata> {
	const handlerModulePath = opts.handlerModulePath ?? HANDLER_MODULE_PATH;
	const buildTimeoutMs = opts.buildTimeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS;
	const execTimeoutMs = opts.execTimeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
	const outputSchema = createZodSchemaFromSpec(opts.contract.output);
	const sandboxName = await createBuildSandbox(opts.toolTag, buildTimeoutMs);

	try {
		await writeFilesIntoSandbox(sandboxName, opts.handlerSource, handlerModulePath, buildTimeoutMs);
		for (const input of opts.smokeTestInputs) {
			const output = await execHandler(sandboxName, handlerModulePath, input, execTimeoutMs);
			outputSchema.parse(output);
		}
		const smokeTestPassedAt = new Date().toISOString();
		const snapshotId = await snapshotSandbox(sandboxName, buildTimeoutMs);
		const warmSandboxName = await createWarmSandbox(opts.toolTag, snapshotId, buildTimeoutMs);
		return {
			invokePath: opts.invokePath,
			toolTag: opts.toolTag,
			snapshotId,
			warmSandboxName,
			handlerModulePath,
			contract: opts.contract,
			generatedAt: smokeTestPassedAt,
			generationModel: opts.generationModel,
			classificationReason: opts.classificationReason,
			handlerSource: opts.handlerSource,
			validation: {
				staticAnalysisPassedAt: opts.staticAnalysisPassedAt,
				smokeTestPassedAt,
				smokeTestInputCount: opts.smokeTestInputs.length,
				rulesVersion: "v1-pure-compute",
			},
		};
	} finally {
		await terminateSandbox(sandboxName).catch((error) => {
			console.warn("[tool-logic-runtime] failed to terminate build sandbox", error);
		});
	}
}

export async function ensureWarmToolLogicSandbox(metadata: ToolLogicRuntimeMetadata): Promise<{
	sandboxName: string;
	snapshotId: string;
}> {
	const cacheKey = `${metadata.toolTag}:${metadata.snapshotId}`;
	const existingWarmName = metadata.warmSandboxName;
	if (!warmSandboxPromises.has(cacheKey)) {
		warmSandboxPromises.set(
			cacheKey,
			(async () => {
				const discovered = await discoverWarmSandbox(metadata.toolTag, metadata.snapshotId);
				const sandboxName = discovered ?? existingWarmName ?? (await createWarmSandbox(metadata.toolTag, metadata.snapshotId, DEFAULT_BUILD_TIMEOUT_MS));
				return { sandboxName, snapshotId: metadata.snapshotId };
			})()
		);
		warmSandboxPromises.get(cacheKey)?.catch(() => {
			warmSandboxPromises.delete(cacheKey);
		});
	}
	return warmSandboxPromises.get(cacheKey) as Promise<{ sandboxName: string; snapshotId: string }>;
}

export async function invokeToolLogicInSandbox(
	metadata: ToolLogicRuntimeMetadata,
	input: unknown
): Promise<ToolLogicInvocationResult> {
	const inputSchema = createZodSchemaFromSpec(metadata.contract.input);
	const outputSchema = createZodSchemaFromSpec(metadata.contract.output);
	const parsedInput = inputSchema.parse(input);
	let warmSandbox = await ensureWarmToolLogicSandbox(metadata);
	try {
		const output = outputSchema.parse(
			await execHandler(warmSandbox.sandboxName, metadata.handlerModulePath, parsedInput, DEFAULT_EXEC_TIMEOUT_MS)
		);
		return { output, sandboxName: warmSandbox.sandboxName, snapshotId: warmSandbox.snapshotId };
	} catch (error) {
		if (!shouldRecreateWarmSandbox(error)) throw error;
		warmSandboxPromises.delete(`${metadata.toolTag}:${metadata.snapshotId}`);
		await terminateSandbox(warmSandbox.sandboxName).catch(() => undefined);
		warmSandbox = await ensureWarmToolLogicSandbox({ ...metadata, warmSandboxName: null });
		const output = outputSchema.parse(
			await execHandler(warmSandbox.sandboxName, metadata.handlerModulePath, parsedInput, DEFAULT_EXEC_TIMEOUT_MS)
		);
		return { output, sandboxName: warmSandbox.sandboxName, snapshotId: warmSandbox.snapshotId };
	}
}
