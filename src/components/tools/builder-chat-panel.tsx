import { useMemo, type RefObject } from "react";
import {
	AlertCircle,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	LoaderCircle,
	Mic,
	Paperclip,
	Target,
} from "lucide-react";
import { formatDuration } from "@/components/tools/builder-activity";
import type {
	BuilderActivityStep,
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
			? "Editing your code…"
			: activeBrandName || siteUrl
				? `Building with ${activeBrandName ?? siteUrl} brand context…`
				: "Building your tool…"
		: messages.length > 0
			? "Continue the conversation to refine this tool."
			: "Start with a name, optional brand site, and your build prompt.";

	return (
		<div className="flex min-h-[72vh] flex-col bg-[#fbfbfe] lg:min-h-[calc(100vh-16rem)]">
			<div className="border-b border-black/5 bg-white px-4 py-4 sm:px-5">
				<div className="grid gap-3">
					<div className="grid gap-3 sm:grid-cols-2">
						<label className="space-y-2">
							<span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
								Tool name *
							</span>
							<Input
								value={projectName}
								onChange={(event) => onProjectNameChange(event.target.value)}
								placeholder="Stripe pricing estimator"
								required
								className="h-11 rounded-2xl border-black/10 bg-slate-50 px-4 shadow-none"
							/>
						</label>
						<label className="space-y-2">
							<span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
								Brand site
							</span>
							<Input
								value={siteUrl}
								onChange={(event) => onSiteUrlChange(event.target.value)}
								onBlur={onNormalizeSiteUrl}
								placeholder="https://stripe.com"
								className="h-11 rounded-2xl border-black/10 bg-slate-50 px-4 shadow-none"
							/>
						</label>
					</div>
					<div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
						<Badge variant="secondary" className="rounded-full bg-[#f1efff] text-[#4839b3]">
							Live orchestration UI
						</Badge>
						<span>
							{activeBrandName
								? `Current brand context: ${activeBrandName}`
								: "Optional brand site will drive logo, colors, and font extraction."}
						</span>
					</div>
				</div>
			</div>

			<div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-5">
				{messages.length === 0 ? (
					<div className="rounded-[28px] border border-dashed border-black/10 bg-white/70 px-5 py-6 text-sm text-slate-500">
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
								<div className="rounded-[24px] rounded-br-md bg-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm">
									{message.content}
								</div>
							) : message.role === "assistant" ? (
								<p className="text-sm leading-6 text-slate-700">{message.content}</p>
							) : (
								<div className="rounded-2xl border border-black/5 bg-white px-4 py-3 text-xs text-slate-500">
									{message.content}
								</div>
							)}
							{message.meta ? (
								<p className="px-1 text-[11px] text-slate-400">{message.meta}</p>
							) : null}
						</div>
					</div>
				))}

				{activitySteps.length > 0 ? (
					<details open className="rounded-[28px] border border-black/5 bg-white p-4 shadow-sm">
						<summary className="flex cursor-pointer list-none items-center justify-between gap-3">
							<div>
								<p className="text-sm font-semibold text-slate-950">
									{isRunning
										? requestState === "updating"
											? "Updating tool…"
											: "Building tool…"
										: "Latest pipeline activity"}
								</p>
								<p className="text-xs text-slate-500">
									{telemetry?.totalMs
										? `Completed in ${formatDuration(telemetry.totalMs)}${telemetry.attemptsSummary ? ` · ${telemetry.attemptsSummary}` : ""}`
										: activeRun
											? "Estimated step timing while the backend request is in flight."
											: statusMessage.description}
								</p>
							</div>
							<div className="flex items-center gap-2 text-xs text-slate-500">
								{telemetry ? (
									<Badge variant="outline">Observed</Badge>
								) : (
									<Badge variant="secondary">Estimated live</Badge>
								)}
								<ChevronDown className="size-4" />
							</div>
						</summary>
						<div className="mt-4 space-y-3">
							{activitySteps.map((step) => (
								<div
									key={step.key}
									className="flex items-start gap-3 rounded-2xl bg-slate-50 px-3 py-3"
								>
									<StepIcon status={step.status} />
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<p className="text-sm font-medium text-slate-950">{step.title}</p>
											<Badge
												variant="outline"
												className="rounded-full border-black/10 bg-white text-slate-500"
											>
												{step.status === "complete"
													? "Done"
													: step.status === "active"
														? "In progress"
														: "Queued"}
											</Badge>
										</div>
										<p className="mt-1 text-xs leading-5 text-slate-500">{step.description}</p>
										{step.detail ? (
											<p className="mt-2 text-xs font-medium text-slate-600">{step.detail}</p>
										) : null}
									</div>
								</div>
							))}
						</div>
					</details>
				) : null}
			</div>

			<div className="border-t border-black/5 bg-white px-4 py-4 sm:px-5">
				<div className="mb-3 flex items-center justify-between gap-3">
					<p className="text-sm font-medium text-slate-700">{statusLine}</p>
					<StatusChip requestState={requestState} statusMessage={statusMessage} />
				</div>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						onSubmit();
					}}
					className="rounded-[28px] border border-black/10 bg-[#f8f8fc] p-3 shadow-sm"
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
					<div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-3">
						<div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="rounded-full"
								onClick={onNormalizeSiteUrl}
							>
								<Paperclip className="size-4" />
							</Button>
							<span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
								<Target className="size-3.5" />
								Auto
							</span>
							<span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
								Build
							</span>
							<Button type="button" variant="ghost" size="icon" className="rounded-full" disabled>
								<Mic className="size-4" />
							</Button>
						</div>
						<Button
							type="submit"
							disabled={isRunning}
							className="size-11 rounded-2xl bg-slate-950 text-white hover:bg-slate-800"
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
			<span className="inline-flex items-center gap-2 rounded-full bg-[#f4f0ff] px-3 py-1 text-xs font-medium text-[#4c35bb]">
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
	if (status === "complete") return <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />;
	if (status === "active")
		return <LoaderCircle className="mt-0.5 size-4 animate-spin text-[#4c35bb]" />;
	return <div className="mt-1 size-3 rounded-full bg-slate-300" />;
}
