import { useEffect, useState } from "react";
import { ArrowUpRight, Monitor, Sparkles } from "lucide-react";
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
	const [frameHeight, setFrameHeight] = useState(720);
	const showGenerationTakeover = requestState === "generating" && !activeRun?.toolId;
	void telemetry;

	useEffect(() => {
		setFrameHeight(720);
	}, [activeTool?.id, activeTool?.version, previewUrl]);

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
			<div className="flex h-full min-h-[72vh] flex-col items-center justify-center rounded-[10px] border border-brand/10 bg-[linear-gradient(180deg,_white_0%,_color-mix(in_oklab,var(--brand-light)_18%,white)_100%)] px-6 text-center lg:min-h-[calc(100vh-16rem)]">
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
			<div className="flex h-full min-h-[72vh] flex-col items-center justify-center rounded-[32px] border border-dashed border-brand/15 bg-[linear-gradient(180deg,_white_0%,_color-mix(in_oklab,var(--brand-light)_24%,white)_100%)] px-6 text-center lg:min-h-[calc(100vh-16rem)]">
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

	return (
		<div className="rounded-[32px] border border-brand/10 bg-[linear-gradient(180deg,_white_0%,_color-mix(in_oklab,var(--brand-light)_28%,white)_100%)] p-4 shadow-inner shadow-white/60">
			<div className="mb-4 flex min-h-[52px] flex-wrap items-center justify-between gap-3 rounded-[10px] border border-brand/10 bg-[#fcfcfc] px-4 py-2.5 backdrop-blur">
				<div>
					<p className="text-sm font-semibold text-foreground">Live preview</p>
					<p className="text-xs text-muted-foreground">
						{requestState === "updating"
							? "Updating the current hosted iframe in place while you keep the existing preview visible."
							: "Rendering the hosted iframe exactly as customers will receive it."}
					</p>
				</div>
				<Button
					asChild
					variant="outline"
					size="sm"
					className="h-[30px] rounded-md border-brand/15 bg-white text-brand-text hover:bg-brand-light/20"
				>
					<a href={previewUrl} target="_blank" rel="noreferrer">
						<ArrowUpRight className="size-4" />
						Open full preview
					</a>
				</Button>
			</div>
			<div className="overflow-hidden rounded-[28px] border border-brand/10 bg-white shadow-sm">
				<iframe
					key={`${activeTool.id}-${activeTool.version}`}
					src={previewUrl}
					sandbox={IFRAME_SANDBOX}
					title={activeTool.projectName}
					className="w-full"
					style={{ height: `${frameHeight}px` }}
				/>
			</div>
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
