import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, Copy, Monitor, Sparkles, X } from "lucide-react";
import type {
	BuilderGenerationRun,
	GenerationTelemetry,
	RequestState,
	ToolSummary,
} from "@/components/tools/builder-types";
import { Button } from "@/components/ui/button";
import {
	IFRAME_SANDBOX,
	TOOL_RESIZE_CONTRACT_VERSION,
	TOOL_RESIZE_MESSAGE_SOURCE,
} from "@/lib/embed/contract";

interface BuilderPreviewCanvasProps {
	activeTool: ToolSummary | null;
	previewUrl: string | null;
	requestState: RequestState;
	activeRun: BuilderGenerationRun | null;
	telemetry: GenerationTelemetry | null;
	progress: number;
}

export function BuilderPreviewCanvas({
	activeTool,
	previewUrl,
	requestState,
	activeRun,
	telemetry,
	progress,
}: BuilderPreviewCanvasProps) {
	const [origin, setOrigin] = useState("");
	const [frameHeight, setFrameHeight] = useState(720);
	const [showPreviewBar, setShowPreviewBar] = useState(true);
	const [copiedPreviewUrl, setCopiedPreviewUrl] = useState(false);
	const showGenerationTakeover = requestState === "generating" && !activeRun?.toolId;
	void telemetry;
	const publicPreviewUrl = useMemo(
		() => (activeTool ? `${origin || ""}/t/${activeTool.id}` : ""),
		[activeTool, origin]
	);
	const absolutePreviewUrl = useMemo(
		() => (previewUrl ? `${origin || ""}${previewUrl}` : ""),
		[origin, previewUrl]
	);

	useEffect(() => {
		setOrigin(window.location.origin);
	}, []);

	useEffect(() => {
		setFrameHeight(720);
	}, [activeTool?.id, activeTool?.version, previewUrl]);

	useEffect(() => {
		setShowPreviewBar(true);
		setCopiedPreviewUrl(false);
	}, [activeTool?.id, activeTool?.version, previewUrl]);

	useEffect(() => {
		if (!copiedPreviewUrl) return;
		const timeout = window.setTimeout(() => setCopiedPreviewUrl(false), 2_000);
		return () => window.clearTimeout(timeout);
	}, [copiedPreviewUrl]);

	useEffect(() => {
		function handleMessage(event: MessageEvent) {
			const data = event.data as {
				source?: string;
				version?: number;
				toolId?: string;
				height?: number;
			};
			if (!activeTool) return;
			if (
				data?.source !== TOOL_RESIZE_MESSAGE_SOURCE ||
				data.version !== TOOL_RESIZE_CONTRACT_VERSION
			)
				return;
			if (data.toolId !== activeTool.id || typeof data.height !== "number" || data.height <= 0)
				return;
			setFrameHeight(Math.max(420, Math.min(1_800, Math.ceil(data.height))));
		}

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [activeTool]);

	if (showGenerationTakeover) {
		const label = activeRun?.brandName || activeRun?.projectName || "your";
		const tip = activeRun?.siteUrl
			? "Refine the prompt in chat to steer layout, copy, and interactions while brand ingestion runs."
			: "Add a brand site on the left if you want Toolbuilder to ingest logo, colors, fonts, and host the final iframe.";
		return (
			<div className="flex h-full min-h-[72vh] flex-col items-center justify-center border border-brand/10 bg-[linear-gradient(180deg,_white_0%,_color-mix(in_oklab,var(--brand-light)_18%,white)_100%)] px-6 text-center lg:min-h-[calc(100vh-16rem)]">
				<LoadingMark />
				<h2 className="mt-10 text-balance font-serif text-3xl font-medium leading-[1.2] tracking-tight text-slate-800 sm:text-[2rem]">
					Building your {label} tool
					<span
						className="builder-loading-dots ml-1 inline-block w-6 text-left text-brand"
						aria-hidden
					>
						...
					</span>
				</h2>
				<div
					className="builder-progress-line my-10 h-[2px] w-[220px]"
					style={{ ["--builder-progress" as string]: `${progress}%` }}
				/>
				<p className="max-w-sm text-sm font-light leading-5 text-slate-700">{tip}</p>
			</div>
		);
	}

	if (!activeTool || !previewUrl) {
		return (
			<div className="flex h-full min-h-[72vh] flex-col items-center justify-center border border-dashed border-brand/15 bg-[linear-gradient(180deg,_white_0%,_color-mix(in_oklab,var(--brand-light)_24%,white)_100%)] px-6 text-center lg:min-h-[calc(100vh-16rem)]">
				<div className="flex size-16 items-center justify-center rounded-3xl bg-white text-brand shadow-sm">
					<Monitor className="size-8" />
				</div>
				<h2 className="mt-6 text-2xl font-semibold text-foreground">
					Your live preview will appear here
				</h2>
				<p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
					Start a build on the left. Once generation finishes, this canvas will render the same
					embeddable HTML served from{" "}
					<code className="rounded bg-white px-1.5 py-0.5 text-xs">/t/[id]</code>.
				</p>
			</div>
		);
	}

	async function handleCopyPreviewUrl() {
		if (!publicPreviewUrl) return;
		try {
			await navigator.clipboard.writeText(publicPreviewUrl);
			setCopiedPreviewUrl(true);
		} catch {
			// The URL remains visible even if clipboard access is blocked.
		}
	}

	return (
		<div className="flex h-full min-h-[72vh] flex-col bg-transparent lg:min-h-0">
			{showPreviewBar ? (
				<div className="mb-3 flex min-h-10 items-center gap-2 border border-brand/10 bg-white/90 px-3 py-2 text-xs text-brand-text backdrop-blur">
					<span className="shrink-0 font-medium text-foreground">
						{requestState === "updating" ? "Updating live preview" : "Live preview"}
					</span>
					<span className="min-w-0 flex-1 truncate text-brand-text/75">{publicPreviewUrl}</span>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={() => void handleCopyPreviewUrl()}
						className="size-7 rounded-full text-brand-text hover:bg-brand-light/20"
						aria-label="Copy preview URL"
					>
						{copiedPreviewUrl ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
					</Button>
					<Button
						asChild
						variant="ghost"
						size="sm"
						className="h-7 rounded-full px-2 text-brand-text hover:bg-brand-light/20"
					>
						<a href={absolutePreviewUrl || publicPreviewUrl} target="_blank" rel="noreferrer">
							<ArrowUpRight className="size-3.5" />
							Open full preview
						</a>
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={() => setShowPreviewBar(false)}
						className="size-7 rounded-full text-brand-text hover:bg-brand-light/20"
						aria-label="Dismiss preview URL bar"
					>
						<X className="size-3.5" />
					</Button>
				</div>
			) : null}
			<iframe
				key={`${activeTool.id}-${activeTool.version}`}
				src={previewUrl}
				sandbox={IFRAME_SANDBOX}
				title={activeTool.projectName}
				className="w-full flex-1 border-0 bg-white"
				style={{ height: `${frameHeight}px` }}
			/>
		</div>
	);
}

function LoadingMark() {
	return (
		<div className="relative flex size-40 items-center justify-center">
			<div className="builder-loading-mark flex size-[112px] items-center justify-center rounded-[28px] border border-brand/15 bg-white text-brand shadow-lg shadow-brand/10">
				<Sparkles className="size-12" />
			</div>
			<span className="builder-loading-dot absolute left-[20px] top-[20px] size-3 rounded-full bg-brand shadow-sm" />
			<span
				className="builder-loading-dot absolute right-[20px] top-[20px] size-3 rounded-full bg-brand shadow-sm"
				style={{ animationDelay: "120ms" }}
			/>
			<span
				className="builder-loading-dot absolute bottom-[20px] left-[20px] size-3 rounded-full bg-brand shadow-sm"
				style={{ animationDelay: "240ms" }}
			/>
			<span
				className="builder-loading-dot absolute bottom-[20px] right-[20px] size-3 rounded-full bg-brand shadow-sm"
				style={{ animationDelay: "360ms" }}
			/>
		</div>
	);
}
