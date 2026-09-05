import { useEffect, useState } from "react";
import { ArrowUpRight, Monitor, Sparkles } from "lucide-react";
import { formatDuration } from "@/components/tools/builder-activity";
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
	const isRunning = requestState !== "idle";

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

	if (isRunning) {
		const label = activeRun?.brandName || activeRun?.projectName || "your";
		const duration = telemetry?.totalMs ? formatDuration(telemetry.totalMs) : null;
		return (
			<div className="flex h-full min-h-[72vh] flex-col items-center justify-center rounded-[32px] border border-brand/10 bg-[radial-gradient(circle_at_top,_color-mix(in_oklab,var(--brand)_18%,white),_transparent_38%),linear-gradient(180deg,_white_0%,_color-mix(in_oklab,var(--brand-light)_32%,white)_100%)] px-6 text-center shadow-inner shadow-white/50 lg:min-h-[calc(100vh-16rem)]">
				<LoadingMark />
				<h2 className="mt-10 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
					Building your {label} tool…
				</h2>
				<div className="mt-6 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-white/80 shadow-inner">
					<div
						className="h-full rounded-full bg-primary transition-[width] duration-700"
						style={{ width: `${progress}%` }}
					/>
				</div>
				<p className="mt-3 text-sm text-muted-foreground">
					{duration
						? `Completed in ${duration}. Review the preview, then keep refining via chat.`
						: "Keep refining the prompt in chat to steer layout, copy, and interactions on the next pass."}
				</p>
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
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white/85 px-4 py-3 backdrop-blur">
				<div>
					<p className="text-sm font-semibold text-foreground">Live preview</p>
					<p className="text-xs text-muted-foreground">
						Rendering the generated iframe content exactly as customers will receive it.
					</p>
				</div>
				<Button
					asChild
					variant="outline"
					size="sm"
					className="rounded-full border-brand/15 bg-white text-brand-text hover:bg-brand-light/20"
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
		<div className="relative flex size-24 items-center justify-center rounded-[28px] border border-brand/15 bg-white text-brand shadow-lg shadow-brand/10">
			<Sparkles className="size-10" />
			<span className="absolute -left-1 -top-1 size-3 rounded-full bg-brand shadow-sm" />
			<span className="absolute -right-1 -top-1 size-3 rounded-full bg-brand shadow-sm" />
			<span className="absolute -bottom-1 -left-1 size-3 rounded-full bg-brand shadow-sm" />
			<span className="absolute -bottom-1 -right-1 size-3 rounded-full bg-brand shadow-sm" />
		</div>
	);
}
