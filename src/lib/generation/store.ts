// Minimal file-backed storage for generated tools.
//
// Why a file store and not a database: the v1 tool product is explicitly
// stateless (no end-user data, no accounts) — the only thing that needs to
// persist is the generated artifact itself so its /t/[id] render URL keeps
// working across requests. A JSON-per-record file store under a git-ignored
// .data/ directory avoids adding a database dependency before one is needed;
// swap this for real storage (Postgres, S3, Porter volume) once tools need to
// survive across deploys/hosts rather than a single local/dev filesystem.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface GeneratedToolBrandSnapshot {
	brandName: string | null;
	colors: Record<string, string>;
	fonts: string[];
	logoDataUri: string | null;
}

export interface GeneratedToolCopy {
	headline: string;
	supportingCopy: string;
}

export type BrandFidelityVerdict = "pass" | "warn" | "fail";

export interface GeneratedToolBrandFidelity {
	verdict: BrandFidelityVerdict;
	notes: string;
}

export interface GeneratedToolRecord {
	id: string;
	projectName: string;
	prompt: string;
	siteUrl: string | null;
	brandSnapshot: GeneratedToolBrandSnapshot | null;
	html: string;
	/** Headline + supporting copy meant to sit above the iframe on the customer's own CMS page. */
	copy: GeneratedToolCopy | null;
	/** Advisory-only LLM cross-check of whether the generated tool's styling is faithful to the brand. */
	brandFidelity: GeneratedToolBrandFidelity | null;
	model: string;
	warnings: string[];
	createdAt: string;
}

const STORE_DIR = path.join(process.cwd(), ".data", "tools");

async function ensureStoreDir(): Promise<void> {
	await mkdir(STORE_DIR, { recursive: true });
}

function recordPath(id: string): string {
	// IDs are always our own randomUUID() output, but guard against path
	// traversal regardless of caller-provided values.
	const safeId = id.replace(/[^a-zA-Z0-9-]/g, "");
	return path.join(STORE_DIR, `${safeId}.json`);
}

export async function saveGeneratedTool(
	input: Omit<GeneratedToolRecord, "id" | "createdAt">
): Promise<GeneratedToolRecord> {
	await ensureStoreDir();
	const record: GeneratedToolRecord = {
		...input,
		id: randomUUID(),
		createdAt: new Date().toISOString(),
	};
	await writeFile(recordPath(record.id), JSON.stringify(record, null, 2), "utf8");
	return record;
}

export async function getGeneratedTool(id: string): Promise<GeneratedToolRecord | null> {
	try {
		const raw = await readFile(recordPath(id), "utf8");
		return JSON.parse(raw) as GeneratedToolRecord;
	} catch {
		return null;
	}
}

export async function listGeneratedTools(): Promise<GeneratedToolRecord[]> {
	try {
		await ensureStoreDir();
		const files = await readdir(STORE_DIR);
		const records = await Promise.all(
			files
				.filter((file) => file.endsWith(".json"))
				.map(async (file) => {
					try {
						const raw = await readFile(path.join(STORE_DIR, file), "utf8");
						return JSON.parse(raw) as GeneratedToolRecord;
					} catch {
						return null;
					}
				})
		);
		return records
			.filter((record): record is GeneratedToolRecord => record !== null)
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	} catch {
		return [];
	}
}
