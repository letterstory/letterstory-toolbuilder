import type { GeneratedToolRecord } from "@/lib/generation/store";

export type RequestState = "idle" | "generating" | "updating";
export type StatusTone = "info" | "success" | "warning" | "destructive";
export type BuilderView = "preview" | "dashboard";
export type ConversationRole = "user" | "assistant" | "system";

export interface StatusMessage {
	title: string;
	description: string;
	tone: StatusTone;
}

export interface BuilderConversationMessage {
	id: string;
	role: ConversationRole;
	content: string;
	meta?: string;
	resultVersion?: number;
	telemetry?: GenerationTelemetry | null;
	actionSummary?: string;
}

export interface BuilderBrandSummary {
	brandName: string | null;
	siteUrl: string | null;
	logoDataUri: string | null;
	colors: Record<string, string>;
	fonts: string[];
}

export interface BuilderBrandUpdateInput {
	colors: Record<string, string>;
	fontFamily?: string;
}

export interface BuilderToolSuggestion {
	title: string;
	description: string;
	prompt: string;
}

export interface BuilderSuggestionBrandContext {
	brandName: string | null;
	industry: string;
	businessSummary: string;
}

// The recent-tools list only ever needs metadata to render cards and link to
// /t/[id] — the API route omits the (potentially large) html body and full
// version history (which itself carries full past HTML bodies).
export type ToolSummary = Omit<GeneratedToolRecord, "html" | "history"> & {
	previousVersionCount: number;
};

// Metadata-only view of a past version, fetched on demand for the version
// history panel — never carries the historical HTML body itself.
export type ToolHistoryEntry = Omit<GeneratedToolRecord["history"][number], "html">;

export interface GenerationTelemetry {
	totalMs: number | null;
	brandMs: number | null;
	buildMs: number | null;
	advisoryMs: number | null;
	attemptsSummary: string | null;
}

export type ActivityStepStatus = "pending" | "active" | "complete";

export interface BuilderActivityStep {
	key: string;
	title: string;
	description: string;
	status: ActivityStepStatus;
	detail?: string;
}

export interface BuilderRunPhase {
	key: string;
	title: string;
	description: string;
	durationMs: number;
}

export interface BuilderGenerationRun {
	startedAt: number;
	projectName: string;
	toolId?: string;
	siteUrl: string;
	brandName?: string | null;
	phases: BuilderRunPhase[];
}
