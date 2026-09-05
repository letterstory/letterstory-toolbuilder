// Supabase-backed storage for generated tools — the durable, multi-instance-
// safe backend used once SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set
// (see store.ts's dispatcher). Falls back to store.file.ts otherwise.
//
// History is kept as a JSONB array column rather than a second table + join:
// it's a small, application-bounded list (MAX_HISTORY_ENTRIES) per tool, so
// the extra query complexity of normalizing it out wouldn't buy much, and
// keeping the row shape close to GeneratedToolRecord keeps this file a
// thin, easy-to-audit mapping layer instead of its own mini-ORM.

import { getSupabaseClient } from "@/lib/config/supabase";
import {
	buildHistoryEntry,
	contentFromHistoryEntry,
	MAX_HISTORY_ENTRIES,
	type GeneratedToolContent,
	type GeneratedToolRecord,
	type ToolStoreBackend,
} from "./store.types";

const TABLE = "generated_tools";

// snake_case as stored in Postgres — jsonb columns come back from
// supabase-js already parsed (not JSON strings), so no manual parsing here.
interface ToolRow {
	id: string;
	project_name: string;
	prompt: string;
	site_url: string | null;
	brand_snapshot: GeneratedToolRecord["brandSnapshot"];
	html: string;
	copy: GeneratedToolRecord["copy"];
	brand_fidelity: GeneratedToolRecord["brandFidelity"];
	visual_congruence: GeneratedToolRecord["visualCongruence"];
	model: string;
	warnings: string[];
	created_at: string;
	updated_at: string;
	version: number;
	history: GeneratedToolRecord["history"];
}

function rowToRecord(row: ToolRow): GeneratedToolRecord {
	return {
		id: row.id,
		projectName: row.project_name,
		prompt: row.prompt,
		siteUrl: row.site_url,
		brandSnapshot: row.brand_snapshot,
		html: row.html,
		copy: row.copy,
		brandFidelity: row.brand_fidelity,
		visualCongruence: row.visual_congruence,
		model: row.model,
		warnings: row.warnings ?? [],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		version: row.version,
		history: row.history ?? [],
	};
}

function contentToRow(content: GeneratedToolContent) {
	return {
		project_name: content.projectName,
		prompt: content.prompt,
		site_url: content.siteUrl,
		brand_snapshot: content.brandSnapshot,
		html: content.html,
		copy: content.copy,
		brand_fidelity: content.brandFidelity,
		visual_congruence: content.visualCongruence,
		model: content.model,
		warnings: content.warnings,
	};
}

async function saveGeneratedTool(input: GeneratedToolContent): Promise<GeneratedToolRecord> {
	const { data, error } = await getSupabaseClient()
		.from(TABLE)
		.insert({ ...contentToRow(input), version: 1, history: [] })
		.select()
		.single();
	if (error || !data) {
		throw new Error(`Failed to save generated tool: ${error?.message ?? "unknown error"}`);
	}
	return rowToRecord(data as ToolRow);
}

async function getGeneratedTool(id: string): Promise<GeneratedToolRecord | null> {
	const { data, error } = await getSupabaseClient().from(TABLE).select("*").eq("id", id).maybeSingle();
	if (error || !data) return null;
	return rowToRecord(data as ToolRow);
}

async function updateGeneratedTool(
	id: string,
	updates: GeneratedToolContent
): Promise<GeneratedToolRecord | null> {
	const existing = await getGeneratedTool(id);
	if (!existing) return null;

	const previousSnapshot = buildHistoryEntry(existing);
	const nextHistory = [previousSnapshot, ...existing.history].slice(0, MAX_HISTORY_ENTRIES);

	const { data, error } = await getSupabaseClient()
		.from(TABLE)
		.update({
			...contentToRow(updates),
			updated_at: new Date().toISOString(),
			version: existing.version + 1,
			history: nextHistory,
		})
		.eq("id", id)
		.select()
		.single();
	if (error || !data) return null;
	return rowToRecord(data as ToolRow);
}

async function rollbackGeneratedTool(id: string, toVersion: number): Promise<GeneratedToolRecord | null> {
	const existing = await getGeneratedTool(id);
	if (!existing) return null;

	const target = existing.history.find((entry) => entry.version === toVersion);
	if (!target) return null;

	return updateGeneratedTool(id, contentFromHistoryEntry(target));
}

async function updateGeneratedToolVisualCongruence(
	id: string,
	expectedVersion: number,
	visualCongruence: GeneratedToolRecord["visualCongruence"],
	warnings: string[]
): Promise<GeneratedToolRecord | null> {
	const { data, error } = await getSupabaseClient()
		.from(TABLE)
		.update({
			visual_congruence: visualCongruence,
			warnings,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id)
		.eq("version", expectedVersion)
		.select()
		.maybeSingle();
	if (error || !data) return null;
	return rowToRecord(data as ToolRow);
}

async function listGeneratedTools(): Promise<GeneratedToolRecord[]> {
	const { data, error } = await getSupabaseClient()
		.from(TABLE)
		.select("*")
		.order("created_at", { ascending: false });
	if (error || !data) return [];
	return (data as ToolRow[]).map(rowToRecord);
}

export const supabaseToolStore: ToolStoreBackend = {
	saveGeneratedTool,
	getGeneratedTool,
	updateGeneratedTool,
	updateGeneratedToolVisualCongruence,
	rollbackGeneratedTool,
	listGeneratedTools,
};
