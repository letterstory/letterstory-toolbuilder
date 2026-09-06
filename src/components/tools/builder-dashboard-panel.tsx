import { AlertCircle, Check, Copy, History, Palette, RefreshCw, Type } from "lucide-react";
import { formatTimestamp } from "@/components/tools/builder-activity";
import type { RequestState, ToolHistoryEntry, ToolSummary } from "@/components/tools/builder-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface BuilderDashboardPanelProps {
	activeTool: ToolSummary | null;
	toolHistory: ToolHistoryEntry[];
	embedSnippet: string;
	fullEmbedSnippet: string;
	hostedUrl: string;
	copiedTarget: "iframe" | "full" | "url" | null;
	requestState: RequestState;
	onCopy: (target: "iframe" | "full" | "url", text: string) => void;
	onRollback: (version: number) => void;
}

export function BuilderDashboardPanel({
	activeTool,
	toolHistory,
	embedSnippet,
	fullEmbedSnippet,
	hostedUrl,
	copiedTarget,
	requestState,
	onCopy,
	onRollback,
}: BuilderDashboardPanelProps) {
	return (
		<div className="space-y-4 rounded-[32px] border border-brand/10 bg-[linear-gradient(180deg,_white_0%,_color-mix(in_oklab,var(--brand-light)_24%,white)_100%)] p-4">
			<div className="rounded-[28px] bg-white p-5 shadow-sm">
				<p className="text-sm font-semibold text-foreground">Dashboard</p>
				<p className="mt-1 text-sm text-muted-foreground">
					{activeTool
						? "Hosted delivery, embed code, brand details, version history, and warnings live here."
						: "Generate or reopen a tool to inspect hosted embed code, brand details, and version history."}
				</p>
			</div>

			{activeTool ? (
				<>
					<section id="builder-embed-section" className="rounded-[28px] bg-white p-5 shadow-sm">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="text-sm font-semibold text-foreground">Embed & hosted iframe</p>
								<p className="text-sm text-muted-foreground">
									Toolbuilder hosts the generated tool for you at a stable iframe URL. Copy the
									hosted link, the tool-only embed hook, or the full snippet with starter copy.
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => onCopy("url", hostedUrl)}
								>
									{copiedTarget === "url" ? (
										<Check className="size-4" />
									) : (
										<Copy className="size-4" />
									)}
									{copiedTarget === "url" ? "Copied" : "Copy hosted URL"}
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => onCopy("iframe", embedSnippet)}
								>
									{copiedTarget === "iframe" ? (
										<Check className="size-4" />
									) : (
										<Copy className="size-4" />
									)}
									{copiedTarget === "iframe" ? "Copied" : "Copy embed hook"}
								</Button>
								{fullEmbedSnippet ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => onCopy("full", fullEmbedSnippet)}
									>
										{copiedTarget === "full" ? (
											<Check className="size-4" />
										) : (
											<Copy className="size-4" />
										)}
										{copiedTarget === "full" ? "Copied" : "Copy full snippet"}
									</Button>
								) : null}
							</div>
						</div>
						<div className="mt-4 rounded-2xl border border-brand/10 bg-brand-light/12 p-4">
							<p className="text-xs font-medium uppercase tracking-[0.14em] text-brand-text/60">
								Hosted iframe URL
							</p>
							<p className="mt-2 break-all text-sm text-brand-text">{hostedUrl}</p>
						</div>
						<pre className="mt-4 min-w-0 overflow-x-auto rounded-[24px] border border-brand/10 bg-brand-light/12 p-4 text-xs [overflow-wrap:anywhere] whitespace-pre-wrap">
							{fullEmbedSnippet || embedSnippet}
						</pre>
					</section>

					<section className="rounded-[28px] bg-white p-5 shadow-sm">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="secondary">{activeTool.model}</Badge>
							<Badge variant="secondary">v{activeTool.version}</Badge>
							{activeTool.brandSnapshot?.brandName ? (
								<Badge variant="secondary">{activeTool.brandSnapshot.brandName}</Badge>
							) : null}
							{activeTool.brandFidelity ? (
								<Badge variant={brandFidelityBadgeVariant(activeTool.brandFidelity.verdict)}>
									Brand fidelity: {activeTool.brandFidelity.verdict}
								</Badge>
							) : null}
							{activeTool.visualCongruence ? (
								<Badge
									variant={visualCongruenceBadgeVariant(
										activeTool.visualCongruence.status,
										activeTool.visualCongruence.verdict
									)}
								>
									{visualCongruenceBadgeLabel(activeTool.visualCongruence)}
								</Badge>
							) : null}
						</div>
						{activeTool.copy ? (
							<div className="mt-4 rounded-3xl bg-brand-light/12 p-4">
								<p className="text-sm font-semibold text-foreground">{activeTool.copy.headline}</p>
								<p className="mt-2 text-sm leading-6 text-brand-text">
									{activeTool.copy.supportingCopy}
								</p>
							</div>
						) : null}
						{activeTool.brandFidelity?.notes ? (
							<p className="mt-3 text-xs text-muted-foreground">{activeTool.brandFidelity.notes}</p>
						) : null}
						{activeTool.visualCongruence ? (
							<div className="mt-3 space-y-2 text-xs text-muted-foreground">
								<p>{activeTool.visualCongruence.notes}</p>
								{activeTool.visualCongruence.risks.length ? (
									<ul className="list-disc space-y-1 pl-5">
										{activeTool.visualCongruence.risks.map((risk) => (
											<li key={risk}>{risk}</li>
										))}
									</ul>
								) : null}
							</div>
						) : null}
					</section>

					<section className="grid gap-4 xl:grid-cols-2">
						<div className="rounded-[28px] bg-white p-5 shadow-sm">
							<div className="flex items-center gap-2">
								<Palette className="size-4 text-brand-text/70" />
								<p className="text-sm font-semibold text-foreground">Brand snapshot</p>
							</div>
							<div className="mt-4 space-y-4">
								<div>
									<p className="text-xs uppercase tracking-[0.16em] text-brand-text/55">Colors</p>
									<div className="mt-2 flex flex-wrap gap-2">
										{Object.entries(activeTool.brandSnapshot?.colors ?? {}).length ? (
											Object.entries(activeTool.brandSnapshot?.colors ?? {}).map(
												([name, value]) => (
													<div
														key={name}
														className="rounded-2xl border border-brand/10 bg-brand-light/12 px-3 py-2 text-xs text-brand-text"
													>
														<div className="mb-2 flex items-center gap-2">
															<span
																className="size-4 rounded-full border border-black/10"
																style={{ backgroundColor: value }}
															/>
															<span className="font-medium text-foreground">{name}</span>
														</div>
														<span>{value}</span>
													</div>
												)
											)
										) : (
											<p className="text-sm text-muted-foreground">
												No brand colors captured for this run.
											</p>
										)}
									</div>
								</div>
								<div>
									<div className="flex items-center gap-2">
										<Type className="size-4 text-brand-text/70" />
										<p className="text-xs uppercase tracking-[0.16em] text-brand-text/55">Fonts</p>
									</div>
									<div className="mt-2 flex flex-wrap gap-2">
										{activeTool.brandSnapshot?.fonts.length ? (
											activeTool.brandSnapshot.fonts.map((font) => (
												<Badge
													key={font}
													variant="outline"
													className="rounded-full border-brand/10 bg-brand-light/12 text-brand-text"
												>
													{font}
												</Badge>
											))
										) : (
											<p className="text-sm text-muted-foreground">
												No brand fonts captured for this run.
											</p>
										)}
									</div>
								</div>
								{activeTool.brandSnapshot?.competitorContext ? (
									<div className="rounded-3xl border border-brand/10 bg-brand-light/12 p-4">
										<p className="text-xs uppercase tracking-[0.16em] text-brand-text/55">
											Competitor sanity check
										</p>
										<p className="mt-2 text-sm font-medium text-foreground">
											{activeTool.brandSnapshot.competitorContext.summary}
										</p>
										<div className="mt-3 flex flex-wrap gap-2">
											<Badge
												variant="outline"
												className="border-brand/10 bg-white/70 text-brand-text"
											>
												Signal:{" "}
												{activeTool.brandSnapshot.competitorContext.signal.replace(/_/g, " ")}
											</Badge>
											{activeTool.brandSnapshot.competitorContext.industry ? (
												<Badge
													variant="outline"
													className="border-brand/10 bg-white/70 text-brand-text"
												>
													{activeTool.brandSnapshot.competitorContext.industry}
												</Badge>
											) : null}
										</div>
										<div className="mt-3 space-y-2">
											{activeTool.brandSnapshot.competitorContext.competitors.map((competitor) => (
												<div
													key={competitor.domain}
													className="rounded-2xl border border-brand/10 bg-white/70 px-3 py-3 text-xs text-brand-text"
												>
													<div className="flex flex-wrap items-center gap-2">
														<span className="font-medium text-foreground">
															{competitor.companyName}
														</span>
														<span className="text-muted-foreground">{competitor.domain}</span>
														<Badge variant="secondary">{competitor.status}</Badge>
													</div>
													{competitor.status === "analyzed" ? (
														<p className="mt-2 text-muted-foreground">
															{[
																competitor.primaryColor
																	? `${competitor.primaryColor} ${competitor.primaryColorFamily}`
																	: null,
																competitor.fontFamily
																	? `${competitor.fontFamily} (${competitor.fontCategory})`
																	: competitor.fontCategory !== "unknown"
																		? competitor.fontCategory
																		: null,
																competitor.logoStyle !== "unknown"
																	? competitor.logoStyle
																	: null,
															]
																.filter(Boolean)
																.join(" · ") || "Limited extracted brand signal."}
														</p>
													) : competitor.notes.length ? (
														<p className="mt-2 text-muted-foreground">{competitor.notes[0]}</p>
													) : null}
												</div>
											))}
										</div>
										{activeTool.brandSnapshot.competitorContext.notes.length ? (
											<ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
												{activeTool.brandSnapshot.competitorContext.notes.map((note) => (
													<li key={note}>{note}</li>
												))}
											</ul>
										) : null}
									</div>
								) : null}
							</div>
						</div>

						<div className="rounded-[28px] bg-white p-5 shadow-sm">
							<div className="flex items-center gap-2">
								<History className="size-4 text-brand-text/70" />
								<p className="text-sm font-semibold text-foreground">Version history</p>
							</div>
							<div className="mt-4 space-y-3">
								{toolHistory.length ? (
									toolHistory.map((entry) => (
										<div
											key={entry.version}
											className="flex items-center justify-between gap-3 rounded-2xl bg-brand-light/12 px-4 py-3"
										>
											<div className="min-w-0">
												<p className="text-sm font-medium text-foreground">
													Version {entry.version}
												</p>
												<p className="truncate text-xs text-muted-foreground">
													{formatTimestamp(entry.createdAt)} · {entry.prompt.slice(0, 72)}
													{entry.prompt.length > 72 ? "…" : ""}
												</p>
											</div>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={requestState !== "idle"}
												onClick={() => onRollback(entry.version)}
											>
												<RefreshCw className="size-4" />
												Restore
											</Button>
										</div>
									))
								) : (
									<p className="rounded-2xl bg-brand-light/12 px-4 py-6 text-sm text-muted-foreground">
										No previous versions yet.
									</p>
								)}
							</div>
						</div>
					</section>

					{activeTool.warnings.length ? (
						<Alert className="rounded-[28px] border-amber-200 bg-amber-50 text-amber-900">
							<AlertCircle className="size-4" />
							<AlertTitle>Generation notes</AlertTitle>
							<AlertDescription>
								<ul className="list-disc space-y-1 pl-5">
									{activeTool.warnings.map((warning) => (
										<li key={warning}>{warning}</li>
									))}
								</ul>
							</AlertDescription>
						</Alert>
					) : null}
				</>
			) : null}
		</div>
	);
}

function brandFidelityBadgeVariant(
	verdict: "pass" | "warn" | "fail"
): "secondary" | "outline" | "destructive" {
	if (verdict === "fail") return "destructive";
	if (verdict === "warn") return "outline";
	return "secondary";
}

function visualCongruenceBadgeVariant(
	status: "pending" | "completed" | "failed",
	verdict: "pass" | "warn" | "fail" | null
): "secondary" | "outline" | "destructive" {
	if (status === "pending") return "secondary";
	if (status === "failed") return "outline";
	return brandFidelityBadgeVariant(verdict ?? "warn");
}

function visualCongruenceBadgeLabel(tool: NonNullable<BuilderDashboardPanelProps["activeTool"]>["visualCongruence"]) {
	if (!tool) return "Visual match";
	if (tool.status === "pending") return "Visual match: analyzing…";
	if (tool.status === "failed") return "Visual match: unavailable";
	const score = tool.congruenceScore ? ` (${tool.congruenceScore}/5)` : "";
	return `Visual match: ${tool.verdict ?? "review"}${score}`;
}
