import {
	ChevronDown,
	LayoutGrid,
	MessageSquareText,
	Monitor,
	MoreHorizontal,
	Pencil,
	Plus,
	Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BuilderView, RequestState, ToolSummary } from "@/components/tools/builder-types";
import { formatTimestamp } from "@/components/tools/builder-activity";

interface BuilderTopbarProps {
	activeView: BuilderView;
	activeTool: ToolSummary | null;
	projectName: string;
	recentTools: ToolSummary[];
	recentLoading: boolean;
	requestState: RequestState;
	recentOpen: boolean;
	onSetView: (view: BuilderView) => void;
	onToggleRecent: () => void;
	onStartNew: () => void;
	onFocusComposer: () => void;
	onRefreshRecent: () => void;
	onReopenRecent: (tool: ToolSummary) => void;
	onOpenEmbed: () => void;
}

export function BuilderTopbar({
	activeView,
	activeTool,
	projectName,
	recentTools,
	recentLoading,
	requestState,
	recentOpen,
	onSetView,
	onToggleRecent,
	onStartNew,
	onFocusComposer,
	onRefreshRecent,
	onReopenRecent,
	onOpenEmbed,
}: BuilderTopbarProps) {
	const currentLabel = projectName.trim() || activeTool?.projectName || "New tool";

	return (
		<div className="border-b border-brand/10 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
			<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
				<div className="flex min-w-0 flex-wrap items-center gap-3">
					<div className="relative">
						<button
							type="button"
							onClick={onToggleRecent}
							className="flex items-center gap-3 rounded-full border border-brand/15 bg-white px-3 py-2 text-left shadow-sm transition hover:border-brand/25 hover:bg-brand-light/20"
						>
							<div className="flex size-9 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
								T
							</div>
							<div className="min-w-0">
								<p className="truncate text-sm font-semibold text-foreground">{currentLabel}</p>
								<p className="truncate text-xs text-brand-text/70">
									{activeTool
										? `v${activeTool.version} · ${formatTimestamp(activeTool.updatedAt)}`
										: "LetterStory Toolbuilder"}
								</p>
							</div>
							<ChevronDown className="size-4 text-brand-text/60" />
						</button>
						{recentOpen ? (
							<div className="absolute left-0 top-[calc(100%+0.75rem)] z-30 w-[320px] rounded-3xl border border-brand/15 bg-white p-3 shadow-2xl shadow-brand/10">
								<div className="mb-2 flex items-center justify-between px-2 py-1">
									<div>
										<p className="text-sm font-semibold text-foreground">Recent tools</p>
										<p className="text-xs text-muted-foreground">
											Jump between saved tool previews.
										</p>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={onRefreshRecent}
										disabled={recentLoading}
									>
										Refresh
									</Button>
								</div>
								<div className="max-h-80 space-y-2 overflow-y-auto">
									{recentTools.length ? (
										recentTools.map((tool) => (
											<button
												key={tool.id}
												type="button"
												onClick={() => onReopenRecent(tool)}
												className="w-full rounded-2xl border border-transparent bg-brand-light/15 px-3 py-3 text-left transition hover:border-brand/15 hover:bg-white"
											>
												<div className="flex items-start justify-between gap-3">
													<div className="min-w-0">
														<p className="truncate text-sm font-medium text-foreground">
															{tool.projectName}
														</p>
														<p className="truncate text-xs text-muted-foreground">
															{tool.siteUrl ?? "No brand site"} · v{tool.version}
														</p>
													</div>
													<span className="text-xs text-muted-foreground">
														{formatTimestamp(tool.updatedAt)}
													</span>
												</div>
											</button>
										))
									) : (
										<p className="rounded-2xl bg-brand-light/15 px-3 py-5 text-sm text-muted-foreground">
											No saved tools yet.
										</p>
									)}
								</div>
							</div>
						) : null}
					</div>

					<div className="inline-flex items-center rounded-full bg-brand-light/35 p-1">
						<TabButton active={activeView === "preview"} onClick={() => onSetView("preview")}>
							Preview
						</TabButton>
						<TabButton active={activeView === "dashboard"} onClick={() => onSetView("dashboard")}>
							Dashboard
						</TabButton>
					</div>

					<Button
						type="button"
						variant="secondary"
						size="sm"
						disabled={!activeTool}
						onClick={onFocusComposer}
					>
						<Pencil className="size-4" />
						Edit
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={onToggleRecent}
						className="text-brand-text hover:bg-brand-light/35 hover:text-brand-text"
						aria-label="Open recent tools"
					>
						<LayoutGrid className="size-4" />
					</Button>
					<div className="inline-flex items-center gap-2 rounded-full border border-brand/15 bg-brand-light/12 px-3 py-2 text-sm text-brand-text/80">
						<Monitor className="size-4" />
						<span className="font-medium text-foreground">Home</span>
						<Send className="size-4 text-brand-text/50" />
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2 xl:justify-end">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={onFocusComposer}
						className="text-brand-text hover:bg-brand-light/35 hover:text-brand-text"
						aria-label="Focus chat composer"
					>
						<MessageSquareText className="size-4" />
					</Button>
					<div className="flex size-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">
						M
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						disabled={requestState !== "idle"}
						onClick={onStartNew}
						className="text-brand-text hover:bg-brand-light/35 hover:text-brand-text"
						aria-label="Start new tool"
					>
						<Plus className="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={onRefreshRecent}
						disabled={recentLoading}
						className="text-brand-text hover:bg-brand-light/35 hover:text-brand-text"
						aria-label="Refresh recent tools"
					>
						<MoreHorizontal className="size-4" />
					</Button>
					<Button
						type="button"
						className="rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90"
						disabled={!activeTool}
						onClick={onOpenEmbed}
					>
						Publish
					</Button>
				</div>
			</div>
		</div>
	);
}

function TabButton({
	active,
	children,
	onClick,
}: {
	active: boolean;
	children: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"rounded-full px-4 py-2 text-sm font-medium transition",
				active
					? "bg-primary text-primary-foreground shadow-sm"
					: "text-brand-text/70 hover:text-brand-text"
			)}
		>
			{children}
		</button>
	);
}
