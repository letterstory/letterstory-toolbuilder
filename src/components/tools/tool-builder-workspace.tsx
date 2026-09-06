"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ToolGenerationResult } from "@/lib/generation";
import type { GeneratedToolRecord } from "@/lib/generation/store";
import {
	buildSuccessReply,
	buildGenerationRun,
	buildLoadedConversation,
	buildRestoredConversationMessage,
	estimateActivitySteps,
	estimateProgress,
	formatDuration,
	parseGenerationTelemetry,
} from "@/components/tools/builder-activity";
import { BuilderChatPanel } from "@/components/tools/builder-chat-panel";
import { BuilderDashboardPanel } from "@/components/tools/builder-dashboard-panel";
import { BuilderPreviewCanvas } from "@/components/tools/builder-preview-canvas";
import { BuilderTopbar } from "@/components/tools/builder-topbar";
import type {
	BuilderBrandSummary,
	BuilderConversationMessage,
	BuilderGenerationRun,
	BuilderSuggestionBrandContext,
	BuilderToolSuggestion,
	BuilderView,
	GenerationTelemetry,
	RequestState,
	StatusMessage,
	ToolHistoryEntry,
	ToolSummary,
} from "@/components/tools/builder-types";
import { buildEmbedSnippet } from "@/lib/embed/contract";
import { normalizeSiteUrl } from "@/lib/utils";

const INITIAL_STATUS: StatusMessage = {
	title: "Ready to build",
	description:
		"Describe a branded micro-tool, optionally point at a brand site, and Toolbuilder will generate a real embeddable preview.",
	tone: "info",
};

export function ToolBuilderWorkspace() {
	const composerRef = useRef<HTMLTextAreaElement>(null);
	const [projectName, setProjectName] = useState("");
	const [siteUrl, setSiteUrl] = useState("");
	const [prompt, setPrompt] = useState("");
	const [requestState, setRequestState] = useState<RequestState>("idle");
	const [statusMessage, setStatusMessage] = useState<StatusMessage>(INITIAL_STATUS);
	const [activeView, setActiveView] = useState<BuilderView>("preview");
	const [copiedTarget, setCopiedTarget] = useState<"iframe" | "full" | "url" | null>(null);
	const [activeTool, setActiveTool] = useState<ToolSummary | null>(null);
	const [toolHistory, setToolHistory] = useState<ToolHistoryEntry[]>([]);
	const [recentTools, setRecentTools] = useState<ToolSummary[]>([]);
	const [recentLoading, setRecentLoading] = useState(false);
	const [recentOpen, setRecentOpen] = useState(false);
	const [messages, setMessages] = useState<BuilderConversationMessage[]>([]);
	const [suggestions, setSuggestions] = useState<BuilderToolSuggestion[]>([]);
	const [suggestionBrandContext, setSuggestionBrandContext] =
		useState<BuilderSuggestionBrandContext | null>(null);
	const [suggestionsLoading, setSuggestionsLoading] = useState(false);
	const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
	const [activeRun, setActiveRun] = useState<BuilderGenerationRun | null>(null);
	const [activitySteps, setActivitySteps] = useState(
		() => [] as ReturnType<typeof estimateActivitySteps>
	);
	const [telemetry, setTelemetry] = useState<GenerationTelemetry | null>(null);
	const [progress, setProgress] = useState(0);

	const loadRecentTools = useCallback(async () => {
		setRecentLoading(true);
		try {
			const response = await fetch("/api/tools");
			const data = (await response.json()) as { status: string; tools?: ToolSummary[] };
			setRecentTools(data.tools ?? []);
		} catch {
			// Convenience-only list.
		} finally {
			setRecentLoading(false);
		}
	}, []);

	function handleOpenEmbed() {
		if (!activeTool) return;
		setActiveView("dashboard");
		if (typeof window !== "undefined") {
			window.requestAnimationFrame(() => {
				document.getElementById("builder-embed-section")?.scrollIntoView({
					behavior: "smooth",
					block: "start",
				});
			});
		}
	}

	const loadToolDetail = useCallback(async (id: string, syncActiveTool = false) => {
		try {
			const response = await fetch(`/api/tools/${id}`);
			const data = (await response.json()) as {
				status: string;
				tool?: (ToolSummary & { history?: ToolHistoryEntry[] }) | undefined;
			};
			if (data.status === "success" && data.tool) {
				const tool = data.tool;
				setToolHistory(tool.history ?? []);
				if (syncActiveTool) {
					setActiveTool((current) => (current?.id === tool.id ? toSummary(tool) : current));
				}
				return;
			}
			setToolHistory([]);
		} catch {
			setToolHistory([]);
		}
	}, []);

	useEffect(() => {
		void loadRecentTools();
	}, [loadRecentTools]);

	useEffect(() => {
		if (!recentOpen) return;
		function handleClick(event: MouseEvent) {
			const target = event.target as HTMLElement | null;
			if (!target?.closest("[data-builder-topbar]")) setRecentOpen(false);
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [recentOpen]);

	useEffect(() => {
		if (!activeRun || requestState === "idle") return;
		setActivitySteps(estimateActivitySteps(activeRun));
		setProgress(estimateProgress(activeRun));
		const interval = window.setInterval(() => {
			setActivitySteps(estimateActivitySteps(activeRun));
			setProgress(estimateProgress(activeRun));
		}, 1_000);
		return () => window.clearInterval(interval);
	}, [activeRun, requestState]);

	useEffect(() => {
		if (
			!activeTool ||
			(
				activeTool.visualCongruence?.status !== "pending" &&
				activeTool.brandSnapshot?.competitorContext?.status !== "pending"
			)
		) {
			return;
		}
		const poll = async () => {
			await loadToolDetail(activeTool.id, true);
			void loadRecentTools();
		};
		void poll();
		const interval = window.setInterval(() => {
			void poll();
		}, 4_000);
		return () => window.clearInterval(interval);
	}, [activeTool, loadRecentTools, loadToolDetail]);

	const previewUrl = activeTool ? `/t/${activeTool.id}?v=${activeTool.version}` : null;
	const origin = typeof window !== "undefined" ? window.location.origin : "";
	const embedSnippet = activeTool
		? buildEmbedSnippet({ origin, toolId: activeTool.id, projectName: activeTool.projectName })
		: "";
	const fullEmbedSnippet =
		activeTool && activeTool.copy
			? [
					`<h2>${escapeHtml(activeTool.copy.headline)}</h2>`,
					`<p>${escapeHtml(activeTool.copy.supportingCopy)}</p>`,
					embedSnippet,
				].join("\n")
			: "";
	const activeBrandName = activeTool?.brandSnapshot?.brandName ?? null;
	const brandSummary: BuilderBrandSummary | null = activeTool?.brandSnapshot
		? {
				brandName: activeTool.brandSnapshot.brandName ?? null,
				siteUrl: activeTool.siteUrl ?? null,
				logoDataUri: activeTool.brandSnapshot.logoDataUri,
				colors: activeTool.brandSnapshot.colors,
				fonts: activeTool.brandSnapshot.fonts,
			}
		: null;
	const hostedUrl = activeTool ? `${origin}/t/${activeTool.id}` : "";

	function toSummary(
		tool:
			| GeneratedToolRecord
			| (ToolSummary & {
					history?: ToolHistoryEntry[];
			  })
	): ToolSummary {
		return {
			id: tool.id,
			projectName: tool.projectName,
			prompt: tool.prompt,
			siteUrl: tool.siteUrl,
			brandSnapshot: tool.brandSnapshot,
			copy: tool.copy,
			brandFidelity: tool.brandFidelity,
			visualCongruence: tool.visualCongruence,
			model: tool.model,
			warnings: tool.warnings,
			createdAt: tool.createdAt,
			updatedAt: tool.updatedAt,
			version: tool.version,
			previousVersionCount: Array.isArray(tool.history)
				? tool.history.length
				: "previousVersionCount" in tool
					? tool.previousVersionCount
					: 0,
		};
	}

	function populateFormFrom(item: ToolSummary) {
		setProjectName(item.projectName);
		setSiteUrl(item.siteUrl ?? "");
		setPrompt("");
		setSuggestions([]);
		setSuggestionBrandContext(null);
		setSuggestionsError(null);
	}

	function appendConversation(message: BuilderConversationMessage) {
		setMessages((current) => [...current, message]);
	}

	async function runGeneration(toolId: string | undefined) {
		const trimmedProjectName = projectName.trim();
		if (!trimmedProjectName) {
			setStatusMessage({
				title: "Tool name required",
				description: "Enter a tool name before generating or updating this tool.",
				tone: "destructive",
			});
			return;
		}

		const trimmedPrompt = prompt.trim();
		if (!trimmedPrompt) {
			setStatusMessage({
				title: toolId ? "Update instructions required" : "Describe the tool",
				description: toolId
					? "Describe the change you want to make before updating this tool."
					: "Describe the tool you want to build before generating it.",
				tone: "destructive",
			});
			return;
		}

		setProjectName(trimmedProjectName);
		const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
		setSiteUrl(normalizedSiteUrl);
		setRequestState(toolId ? "updating" : "generating");
		setCopiedTarget(null);
		setActiveView("preview");
		setTelemetry(null);
		let observedTelemetry: GenerationTelemetry | null = null;
		const currentRun = buildGenerationRun({
			projectName: trimmedProjectName,
			siteUrl: normalizedSiteUrl,
			toolId,
			brandName: activeTool?.brandSnapshot?.brandName ?? null,
			reusesExistingBrand: Boolean(
				toolId && normalizeSiteUrl(activeTool?.siteUrl ?? "") === normalizedSiteUrl
			),
		});
		setActiveRun(currentRun);
		setActivitySteps(estimateActivitySteps(currentRun));
		setProgress(estimateProgress(currentRun));
		appendConversation({
			id: crypto.randomUUID(),
			role: "user",
			content: trimmedPrompt,
			meta: toolId
				? `Update request · ${trimmedProjectName}`
				: `Build request · ${trimmedProjectName}`,
		});
		setStatusMessage({
			title: toolId ? "Updating tool" : "Generating tool",
			description: normalizedSiteUrl
				? "Using the live brand-ingestion pipeline first, then generating the tool preview."
				: "Generating the tool preview directly from your prompt.",
			tone: "info",
		});

		try {
			const response = await fetch("/api/tools/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectName: trimmedProjectName,
					siteUrl: normalizedSiteUrl,
					prompt: trimmedPrompt,
					toolId,
				}),
			});
			const responseTelemetry = parseGenerationTelemetry(response);
			observedTelemetry =
				responseTelemetry.totalMs || responseTelemetry.buildMs || responseTelemetry.brandMs
					? responseTelemetry
					: null;
			setTelemetry(observedTelemetry);
			const contentType = response.headers.get("content-type") ?? "";
			if (!contentType.includes("application/json")) {
				throw new Error(
					response.status === 504
						? "The request timed out before the tool finished generating. Try again with a tighter prompt."
						: `Unexpected ${response.status} response from the server — try again in a moment.`
				);
			}
			const data = (await response.json()) as ToolGenerationResult;
			setStatusMessage(toStatusMessage(data, Boolean(toolId), responseTelemetry));
			if (data.status === "success") {
				const summary = toSummary(data.tool);
				setActiveTool(summary);
				setPrompt("");
				setSiteUrl(summary.siteUrl ?? normalizedSiteUrl);
				setProjectName(summary.projectName);
				appendConversation(buildSuccessReply(summary, Boolean(toolId)));
				void loadRecentTools();
				void loadToolDetail(summary.id);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setStatusMessage({
				title: toolId ? "Update failed" : "Generation failed",
				description: message,
				tone: "destructive",
			});
			appendConversation({
				id: crypto.randomUUID(),
				role: "system",
				content: message,
				meta: "Request failed",
			});
		} finally {
			setRequestState("idle");
			setProgress(100);
			setActivitySteps(estimateActivitySteps(currentRun, Date.now(), observedTelemetry));
		}
	}

	function handleSubmit() {
		void runGeneration(activeTool ? activeTool.id : undefined);
	}

	function handleStartNewTool() {
		setActiveTool(null);
		setToolHistory([]);
		setCopiedTarget(null);
		setProjectName("");
		setSiteUrl("");
		setPrompt("");
		setMessages([]);
		setSuggestions([]);
		setSuggestionBrandContext(null);
		setSuggestionsLoading(false);
		setSuggestionsError(null);
		setActiveRun(null);
		setActivitySteps([]);
		setTelemetry(null);
		setProgress(0);
		setActiveView("preview");
		setStatusMessage(INITIAL_STATUS);
		setRecentOpen(false);
	}

	function handleReopenRecent(item: ToolSummary) {
		setActiveTool(item);
		populateFormFrom(item);
		setCopiedTarget(null);
		setMessages(buildLoadedConversation(item));
		setActiveRun(null);
		setActivitySteps([]);
		setTelemetry(null);
		setProgress(0);
		setActiveView("preview");
		void loadToolDetail(item.id);
		setStatusMessage({
			title: "Reopened tool",
			description: `Showing ${item.projectName} v${item.version}. Open it in a new tab from Publish.`,
			tone: "info",
		});
		setRecentOpen(false);
	}

	async function handleRequestSuggestions() {
		const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
		if (!normalizedSiteUrl.trim()) {
			setSuggestionsError("Enter a brand site first to get tailored suggestions.");
			return;
		}

		setSiteUrl(normalizedSiteUrl);
		setSuggestionsLoading(true);
		setSuggestionsError(null);
		try {
			const response = await fetch("/api/tools/suggest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ siteUrl: normalizedSiteUrl }),
			});
			const data = (await response.json()) as
				| {
						status: "success";
						brand: BuilderSuggestionBrandContext;
						suggestions: BuilderToolSuggestion[];
				  }
				| { status: "not_configured" | "error"; message: string };
			if (data.status === "success") {
				setSuggestionBrandContext(data.brand);
				setSuggestions(data.suggestions);
				return;
			}
			setSuggestions([]);
			setSuggestionBrandContext(null);
			setSuggestionsError(data.message);
		} catch (error) {
			setSuggestions([]);
			setSuggestionBrandContext(null);
			setSuggestionsError(
				error instanceof Error
					? error.message
					: "Could not load suggestions right now. You can still write your own prompt."
			);
		} finally {
			setSuggestionsLoading(false);
		}
	}

	function handleSelectSuggestion(suggestion: BuilderToolSuggestion) {
		setProjectName(suggestion.title);
		setPrompt(suggestion.prompt);
		setSuggestionsError(null);
		setStatusMessage({
			title: "Suggestion loaded",
			description: `Loaded ${suggestion.title}. Review or edit the prompt before building.`,
			tone: "info",
		});
		window.requestAnimationFrame(() => composerRef.current?.focus());
	}

	async function handleRollback(version: number) {
		if (!activeTool) return false;
		setRequestState("updating");
		setStatusMessage({
			title: "Restoring version",
			description: `Restoring version ${version}…`,
			tone: "info",
		});
		try {
			const response = await fetch(`/api/tools/${activeTool.id}/rollback`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ version }),
			});
			const data = (await response.json()) as {
				status: string;
				tool?: GeneratedToolRecord;
				message?: string;
			};
			if (data.status === "success" && data.tool) {
				const summary = toSummary(data.tool);
				setActiveTool(summary);
				populateFormFrom(summary);
				appendConversation(buildRestoredConversationMessage(version));
				setStatusMessage({
					title: "Version restored",
					description: `Restored version ${version} of ${summary.projectName}.`,
					tone: "success",
				});
				void loadRecentTools();
				void loadToolDetail(summary.id);
				return true;
			} else {
				setStatusMessage({
					title: "Restore failed",
					description: data.message ?? "Could not restore that version.",
					tone: "destructive",
				});
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setStatusMessage({ title: "Restore failed", description: message, tone: "destructive" });
		} finally {
			setRequestState("idle");
		}
		return false;
	}

	async function handleCopyEmbed(target: "iframe" | "full" | "url", text: string) {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedTarget(target);
			window.setTimeout(() => setCopiedTarget(null), 2_000);
		} catch {
			// Snippet remains selectable even if clipboard access is blocked.
		}
	}

	const observedSteps = useMemo(() => {
		if (!activeRun || !telemetry) return activitySteps;
		return estimateActivitySteps(activeRun, Date.now(), telemetry);
	}, [activeRun, activitySteps, telemetry]);

	return (
		<div className="bg-white lg:flex lg:h-full lg:min-h-0 lg:flex-col">
			<div data-builder-topbar className="shrink-0">
				<BuilderTopbar
					activeView={activeView}
					activeTool={activeTool}
					projectName={projectName}
					toolHistory={toolHistory}
					recentTools={recentTools}
					recentLoading={recentLoading}
					requestState={requestState}
					recentOpen={recentOpen}
					onSetView={setActiveView}
					onToggleRecent={() => setRecentOpen((current) => !current)}
					onStartNew={handleStartNewTool}
					onFocusComposer={() => composerRef.current?.focus()}
					onRefreshRecent={() => void loadRecentTools()}
					onReopenRecent={handleReopenRecent}
					onOpenEmbed={handleOpenEmbed}
					onRollback={handleRollback}
				/>
			</div>
			<div className="grid lg:min-h-0 lg:flex-1 lg:grid-cols-[360px_minmax(0,1fr)]">
				<BuilderChatPanel
					projectName={projectName}
					siteUrl={siteUrl}
					prompt={prompt}
					messages={messages}
					requestState={requestState}
					statusMessage={statusMessage}
					activeBrandName={activeBrandName}
					brandSummary={brandSummary}
					suggestionBrandContext={suggestionBrandContext}
					suggestions={suggestions}
					suggestionsLoading={suggestionsLoading}
					suggestionsError={suggestionsError}
					activitySteps={observedSteps}
					activeRun={activeRun}
					telemetry={telemetry}
					onProjectNameChange={setProjectName}
					onSiteUrlChange={(value) => {
						setSiteUrl(value);
						setSuggestions([]);
						setSuggestionBrandContext(null);
						setSuggestionsError(null);
					}}
					onNormalizeSiteUrl={() => setSiteUrl((current) => normalizeSiteUrl(current))}
					onPromptChange={setPrompt}
					onSubmit={handleSubmit}
					onRequestSuggestions={() => void handleRequestSuggestions()}
					onSelectSuggestion={handleSelectSuggestion}
					composerRef={composerRef}
				/>
				<div className="border-t border-[#e4e4e7] bg-slate-50 p-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:border-t-0 lg:border-l lg:p-5">
					{activeView === "preview" ? (
						<BuilderPreviewCanvas
							activeTool={activeTool}
							previewUrl={previewUrl}
							requestState={requestState}
							activeRun={activeRun}
							telemetry={telemetry}
							progress={progress}
						/>
					) : (
						<BuilderDashboardPanel
							activeTool={activeTool}
							toolHistory={toolHistory}
							embedSnippet={embedSnippet}
							fullEmbedSnippet={fullEmbedSnippet}
							hostedUrl={hostedUrl}
							copiedTarget={copiedTarget}
							requestState={requestState}
							onCopy={(target, text) => void handleCopyEmbed(target, text)}
							onRollback={(version) => void handleRollback(version)}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

function toStatusMessage(
	result: ToolGenerationResult,
	isUpdate: boolean,
	diagnostics: GenerationTelemetry | null
): StatusMessage {
	if (result.status === "success") {
		const duration = formatDuration(diagnostics?.totalMs);
		return {
			title: isUpdate ? "Tool updated" : "Tool generated",
			description: `${result.tool.projectName} ${isUpdate ? `is now v${result.tool.version}` : "is ready to preview and embed"}.${duration ? ` Completed in ${duration}.` : ""}${
				result.tool.warnings.length ? " Review the dashboard tab for generation notes." : ""
			}`,
			tone: result.tool.warnings.length ? "warning" : "success",
		};
	}
	if (result.status === "not_configured") {
		return { title: "Generation not configured", description: result.message, tone: "warning" };
	}
	return {
		title: isUpdate ? "Update failed" : "Generation failed",
		description: result.message,
		tone: "destructive",
	};
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
