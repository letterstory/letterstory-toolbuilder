import { spawn } from "node:child_process";
import { envServer } from "@/lib/config/env.server";

interface PorterCommandOptions {
	input?: string;
	timeoutMs?: number;
}

export interface PorterCommandResult {
	stdout: string;
	stderr: string;
}

function porterGlobalArgs(): string[] {
	const args: string[] = [];
	if (envServer.PORTER_PROJECT_ID) args.push("--project", envServer.PORTER_PROJECT_ID);
	if (envServer.PORTER_CLUSTER_ID) args.push("--cluster", envServer.PORTER_CLUSTER_ID);
	if (envServer.PORTER_API_TOKEN) args.push("--token", envServer.PORTER_API_TOKEN);
	return args;
}

function buildErrorMessage(args: string[], stderr: string, timeoutMs: number): string {
	const detail = stderr.trim() || "No stderr output.";
	return `porter ${args.join(" ")} failed: ${detail} (timeout ${timeoutMs}ms)`;
}

export async function runPorterCommand(
	args: string[],
	options: PorterCommandOptions = {}
): Promise<PorterCommandResult> {
	const timeoutMs = options.timeoutMs ?? 60_000;

	return new Promise((resolve, reject) => {
		const child = spawn("porter", [...porterGlobalArgs(), ...args], {
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let settled = false;

		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill("SIGTERM");
			reject(new Error(`porter ${args.join(" ")} timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			reject(error);
		});
		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (code === 0) {
				resolve({ stdout, stderr });
				return;
			}
			reject(new Error(buildErrorMessage(args, stderr, timeoutMs)));
		});

		if (typeof options.input === "string") {
			child.stdin.write(options.input);
		}
		child.stdin.end();
	});
}

export async function runPorterJson<T>(args: string[], options?: PorterCommandOptions): Promise<T> {
	const { stdout } = await runPorterCommand(args, options);
	return JSON.parse(stdout) as T;
}
