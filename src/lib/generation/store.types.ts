// Shared types + constants for generated-tool storage. Split out from the
// storage implementation itself so both backends (store.file.ts,
// store.supabase.ts) and the dispatcher (store.ts) can depend on the same
// shapes without a circular import.

import type { BrandCompetitorContext } from "@/lib/brand/competitor-context";
import type { ToolLogicContract } from "@/lib/tool-logic/spec";

export interface GeneratedToolBrandFontFace {
	family: string;
	google: boolean;
	category: string | null;
	files: Record<string, string>;
	fallbacks: string[];
}

export interface GeneratedToolBrandSnapshot {
	brandName: string | null;
	colors: Record<string, string>;
	fonts: string[];
	headingFont?: string | null;
	bodyFont?: string | null;
	headingFontFace?: GeneratedToolBrandFontFace | null;
	bodyFontFace?: GeneratedToolBrandFontFace | null;
	fontFamilyMode?: "embedded_only" | "named_with_fallback";
	/**
	 * `exact_asset`: a real full-logo asset exists and the generator should
	 * render that exact image. `text_only`: no trustworthy full-logo asset is
	 * available, so the header should use brand-name text treatment only.
	 */
	logoPolicy?: "exact_asset" | "text_only";
	logoDataUri: string | null;
	competitorContext?: BrandCompetitorContext | null;
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

export type VisualCongruenceStatus = "pending" | "completed" | "failed";

export interface GeneratedToolVisualCongruence {
	status: VisualCongruenceStatus;
	congruenceScore: number | null;
	verdict: BrandFidelityVerdict | null;
	notes: string;
	risks: string[];
	referenceUrl: string | null;
	analyzedAt: string | null;
}

export interface GeneratedToolLogicRecord {
	invokePath: string;
	toolTag: string;
	snapshotId: string;
	warmSandboxName: string | null;
	handlerModulePath: string;
	contract: ToolLogicContract;
	handlerSource: string;
	generatedAt: string;
	generationModel: string;
	classificationReason: string;
	validation: {
		staticAnalysisPassedAt: string;
		smokeTestPassedAt: string;
		smokeTestInputCount: number;
		rulesVersion: string;
	};
}

/** The generated artifact + everything Claude was told to produce it — shared between the live record and each stored history snapshot. */
export type GeneratedToolContent = {
	projectName: string;
	prompt: string;
	siteUrl: string | null;
	brandSnapshot: GeneratedToolBrandSnapshot | null;
	html: string;
	/** Headline + supporting copy meant to sit above the iframe on the customer's own CMS page. */
	copy: GeneratedToolCopy | null;
	/** Advisory-only LLM cross-check of whether the generated tool's styling is faithful to the brand. */
	brandFidelity: GeneratedToolBrandFidelity | null;
	/** Visual screenshot-vs-screenshot style congruence check against the live brand site. */
	visualCongruence: GeneratedToolVisualCongruence | null;
	/** Optional generated server-side logic runtime metadata for tools that need sandboxed execution. */
	logic?: GeneratedToolLogicRecord | null;
	model: string;
	warnings: string[];
};

/** A previous version's full content, kept so a tool can be rolled back after a bad revision. */
export interface GeneratedToolHistoryEntry extends GeneratedToolContent {
	version: number;
	createdAt: string;
}

export interface GeneratedToolRecord extends GeneratedToolContent {
	id: string;
	createdAt: string;
	/** Bumped on every revision; stays at 1 for a tool that's never been edited. */
	version: number;
	updatedAt: string;
	/** Most-recent-first, capped at MAX_HISTORY_ENTRIES. */
	history: GeneratedToolHistoryEntry[];
}

// Iterative editing keeps the same tool id/embed URL forever, so history
// would otherwise grow unbounded (and each entry carries a full HTML body) —
// cap it to a handful of recent versions, enough for a practical "undo".
export const MAX_HISTORY_ENTRIES = 5;

export interface SaveGeneratedToolOptions {
	id?: string;
}

/** Storage backend contract — implemented by both store.file.ts (dev fallback) and store.supabase.ts (durable/multi-instance-safe). */
export interface ToolStoreBackend {
	saveGeneratedTool(input: GeneratedToolContent, options?: SaveGeneratedToolOptions): Promise<GeneratedToolRecord>;
	getGeneratedTool(id: string): Promise<GeneratedToolRecord | null>;
	updateGeneratedTool(id: string, updates: GeneratedToolContent): Promise<GeneratedToolRecord | null>;
	updateGeneratedToolCompetitorContext(
		id: string,
		expectedVersion: number,
		competitorContext: NonNullable<GeneratedToolBrandSnapshot["competitorContext"]>
	): Promise<GeneratedToolRecord | null>;
	updateGeneratedToolVisualCongruence(
		id: string,
		expectedVersion: number,
		visualCongruence: GeneratedToolVisualCongruence,
		warnings: string[]
	): Promise<GeneratedToolRecord | null>;
	rollbackGeneratedTool(id: string, toVersion: number): Promise<GeneratedToolRecord | null>;
	deleteGeneratedTool(id: string): Promise<boolean>;
	listGeneratedTools(): Promise<GeneratedToolRecord[]>;
}

/** Builds the history snapshot for the content a revision is about to replace — shared by every backend's updateGeneratedTool. */
export function buildHistoryEntry(existing: GeneratedToolRecord): GeneratedToolHistoryEntry {
	return {
		projectName: existing.projectName,
		prompt: existing.prompt,
		siteUrl: existing.siteUrl,
		brandSnapshot: existing.brandSnapshot,
		html: existing.html,
		copy: existing.copy,
		brandFidelity: existing.brandFidelity,
		visualCongruence: existing.visualCongruence,
		logic: existing.logic,
		model: existing.model,
		warnings: existing.warnings,
		version: existing.version,
		createdAt: existing.updatedAt,
	};
}

/** Extracts the revisable content fields from a history entry, for rollback. */
export function contentFromHistoryEntry(entry: GeneratedToolHistoryEntry): GeneratedToolContent {
	return {
		projectName: entry.projectName,
		prompt: entry.prompt,
		siteUrl: entry.siteUrl,
		brandSnapshot: entry.brandSnapshot,
		html: entry.html,
		copy: entry.copy,
		brandFidelity: entry.brandFidelity,
		visualCongruence: entry.visualCongruence,
		logic: entry.logic,
		model: entry.model,
		warnings: entry.warnings,
	};
}
