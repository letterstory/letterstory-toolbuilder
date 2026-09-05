// Minimal file-backed storage for generated tools — the dev-local fallback
// used when Supabase isn't configured (see store.ts's dispatcher and
// store.supabase.ts for the durable, multi-instance-safe backend).
//
// A JSON-per-record file store under a git-ignored .data/ directory keeps
// local development working with zero external dependencies, but does NOT
// survive multi-instance/serverless deploys (each instance has its own
// filesystem) — that's exactly the gap store.supabase.ts closes.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	buildHistoryEntry,
	contentFromHistoryEntry,
	MAX_HISTORY_ENTRIES,
	type GeneratedToolContent,
	type GeneratedToolRecord,
	type ToolStoreBackend,
} from "./store.types";

const STORE_DIR = path.join(process.cwd(), ".data", "tools");
const memoryRecords = new Map<string, GeneratedToolRecord>();
let storageMode: "file" | "memory" = "file";

function shouldFallbackToMemory(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error.code === "EACCES" || error.code === "EPERM" || error.code === "EROFS")
	);
}

function activateMemoryFallback(error: unknown): void {
	if (storageMode === "memory") return;
	storageMode = "memory";
	console.warn(
		"[tool-store] File-backed storage is unavailable; falling back to in-memory generated tool storage.",
		error instanceof Error ? error.message : String(error)
	);
}

async function ensureStoreDir(): Promise<boolean> {
	if (storageMode === "memory") return false;
	try {
		await mkdir(STORE_DIR, { recursive: true });
		return true;
	} catch (error) {
		if (shouldFallbackToMemory(error)) {
			activateMemoryFallback(error);
			return false;
		}
		throw error;
	}
}

function recordPath(id: string): string {
	// IDs are always our own randomUUID() output, but guard against path
	// traversal regardless of caller-provided values.
	const safeId = id.replace(/[^a-zA-Z0-9-]/g, "");
	return path.join(STORE_DIR, `${safeId}.json`);
}

// Normalizes records written before iterative editing shipped (missing
// version/updatedAt/history) so old on-disk tools keep working without a
// migration script.
function normalizeRecord(record: GeneratedToolRecord): GeneratedToolRecord {
	return {
		...record,
		visualCongruence: record.visualCongruence ?? null,
		updatedAt: record.updatedAt ?? record.createdAt,
		version: record.version ?? 1,
		history: record.history ?? [],
	};
}

async function saveGeneratedTool(input: GeneratedToolContent): Promise<GeneratedToolRecord> {
	const now = new Date().toISOString();
	const record: GeneratedToolRecord = {
		...input,
		id: randomUUID(),
		createdAt: now,
		updatedAt: now,
		version: 1,
		history: [],
	};
	if (await ensureStoreDir()) {
		try {
			await writeFile(recordPath(record.id), JSON.stringify(record, null, 2), "utf8");
			return record;
		} catch (error) {
			if (!shouldFallbackToMemory(error)) throw error;
			activateMemoryFallback(error);
		}
	}
	memoryRecords.set(record.id, record);
	return record;
}

async function getGeneratedTool(id: string): Promise<GeneratedToolRecord | null> {
	if (storageMode === "memory") {
		return memoryRecords.get(id) ?? null;
	}
	try {
		const raw = await readFile(recordPath(id), "utf8");
		return normalizeRecord(JSON.parse(raw) as GeneratedToolRecord);
	} catch (error) {
		if (shouldFallbackToMemory(error)) {
			activateMemoryFallback(error);
			return memoryRecords.get(id) ?? null;
		}
		return null;
	}
}

async function updateGeneratedTool(
	id: string,
	updates: GeneratedToolContent
): Promise<GeneratedToolRecord | null> {
	const existing = await getGeneratedTool(id);
	if (!existing) return null;

	const previousSnapshot = buildHistoryEntry(existing);
	const record: GeneratedToolRecord = {
		...updates,
		id: existing.id,
		createdAt: existing.createdAt,
		updatedAt: new Date().toISOString(),
		version: existing.version + 1,
		history: [previousSnapshot, ...existing.history].slice(0, MAX_HISTORY_ENTRIES),
	};
	if (storageMode === "memory") {
		memoryRecords.set(id, record);
		return record;
	}
	try {
		await writeFile(recordPath(id), JSON.stringify(record, null, 2), "utf8");
	} catch (error) {
		if (!shouldFallbackToMemory(error)) throw error;
		activateMemoryFallback(error);
		memoryRecords.set(id, record);
	}
	return record;
}

async function updateGeneratedToolVisualCongruence(
	id: string,
	expectedVersion: number,
	visualCongruence: GeneratedToolContent["visualCongruence"],
	warnings: string[]
): Promise<GeneratedToolRecord | null> {
	const existing = await getGeneratedTool(id);
	if (!existing || existing.version !== expectedVersion) return null;

	const record: GeneratedToolRecord = {
		...existing,
		visualCongruence,
		warnings,
		updatedAt: new Date().toISOString(),
	};
	if (storageMode === "memory") {
		memoryRecords.set(id, record);
		return record;
	}
	try {
		await writeFile(recordPath(id), JSON.stringify(record, null, 2), "utf8");
	} catch (error) {
		if (!shouldFallbackToMemory(error)) throw error;
		activateMemoryFallback(error);
		memoryRecords.set(id, record);
	}
	return record;
}

async function rollbackGeneratedTool(id: string, toVersion: number): Promise<GeneratedToolRecord | null> {
	const existing = await getGeneratedTool(id);
	if (!existing) return null;

	const target = existing.history.find((entry) => entry.version === toVersion);
	if (!target) return null;

	return updateGeneratedTool(id, contentFromHistoryEntry(target));
}

async function listGeneratedTools(): Promise<GeneratedToolRecord[]> {
	if (storageMode === "memory") {
		return [...memoryRecords.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}
	try {
		if (!(await ensureStoreDir())) {
			return [...memoryRecords.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		}
		const files = await readdir(STORE_DIR);
		const records = await Promise.all(
			files
				.filter((file) => file.endsWith(".json"))
				.map(async (file) => {
					try {
						const raw = await readFile(path.join(STORE_DIR, file), "utf8");
						return normalizeRecord(JSON.parse(raw) as GeneratedToolRecord);
					} catch {
						return null;
					}
				})
		);
		return records
			.filter((record): record is GeneratedToolRecord => record !== null)
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	} catch (error) {
		if (shouldFallbackToMemory(error)) {
			activateMemoryFallback(error);
			return [...memoryRecords.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		}
		return [];
	}
}

export const fileToolStore: ToolStoreBackend = {
	saveGeneratedTool,
	getGeneratedTool,
	updateGeneratedTool,
	updateGeneratedToolVisualCongruence,
	rollbackGeneratedTool,
	listGeneratedTools,
};
