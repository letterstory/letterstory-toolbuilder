// Public storage API for generated tools. Dispatches to whichever backend
// is configured — durable/multi-instance Supabase when
// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are set, otherwise the file-backed
// dev fallback — so every other module (routes, orchestrator, the Build
// workspace) can keep importing plain functions from "@/lib/generation/store"
// without knowing or caring which backend is live.
//
// The backend is re-selected on every call (not cached at module load) so
// tests can toggle env vars between cases without re-importing the module.

import { isSupabaseConfigured } from "@/lib/config/supabase";
import { fileToolStore } from "./store.file";
import { supabaseToolStore } from "./store.supabase";
import type {
	GeneratedToolContent,
	GeneratedToolRecord,
	GeneratedToolVisualCongruence,
	SaveGeneratedToolOptions,
	ToolStoreBackend,
} from "./store.types";

export type {
	BrandFidelityVerdict,
	GeneratedToolBrandFidelity,
	GeneratedToolBrandSnapshot,
	GeneratedToolContent,
	GeneratedToolCopy,
	GeneratedToolHistoryEntry,
	GeneratedToolLogicRecord,
	GeneratedToolRecord,
	GeneratedToolVisualCongruence,
	VisualCongruenceStatus,
} from "./store.types";

function backend(): ToolStoreBackend {
	return isSupabaseConfigured() ? supabaseToolStore : fileToolStore;
}

export function isToolStoreDurable(): boolean {
	return isSupabaseConfigured();
}

export async function saveGeneratedTool(
	input: GeneratedToolContent,
	options?: SaveGeneratedToolOptions
): Promise<GeneratedToolRecord> {
	return backend().saveGeneratedTool(input, options);
}

export async function getGeneratedTool(id: string): Promise<GeneratedToolRecord | null> {
	return backend().getGeneratedTool(id);
}

export async function updateGeneratedTool(
	id: string,
	updates: GeneratedToolContent
): Promise<GeneratedToolRecord | null> {
	return backend().updateGeneratedTool(id, updates);
}

export async function updateGeneratedToolIfVersionMatches(
	id: string,
	expectedVersion: number,
	updates: GeneratedToolContent
): Promise<GeneratedToolRecord | null> {
	return backend().updateGeneratedToolIfVersionMatches(id, expectedVersion, updates);
}

export async function updateGeneratedToolCompetitorContext(
	id: string,
	expectedVersion: number,
	competitorContext: NonNullable<GeneratedToolRecord["brandSnapshot"]>["competitorContext"]
): Promise<GeneratedToolRecord | null> {
	if (!competitorContext) return null;
	return backend().updateGeneratedToolCompetitorContext(id, expectedVersion, competitorContext);
}

export async function updateGeneratedToolVisualCongruence(
	id: string,
	expectedVersion: number,
	visualCongruence: GeneratedToolVisualCongruence,
	warnings: string[]
): Promise<GeneratedToolRecord | null> {
	return backend().updateGeneratedToolVisualCongruence(
		id,
		expectedVersion,
		visualCongruence,
		warnings
	);
}

export async function rollbackGeneratedTool(id: string, toVersion: number): Promise<GeneratedToolRecord | null> {
	return backend().rollbackGeneratedTool(id, toVersion);
}

export async function deleteGeneratedTool(id: string): Promise<boolean> {
	return backend().deleteGeneratedTool(id);
}

export async function listGeneratedTools(): Promise<GeneratedToolRecord[]> {
	return backend().listGeneratedTools();
}
