import type { LoanCalculatorInput, LoanCalculatorOutput } from "@/lib/contracts/tool-logic";
import { loanCalculatorOutputSchema } from "@/lib/contracts/tool-logic";
import {
	getLoanCalculatorHandlerSource,
	LOAN_CALCULATOR_HANDLER_PATH,
} from "./loan-calculator-handler-source";
import { runPorterCommand, runPorterJson } from "./porter-cli";

const LOAN_CALCULATOR_TOOL_TAG = "loan-calculator-demo";
const NODE_IMAGE = "node:20-alpine";
const BUILD_SANDBOX_TTL = "5m";
const WARM_SANDBOX_TTL = "30m";
const WARM_SANDBOX_NAME = "loan-calculator-demo-warm";
const SANDBOX_CPU = "250m";
const SANDBOX_MEMORY = "256Mi";
const BUILD_TIMEOUT_MS = 180_000;
const EXEC_TIMEOUT_MS = 30_000;

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

export interface LoanCalculatorSandboxInvocation {
	output: LoanCalculatorOutput;
	sandboxName: string;
	snapshotId: string;
}

let snapshotPromise: Promise<string> | null = null;
let warmSandboxPromise: Promise<{ sandboxName: string; snapshotId: string }> | null = null;

function makeBuildSandboxName(): string {
	return `loan-calculator-demo-build-${Date.now().toString(36)}`;
}

async function listTaggedSandboxes(
	phase: "all" | "running",
	purpose?: string
): Promise<PorterSandboxRecord[]> {
	const args = [
		"sandbox",
		"list",
		"--json",
		"--tag",
		`tool=${LOAN_CALCULATOR_TOOL_TAG}`,
		"--phase",
		phase,
	];
	if (purpose) args.push("--tag", `purpose=${purpose}`);
	return runPorterJson<PorterSandboxRecord[]>(args, { timeoutMs: EXEC_TIMEOUT_MS });
}

async function listSnapshots(): Promise<PorterSnapshotRecord[]> {
	return runPorterJson<PorterSnapshotRecord[]>(["sandbox", "snapshots", "list", "--json"], {
		timeoutMs: EXEC_TIMEOUT_MS,
	});
}

async function discoverLatestSnapshotId(): Promise<string | null> {
	const [buildSandboxes, snapshots] = await Promise.all([
		listTaggedSandboxes("all", "build"),
		listSnapshots(),
	]);
	const buildSandboxIds = new Set(buildSandboxes.map((sandbox) => sandbox.id));
	const latestSnapshot = snapshots
		.filter((snapshot) => snapshot.status === "ready" && buildSandboxIds.has(snapshot.sandbox_id))
		.sort((left, right) => (right.t_ready_unix_ms ?? 0) - (left.t_ready_unix_ms ?? 0))[0];
	return latestSnapshot?.id ?? null;
}

async function createBuildSandbox(name: string): Promise<void> {
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
			`tool=${LOAN_CALCULATOR_TOOL_TAG}`,
			"--tag",
			"purpose=build",
			"--",
			"sleep",
			"infinity",
		],
		{ timeoutMs: BUILD_TIMEOUT_MS }
	);
}

async function writeHandlerIntoSandbox(name: string): Promise<void> {
	const script = `cat > ${LOAN_CALCULATOR_HANDLER_PATH} <<'EOF'\n${getLoanCalculatorHandlerSource()}\nEOF\nchmod +x ${LOAN_CALCULATOR_HANDLER_PATH}`;
	await runPorterCommand(["sandbox", "exec", name, "--command", script], {
		timeoutMs: BUILD_TIMEOUT_MS,
	});
}

async function snapshotSandbox(name: string): Promise<string> {
	const snapshot = await runPorterJson<PorterSnapshotRecord>(
		["sandbox", "snapshot", name, "--json"],
		{
			timeoutMs: BUILD_TIMEOUT_MS,
		}
	);
	if (!snapshot.id) throw new Error("Porter sandbox snapshot did not return an id.");
	return snapshot.id;
}

async function terminateSandbox(name: string): Promise<void> {
	await runPorterCommand(["sandbox", "terminate", name], { timeoutMs: EXEC_TIMEOUT_MS });
}

async function buildLoanCalculatorSnapshot(): Promise<string> {
	const name = makeBuildSandboxName();
	await createBuildSandbox(name);
	try {
		await writeHandlerIntoSandbox(name);
		return await snapshotSandbox(name);
	} finally {
		await terminateSandbox(name).catch((error) => {
			console.warn("[loan-calculator-sandbox] failed to terminate build sandbox", error);
		});
	}
}

export async function ensureLoanCalculatorSnapshot(): Promise<string> {
	if (!snapshotPromise) {
		snapshotPromise = (async () => {
			const existing = await discoverLatestSnapshotId();
			return existing ?? buildLoanCalculatorSnapshot();
		})();
		snapshotPromise.catch(() => {
			snapshotPromise = null;
		});
	}
	return snapshotPromise;
}

async function terminateExistingWarmSandboxes(): Promise<void> {
	const sandboxes = await listTaggedSandboxes("all", "warm-pool");
	for (const sandbox of sandboxes) {
		if (sandbox.phase === "terminated") continue;
		await terminateSandbox(sandbox.name).catch((error) => {
			console.warn("[loan-calculator-sandbox] failed to terminate stale warm sandbox", error);
		});
	}
}

async function discoverWarmSandbox(snapshotId: string): Promise<string | null> {
	const sandboxes = await listTaggedSandboxes("running", "warm-pool");
	const matching = sandboxes.find(
		(sandbox) => sandbox.name === WARM_SANDBOX_NAME && sandbox.tags?.snapshot === snapshotId
	);
	return matching?.name ?? null;
}

async function createWarmSandbox(snapshotId: string): Promise<string> {
	await terminateExistingWarmSandboxes();
	await runPorterCommand(
		[
			"sandbox",
			"create",
			"--from-snapshot",
			snapshotId,
			"--name",
			WARM_SANDBOX_NAME,
			"--ttl",
			WARM_SANDBOX_TTL,
			"--cpu",
			SANDBOX_CPU,
			"--memory",
			SANDBOX_MEMORY,
			"--tag",
			`tool=${LOAN_CALCULATOR_TOOL_TAG}`,
			"--tag",
			"purpose=warm-pool",
			"--tag",
			`snapshot=${snapshotId}`,
			"--",
			"sleep",
			"infinity",
		],
		{ timeoutMs: BUILD_TIMEOUT_MS }
	);
	return WARM_SANDBOX_NAME;
}

export async function ensureWarmLoanCalculatorSandbox(): Promise<{
	sandboxName: string;
	snapshotId: string;
}> {
	if (!warmSandboxPromise) {
		warmSandboxPromise = (async () => {
			const snapshotId = await ensureLoanCalculatorSnapshot();
			const existing = await discoverWarmSandbox(snapshotId);
			const sandboxName = existing ?? (await createWarmSandbox(snapshotId));
			return { sandboxName, snapshotId };
		})();
		warmSandboxPromise.catch(() => {
			warmSandboxPromise = null;
		});
	}
	return warmSandboxPromise;
}

function shouldRecreateWarmSandbox(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /no running task found|not found|failed: daemon error/i.test(message);
}

async function execLoanCalculator(
	sandboxName: string,
	input: LoanCalculatorInput
): Promise<LoanCalculatorOutput> {
	const { stdout } = await runPorterCommand(
		["sandbox", "exec", sandboxName, "-i", "--", "node", LOAN_CALCULATOR_HANDLER_PATH],
		{
			input: JSON.stringify(input),
			timeoutMs: EXEC_TIMEOUT_MS,
		}
	);
	return loanCalculatorOutputSchema.parse(JSON.parse(stdout));
}

export async function invokeLoanCalculatorInSandbox(
	input: LoanCalculatorInput
): Promise<LoanCalculatorSandboxInvocation> {
	let warmSandbox = await ensureWarmLoanCalculatorSandbox();

	try {
		const output = await execLoanCalculator(warmSandbox.sandboxName, input);
		return { output, sandboxName: warmSandbox.sandboxName, snapshotId: warmSandbox.snapshotId };
	} catch (error) {
		if (!shouldRecreateWarmSandbox(error)) throw error;
		warmSandboxPromise = null;
		await terminateSandbox(warmSandbox.sandboxName).catch(() => undefined);
		warmSandbox = await ensureWarmLoanCalculatorSandbox();
		const output = await execLoanCalculator(warmSandbox.sandboxName, input);
		return { output, sandboxName: warmSandbox.sandboxName, snapshotId: warmSandbox.snapshotId };
	}
}
