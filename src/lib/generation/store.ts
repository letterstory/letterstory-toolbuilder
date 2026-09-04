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
import type { GeneratedToolContent, GeneratedToolRecord, ToolStoreBackend } from "./store.types";

export type {
	BrandFidelityVerdict,
	GeneratedToolBrandFidelity,
	GeneratedToolBrandSnapshot,
	GeneratedToolContent,
	GeneratedToolCopy,
	GeneratedToolHistoryEntry,
	GeneratedToolRecord,
} from "./store.types";

function backend(): ToolStoreBackend {
	return isSupabaseConfigured() ? supabaseToolStore : fileToolStore;
}

export function isToolStoreDurable(): boolean {
	return isSupabaseConfigured();
}

export async function saveGeneratedTool(input: GeneratedToolContent): Promise<GeneratedToolRecord> {
	return backend().saveGeneratedTool(input);
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

export async function rollbackGeneratedTool(id: string, toVersion: number): Promise<GeneratedToolRecord | null> {
	return backend().rollbackGeneratedTool(id, toVersion);
}

export async function listGeneratedTools(): Promise<GeneratedToolRecord[]> {
	return backend().listGeneratedTools();
}
