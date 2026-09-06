import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ChevronDown, History, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
	BuilderView,
	RequestState,
	ToolHistoryEntry,
	ToolSummary,
} from "@/components/tools/builder-types";
import { formatTimestamp } from "@/components/tools/builder-activity";

interface BuilderTopbarProps {
	activeView: BuilderView;
	activeTool: ToolSummary | null;
	projectName: string;
	toolHistory: ToolHistoryEntry[];
	recentTools: ToolSummary[];
	recentLoading: boolean;
	requestState: RequestState;
	recentOpen: boolean;
	onSetView: (view: BuilderView) => void;
	onOpenThemeEditor: () => void;
	onToggleRecent: () => void;
	onStartNew: () => void;
	onFocusComposer: () => void;
	onRefreshRecent: () => void;
	onReopenRecent: (tool: ToolSummary) => void;
	onDeleteRecent: (tool: ToolSummary) => Promise<void>;
	onOpenEmbed: () => void;
	onRollback: (version: number) => Promise<boolean>;
}

export function BuilderTopbar({
	activeView,
	activeTool,
	projectName,
	toolHistory,
	recentTools,
	recentLoading,
	requestState,
	recentOpen,
	onSetView,
	onOpenThemeEditor,
	onToggleRecent,
	onStartNew,
	onFocusComposer,
	onRefreshRecent,
	onReopenRecent,
	onDeleteRecent,
	onOpenEmbed,
	onRollback,
}: BuilderTopbarProps) {
	const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const versionMenuRef = useRef<HTMLDivElement>(null);
	const currentLabel = projectName.trim() || activeTool?.projectName || "New tool";
	const hasVersionHistory = Boolean(activeTool) && toolHistory.length > 0;
	const hasThemeShortcut = Boolean(
		activeTool?.brandSnapshot &&
			(Object.keys(activeTool.brandSnapshot.colors ?? {}).length > 0 ||
				activeTool.brandSnapshot.fonts.length > 0)
	);
	const versionEntries = useMemo(() => {
		if (!activeTool) return [];
		return [
			{
				version: activeTool.version,
				createdAt: activeTool.updatedAt,
				prompt: activeTool.prompt,
				isCurrent: true,
			},
			...toolHistory.map((entry) => ({ ...entry, isCurrent: entry.version === activeTool.version })),
		]
			.filter(
				(entry, index, entries) =>
					entries.findIndex((candidate) => candidate.version === entry.version) === index
			)
			.sort((left, right) => right.version - left.version);
	}, [activeTool, toolHistory]);

	useEffect(() => {
		if (!versionHistoryOpen) return;
		function handleClick(event: MouseEvent) {
			const target = event.target as HTMLElement | null;
			if (!target || versionMenuRef.current?.contains(target)) return;
			setVersionHistoryOpen(false);
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [versionHistoryOpen]);

	useEffect(() => {
		if (!hasVersionHistory) {
			setVersionHistoryOpen(false);
		}
	}, [hasVersionHistory]);

	useEffect(() => {
		if (recentOpen) return;
		setConfirmDeleteId(null);
	}, [recentOpen]);

	useEffect(() => {
		if (!confirmDeleteId) return;
		if (!recentTools.some((tool) => tool.id === confirmDeleteId)) {
			setConfirmDeleteId(null);
		}
	}, [confirmDeleteId, recentTools]);

	useEffect(() => {
		if (!recentOpen && !versionHistoryOpen) return;
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			if (versionHistoryOpen) setVersionHistoryOpen(false);
			if (recentOpen) onToggleRecent();
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onToggleRecent, recentOpen, versionHistoryOpen]);

	async function handleRollbackClick(version: number) {
		const didRollback = await onRollback(version);
		if (didRollback) {
			setVersionHistoryOpen(false);
		}
	}

	async function handleDeleteClick(event: ReactMouseEvent<HTMLButtonElement>, tool: ToolSummary) {
		event.stopPropagation();
		if (confirmDeleteId !== tool.id) {
			setConfirmDeleteId(tool.id);
			return;
		}
		await onDeleteRecent(tool);
		setConfirmDeleteId((current) => (current === tool.id ? null : current));
	}

	return (
		<div className="border-b border-brand/10 bg-[#f8f6f4] px-4 py-2.5 backdrop-blur sm:px-5">
			<div className="flex min-h-[52px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
				<div className="flex min-w-0 flex-wrap items-center gap-3">
					<div className="relative">
						<button
							type="button"
							onClick={() => {
								setVersionHistoryOpen(false);
								onToggleRecent();
							}}
							aria-expanded={recentOpen}
							className="flex h-[30px] items-center gap-2 rounded-md border border-brand/15 bg-white px-2.5 text-left shadow-sm transition hover:border-brand/25 hover:bg-brand-light/20"
						>
							<div className="flex size-6 items-center justify-center rounded-md bg-brand text-[11px] font-semibold text-brand-foreground">
								T
							</div>
							<div className="h-[18px] w-px bg-brand/15" />
							<div className="min-w-0">
								<p className="truncate text-xs font-medium text-foreground">{currentLabel}</p>
								<p className="truncate text-[11px] text-brand-text/70">
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
											<div
												key={tool.id}
												className={cn(
													"flex items-start gap-2 rounded-2xl border border-transparent bg-brand-light/15 p-2 transition hover:border-brand/15 hover:bg-white",
													confirmDeleteId === tool.id ? "border-destructive/20 bg-destructive/5" : null
												)}
											>
												<button
													type="button"
													onClick={() => onReopenRecent(tool)}
													className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-[1rem] px-1 py-1 text-left"
												>
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
												</button>
												<Button
													type="button"
													variant={confirmDeleteId === tool.id ? "destructive" : "ghost"}
													size="sm"
													onClick={(event) => void handleDeleteClick(event, tool)}
													disabled={requestState !== "idle"}
													aria-label={
														confirmDeleteId === tool.id
															? `Confirm delete ${tool.projectName}`
															: `Delete ${tool.projectName}`
													}
													className={cn(
														"mt-1 h-8 shrink-0 rounded-full px-2",
														confirmDeleteId === tool.id ? "text-white" : "text-muted-foreground"
													)}
												>
													<Trash2 className="size-4" />
													<span className="text-xs">
														{confirmDeleteId === tool.id ? "Confirm" : "Delete"}
													</span>
												</Button>
											</div>
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

					<div className="inline-flex h-[30px] items-center rounded-md bg-brand-light/28 p-1">
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
						className="h-[30px] rounded-md"
					>
						<Pencil className="size-4" />
						Edit
					</Button>

					<Button
						type="button"
						variant="secondary"
						size="sm"
						disabled={!hasThemeShortcut || requestState !== "idle"}
						onClick={onOpenThemeEditor}
						className="h-[30px] rounded-md"
					>
						<Palette className="size-4" />
						Theme
					</Button>

					<div className="relative" ref={versionMenuRef}>
						<Button
							type="button"
							variant="secondary"
							size="icon"
							disabled={!hasVersionHistory || requestState !== "idle"}
							onClick={() => {
								if (recentOpen) onToggleRecent();
								setVersionHistoryOpen((current) => !current);
							}}
							className="size-[30px] rounded-md"
							aria-label="Open version history"
							aria-expanded={versionHistoryOpen}
						>
							<History className="size-4" />
						</Button>
						{versionHistoryOpen ? (
							<div className="absolute left-0 top-[calc(100%+0.75rem)] z-30 w-[340px] rounded-3xl border border-brand/15 bg-white p-3 shadow-2xl shadow-brand/10">
								<div className="mb-2 px-2 py-1">
									<p className="text-sm font-semibold text-foreground">Version history</p>
									<p className="text-xs text-muted-foreground">
										Restore a prior version without leaving the preview workspace.
									</p>
								</div>
								<div className="max-h-80 space-y-2 overflow-y-auto">
									{versionEntries.map((entry) => (
										<div
											key={entry.version}
											className="rounded-2xl border border-transparent bg-brand-light/15 px-3 py-3"
										>
											<div className="flex items-start justify-between gap-3">
												<div className="min-w-0">
													<div className="flex flex-wrap items-center gap-2">
														<p className="text-sm font-medium text-foreground">
															Version {entry.version}
														</p>
														{entry.isCurrent ? (
															<span className="rounded-full border border-brand/10 bg-white px-2 py-0.5 text-[11px] font-medium text-brand-text">
																Current
															</span>
														) : null}
													</div>
													<p className="truncate text-xs text-muted-foreground">
														{formatTimestamp(entry.createdAt)}
													</p>
												</div>
												<Button
													type="button"
													variant="outline"
													size="sm"
													disabled={entry.isCurrent || requestState !== "idle"}
													onClick={() => void handleRollbackClick(entry.version)}
												>
													Restore
												</Button>
											</div>
										</div>
									))}
								</div>
							</div>
						) : null}
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2 xl:justify-end">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						disabled={requestState !== "idle"}
						onClick={onStartNew}
						className="size-[30px] rounded-md text-brand-text hover:bg-brand-light/35 hover:text-brand-text"
						aria-label="Start new tool"
					>
						<Plus className="size-4" />
					</Button>
					<Button
						type="button"
						className="h-[30px] rounded-md bg-foreground px-4 text-background hover:bg-foreground/92"
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
				"h-[22px] rounded-[4px] px-3 text-sm font-medium transition",
				active
					? "bg-primary text-primary-foreground shadow-sm"
					: "text-brand-text/70 hover:text-brand-text"
			)}
		>
			{children}
		</button>
	);
}
