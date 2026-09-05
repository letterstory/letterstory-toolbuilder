import Image from "next/image";
import { useMemo, type RefObject } from "react";
import {
	AlertCircle,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	LoaderCircle,
} from "lucide-react";
import { formatDuration } from "@/components/tools/builder-activity";
import type {
	BuilderActivityStep,
	BuilderBrandSummary,
	BuilderConversationMessage,
	BuilderGenerationRun,
	GenerationTelemetry,
	RequestState,
	StatusMessage,
} from "@/components/tools/builder-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface BuilderChatPanelProps {
	projectName: string;
	siteUrl: string;
	prompt: string;
	messages: BuilderConversationMessage[];
	requestState: RequestState;
	statusMessage: StatusMessage;
	activeBrandName: string | null;
	brandSummary: BuilderBrandSummary | null;
	activitySteps: BuilderActivityStep[];
	activeRun: BuilderGenerationRun | null;
	telemetry: GenerationTelemetry | null;
	onProjectNameChange: (value: string) => void;
	onSiteUrlChange: (value: string) => void;
	onNormalizeSiteUrl: () => void;
	onPromptChange: (value: string) => void;
	onSubmit: () => void;
	composerRef: RefObject<HTMLTextAreaElement | null>;
}

export function BuilderChatPanel({
	projectName,
	siteUrl,
	prompt,
	messages,
	requestState,
	statusMessage,
	activeBrandName,
	brandSummary,
	activitySteps,
	activeRun,
	telemetry,
	onProjectNameChange,
	onSiteUrlChange,
	onNormalizeSiteUrl,
	onPromptChange,
	onSubmit,
	composerRef,
}: BuilderChatPanelProps) {
	const isRunning = requestState !== "idle";
	const composerPlaceholder = useMemo(() => {
		if (isRunning) return "Generation in progress…";
		if (messages.length > 0) return "Describe the change you'd like to make to this tool…";
		return "What would you like to build?";
	}, [isRunning, messages.length]);
	const statusLine = isRunning
		? requestState === "updating"
			? "Thinking…"
			: activeBrandName || siteUrl
				? `Building with ${activeBrandName ?? siteUrl} brand context…`
				: "Building your tool…"
		: messages.length > 0
			? "Continue the conversation to refine this tool."
			: "Start with a name, optional brand site, and your build prompt.";

	return (
		<div className="flex min-h-[72vh] flex-col bg-[#f8f6f4] lg:min-h-[calc(100vh-16rem)]">
			<div className="border-b border-brand/10 bg-[#f8f6f4] px-4 py-4 shadow-[0_2px_4px_rgba(15,14,14,0.05)] sm:px-5">
				<div className="grid gap-3">
					<div className="grid gap-3 sm:grid-cols-2">
						<label className="space-y-2">
							<span className="text-xs font-medium uppercase tracking-[0.16em] text-brand-text/70">
								Tool name *
							</span>
							<Input
								value={projectName}
								onChange={(event) => onProjectNameChange(event.target.value)}
								placeholder="Stripe pricing estimator"
								required
								className="h-11 rounded-2xl border-brand/10 bg-brand-light/12 px-4 shadow-none focus-visible:border-brand/30 focus-visible:ring-brand/20"
							/>
						</label>
						<label className="space-y-2">
							<span className="text-xs font-medium uppercase tracking-[0.16em] text-brand-text/70">
								Brand site
							</span>
							<Input
								value={siteUrl}
								onChange={(event) => onSiteUrlChange(event.target.value)}
								onBlur={onNormalizeSiteUrl}
								placeholder="https://stripe.com"
								className="h-11 rounded-2xl border-brand/10 bg-brand-light/12 px-4 shadow-none focus-visible:border-brand/30 focus-visible:ring-brand/20"
							/>
						</label>
					</div>
					<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						<Badge
							variant="secondary"
							className="rounded-full border border-brand/10 bg-brand-light/35 text-brand-text"
						>
							Brand ingestion + hosted iframe
						</Badge>
						<span>
							{activeBrandName
								? `Current brand context: ${activeBrandName}`
								: "Optional brand site will drive logo, colors, fonts, and hosted embed output."}
						</span>
					</div>
				</div>
			</div>

			<div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-5">
				{brandSummary ? <BrandSummaryCard summary={brandSummary} /> : null}

				<section className="rounded-[28px] border border-brand/10 bg-white p-4 shadow-sm">
					<div className="flex items-start justify-between gap-3">
						<div>
							<p className="text-sm font-semibold text-foreground">
								{brandSummary ? "Brand ingestion & generation pipeline" : "Generation pipeline"}
							</p>
							<p className="text-xs text-muted-foreground">
								{telemetry?.totalMs
									? `Completed in ${formatDuration(telemetry.totalMs)}${telemetry.attemptsSummary ? ` · ${telemetry.attemptsSummary}` : ""}`
									: activeRun
										? "Estimated step timing while the backend request is in flight."
										: brandSummary
											? "This thread shows the real brand-ingestion path the tool used."
											: "Add a brand site to expose logo, color, and font extraction before generation."}
							</p>
						</div>
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							{telemetry ? (
								<Badge variant="outline" className="border-brand/15 text-brand-text">
									Observed
								</Badge>
							) : (
								<Badge
									variant="secondary"
									className="border border-brand/10 bg-brand-light/35 text-brand-text"
								>
									Estimated live
								</Badge>
							)}
							<ChevronDown className="size-4 text-brand-text/60" />
						</div>
					</div>
					<div className="mt-4 space-y-3">
						{activitySteps.length > 0 ? (
							activitySteps.map((step) => (
								<div key={step.key} className="rounded-xl border border-transparent p-1">
									<div className="flex min-h-[34px] items-center gap-2 rounded-md bg-transparent p-1 text-sm">
										<StepIcon status={step.status} />
										<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
											<StepLabel title={step.title} />
											<Badge
												variant="outline"
												className="h-5 rounded-md border-brand/10 bg-white px-2 text-[11px] text-muted-foreground"
											>
												{step.status === "complete"
													? "Done"
													: step.status === "active"
														? "In progress"
														: "Queued"}
											</Badge>
										</div>
									</div>
									<p className="ml-8 mt-1 text-xs leading-5 text-muted-foreground">
										{step.description}
									</p>
									{step.detail ? (
										<p className="ml-8 mt-2 text-xs font-medium text-brand-text/80">
											{step.detail}
										</p>
									) : null}
								</div>
							))
						) : (
							<div className="rounded-2xl bg-brand-light/12 px-4 py-4 text-sm text-muted-foreground">
								No run yet. Your first build will show the brand-ingestion and HTML generation
								stages here.
							</div>
						)}
					</div>
				</section>

				{messages.length === 0 ? (
					<div className="rounded-[28px] border border-dashed border-brand/15 bg-white/80 px-5 py-6 text-sm text-muted-foreground">
						Your first prompt becomes the opening chat message. After the first build, use this
						thread to request revisions and the existing tool will update in place.
					</div>
				) : null}

				{messages.map((message) => (
					<div
						key={message.id}
						className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
					>
						<div
							className={cn(
								"max-w-[92%]",
								message.role === "assistant" ? "space-y-2" : "space-y-1.5"
							)}
						>
							{message.role === "user" ? (
								<div className="rounded-[24px] rounded-br-md bg-brand-light/40 px-4 py-3 text-sm text-foreground shadow-sm">
									{message.content}
								</div>
							) : message.role === "assistant" ? (
								<p className="text-sm leading-6 text-brand-text">{message.content}</p>
							) : (
								<div className="rounded-2xl border border-brand/10 bg-white px-4 py-3 text-xs text-muted-foreground">
									{message.content}
								</div>
							)}
							{message.meta ? (
								<p className="px-1 text-[11px] text-brand-text/50">{message.meta}</p>
							) : null}
						</div>
					</div>
				))}
			</div>

			<div className="border-t border-brand/10 bg-[#f8f6f4] px-4 py-4 sm:px-5">
				<div className="mb-3 flex items-center justify-between gap-3">
					<p
						className={cn(
							"text-sm font-medium",
							isRunning ? "builder-phase-shimmer" : "text-brand-text"
						)}
					>
						{statusLine}
					</p>
					<StatusChip requestState={requestState} statusMessage={statusMessage} />
				</div>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						onSubmit();
					}}
					className="rounded-lg border border-brand/15 bg-[#fcfcfc] p-3 shadow-[0_10px_20px_0_rgba(15,14,14,0.05),0_0_4px_0_rgba(15,14,14,0.05)]"
				>
					<Textarea
						ref={composerRef}
						value={prompt}
						onChange={(event) => onPromptChange(event.target.value)}
						placeholder={composerPlaceholder}
						rows={4}
						disabled={isRunning}
						className="min-h-[120px] resize-none rounded-2xl border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
					/>
					<div className="mt-3 flex justify-end border-t border-brand/10 pt-3">
						<Button
							type="submit"
							disabled={isRunning}
							className="size-[30px] rounded-md bg-foreground p-0 text-background hover:bg-foreground/92 disabled:bg-[#ebebeb] disabled:text-[#929292]"
							aria-label={messages.length > 0 ? "Update tool" : "Build tool"}
						>
							{isRunning ? (
								<LoaderCircle className="size-4 animate-spin" />
							) : (
								<ChevronRight className="size-4" />
							)}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}

function StatusChip({
	requestState,
	statusMessage,
}: {
	requestState: RequestState;
	statusMessage: StatusMessage;
}) {
	if (requestState !== "idle") {
		return (
			<span className="inline-flex items-center gap-2 rounded-full bg-brand-light/45 px-3 py-1 text-xs font-medium text-brand-text">
				<LoaderCircle className="size-3.5 animate-spin" />
				Live
			</span>
		);
	}

	const icon = statusMessage.tone === "destructive" ? AlertCircle : CheckCircle2;
	const styles =
		statusMessage.tone === "destructive"
			? "bg-rose-50 text-rose-700"
			: statusMessage.tone === "warning"
				? "bg-amber-50 text-amber-700"
				: "bg-emerald-50 text-emerald-700";
	const Icon = icon;

	return (
		<span
			className={cn(
				"inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
				styles
			)}
		>
			<Icon className="size-3.5" />
			{statusMessage.title}
		</span>
	);
}

function StepIcon({ status }: { status: BuilderActivityStep["status"] }) {
	if (status === "complete") return <CheckCircle2 className="size-4 text-emerald-600" />;
	if (status === "active") return <LoaderCircle className="size-4 animate-spin text-brand" />;
	return <div className="size-3 rounded-full bg-brand/25" />;
}

function StepLabel({ title }: { title: string }) {
	const [verb, ...rest] = title.split(" ");
	const subject = rest.join(" ");

	return (
		<div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
			<span className="shrink-0">{verb}</span>
			{subject ? (
				<span className="inline-flex h-5 min-w-0 max-w-full items-center rounded-[4px] border border-brand/10 bg-brand-light/18 px-1.5 text-xs font-medium text-foreground">
					<span className="truncate">{subject}</span>
				</span>
			) : null}
		</div>
	);
}

function BrandSummaryCard({ summary }: { summary: BuilderBrandSummary }) {
	const colorEntries = Object.entries(summary.colors).slice(0, 4);
	const fonts = summary.fonts.slice(0, 2);

	return (
		<section className="rounded-[28px] border border-brand/15 bg-white p-4 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-sm font-semibold text-foreground">Detected brand context</p>
					<p className="text-xs text-muted-foreground">
						Brand ingestion is part of the build, not hidden AI filler.
					</p>
				</div>
				<Badge
					variant="secondary"
					className="rounded-full border border-brand/10 bg-brand-light/35 text-brand-text"
				>
					Brand applied
				</Badge>
			</div>
			<div className="mt-4 flex items-start gap-4">
				<div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-brand/10 bg-brand-light/10">
					{summary.logoDataUri ? (
						<Image
							src={summary.logoDataUri}
							alt={`${summary.brandName ?? "Brand"} logo`}
							width={40}
							height={40}
							unoptimized
							className="max-h-10 max-w-10 object-contain"
						/>
					) : (
						<span className="text-sm font-semibold text-brand-text">
							{summary.brandName?.slice(0, 2).toUpperCase() ?? "BR"}
						</span>
					)}
				</div>
				<div className="min-w-0 flex-1 space-y-3">
					<div>
						<p className="text-sm font-medium text-foreground">
							{summary.brandName ?? "Brand context loaded"}
						</p>
						<p className="truncate text-xs text-muted-foreground">
							{summary.siteUrl ?? "No source URL saved"}
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{colorEntries.length ? (
							colorEntries.map(([name, value]) => (
								<div
									key={name}
									className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand-light/12 px-2.5 py-1 text-xs text-brand-text"
								>
									<span
										className="size-3 rounded-full border border-black/10"
										style={{ backgroundColor: value }}
									/>
									<span>{name}</span>
								</div>
							))
						) : (
							<span className="text-xs text-muted-foreground">No color tokens captured.</span>
						)}
					</div>
					<div className="flex flex-wrap gap-2">
						{fonts.length ? (
							fonts.map((font) => (
								<Badge
									key={font}
									variant="outline"
									className="rounded-full border-brand/10 text-brand-text"
								>
									{font}
								</Badge>
							))
						) : (
							<span className="text-xs text-muted-foreground">No font families captured.</span>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}
