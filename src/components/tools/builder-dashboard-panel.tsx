import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
	AlertCircle,
	Check,
	ChevronDown,
	Copy,
	History,
	Palette,
	Pencil,
	RefreshCw,
	Type,
	X,
} from "lucide-react";
import { formatTimestamp } from "@/components/tools/builder-activity";
import {
	BRAND_FONT_OPTIONS,
	BRAND_FONT_CATEGORY_LABELS,
	buildBrandFontsStylesheetHref,
	filterBrandFontOptions,
	type BrandFontCategory,
	isValidHexColor,
	isKnownBrandFont,
	normalizeHexColor,
} from "@/components/tools/builder-brand-update";
import type {
	BuilderBrandUpdateInput,
	RequestState,
	ToolHistoryEntry,
	ToolSummary,
} from "@/components/tools/builder-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const BRAND_FONT_PICKER_LINK_ID = "builder-brand-font-picker-stylesheet";

interface BuilderDashboardPanelProps {
	activeTool: ToolSummary | null;
	toolHistory: ToolHistoryEntry[];
	embedSnippet: string;
	fullEmbedSnippet: string;
	hostedUrl: string;
	copiedTarget: "iframe" | "full" | "url" | null;
	brandEditOpen: boolean;
	requestState: RequestState;
	onBrandEditOpenChange: (open: boolean) => void;
	onCopy: (target: "iframe" | "full" | "url", text: string) => void;
	onApplyBrandUpdate: (input: BuilderBrandUpdateInput) => void;
	onRollback: (version: number) => void;
}

export function BuilderDashboardPanel({
	activeTool,
	toolHistory,
	embedSnippet,
	fullEmbedSnippet,
	hostedUrl,
	copiedTarget,
	brandEditOpen,
	requestState,
	onBrandEditOpenChange,
	onCopy,
	onApplyBrandUpdate,
	onRollback,
}: BuilderDashboardPanelProps) {
	const [editedColors, setEditedColors] = useState<Record<string, string>>({});
	const [fontChoice, setFontChoice] = useState<string>("");
	const [customFontValue, setCustomFontValue] = useState("");
	const [fontPickerOpen, setFontPickerOpen] = useState(false);
	const [fontSearch, setFontSearch] = useState("");
	const [fontCategoryFilter, setFontCategoryFilter] = useState<BrandFontCategory | "all">("all");
	const fontPickerRef = useRef<HTMLDivElement>(null);
	const brandColors = activeTool?.brandSnapshot?.colors ?? {};
	const brandFonts = activeTool?.brandSnapshot?.fonts ?? [];
	const currentFont = brandFonts[0] ?? "";
	const currentFontIsKnown = isKnownBrandFont(currentFont);
	const hasEditableBrandValues = Object.keys(brandColors).length > 0 || brandFonts.length > 0;

	useEffect(() => {
		setEditedColors(
			Object.fromEntries(
				Object.entries(brandColors).map(([name, value]) => [name, normalizeHexColor(value)])
			)
		);
		if (currentFont && currentFontIsKnown) {
			setFontChoice(currentFont);
			setCustomFontValue("");
		} else {
			setFontChoice(currentFont ? "__custom__" : (BRAND_FONT_OPTIONS[0]?.name ?? ""));
			setCustomFontValue(currentFont);
		}
		setFontPickerOpen(false);
		setFontSearch("");
		setFontCategoryFilter("all");
	}, [activeTool?.id, activeTool?.version]);

	const changedColors = useMemo(
		() =>
			Object.fromEntries(
				Object.entries(editedColors).filter(([name, value]) => {
					const normalizedValue = normalizeHexColor(value);
					return normalizedValue !== normalizeHexColor(brandColors[name] ?? "");
				})
			),
		[brandColors, editedColors]
	);
	const filteredFontOptions = useMemo(
		() =>
			filterBrandFontOptions({
				search: fontSearch,
				category: fontCategoryFilter,
			}),
		[fontCategoryFilter, fontSearch]
	);
	const selectedFont = fontChoice === "__custom__" ? customFontValue.trim() : fontChoice;
	const selectedFontPreviewStyle = getFontPreviewStyle(
		selectedFont,
		fontChoice === "__custom__"
			? undefined
			: BRAND_FONT_OPTIONS.find((font) => font.name === fontChoice)?.category
	);
	const fontChanged = brandFonts.length > 0 && Boolean(selectedFont) && selectedFont !== currentFont;
	const hasInvalidColor = Object.values(editedColors).some((value) => !isValidHexColor(value));
	const canApplyBrandUpdate =
		requestState === "idle" &&
		(Object.keys(changedColors).length > 0 || fontChanged) &&
		!hasInvalidColor &&
		(fontChoice !== "__custom__" || Boolean(selectedFont));

	useEffect(() => {
		if (!fontPickerOpen) return;
		function handlePointerDown(event: MouseEvent) {
			const target = event.target as HTMLElement | null;
			if (!target || fontPickerRef.current?.contains(target)) return;
			setFontPickerOpen(false);
		}
		document.addEventListener("mousedown", handlePointerDown);
		return () => document.removeEventListener("mousedown", handlePointerDown);
	}, [fontPickerOpen]);

	useEffect(() => {
		if (!fontPickerOpen) return;
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			setFontPickerOpen(false);
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [fontPickerOpen]);

	useEffect(() => {
		if (!fontPickerOpen) return;
		if (document.getElementById(BRAND_FONT_PICKER_LINK_ID)) return;
		const stylesheet = document.createElement("link");
		stylesheet.id = BRAND_FONT_PICKER_LINK_ID;
		stylesheet.rel = "stylesheet";
		stylesheet.href = buildBrandFontsStylesheetHref();
		document.head.appendChild(stylesheet);
	}, [fontPickerOpen]);

	function handleCancelBrandEdit() {
		setEditedColors(
			Object.fromEntries(
				Object.entries(brandColors).map(([name, value]) => [name, normalizeHexColor(value)])
			)
		);
		if (currentFont && currentFontIsKnown) {
			setFontChoice(currentFont);
			setCustomFontValue("");
		} else {
			setFontChoice(currentFont ? "__custom__" : (BRAND_FONT_OPTIONS[0]?.name ?? ""));
			setCustomFontValue(currentFont);
		}
		setFontPickerOpen(false);
		setFontSearch("");
		setFontCategoryFilter("all");
		onBrandEditOpenChange(false);
	}

	function handleApply() {
		if (!canApplyBrandUpdate) return;
		const nextInput: BuilderBrandUpdateInput = {
			colors: Object.fromEntries(
				Object.entries(changedColors).map(([name, value]) => [name, normalizeHexColor(value)])
			),
		};
		if (fontChanged) {
			nextInput.fontFamily = selectedFont;
		}
		onApplyBrandUpdate(nextInput);
	}

	function handleToggleFontPicker() {
		setFontPickerOpen((current) => {
			const nextOpen = !current;
			if (nextOpen) {
				setFontSearch("");
				setFontCategoryFilter("all");
			}
			return nextOpen;
		});
	}

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
							{activeTool.brandSnapshot?.competitorContext ? (
								<Badge
									variant={competitorContextBadgeVariant(
										activeTool.brandSnapshot.competitorContext.status
									)}
								>
									{competitorContextBadgeLabel(activeTool.brandSnapshot.competitorContext)}
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
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div className="flex items-center gap-2">
									<Palette className="size-4 text-brand-text/70" />
									<p className="text-sm font-semibold text-foreground">Brand snapshot</p>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={!hasEditableBrandValues || requestState !== "idle"}
									onClick={() =>
										brandEditOpen ? handleCancelBrandEdit() : onBrandEditOpenChange(true)
									}
								>
									{brandEditOpen ? <X className="size-4" /> : <Pencil className="size-4" />}
									{brandEditOpen ? "Cancel" : "Edit"}
								</Button>
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
									{brandEditOpen && Object.keys(brandColors).length ? (
										<div className="mt-3 grid gap-3">
											{Object.entries(editedColors).map(([name, value]) => {
												const normalizedValue = normalizeHexColor(value);
												const invalid = !isValidHexColor(normalizedValue);
												return (
													<div
														key={name}
														className="grid gap-3 rounded-2xl border border-brand/10 bg-brand-light/8 p-3 sm:grid-cols-[minmax(0,1fr)_120px]"
													>
														<div className="space-y-2">
															<p className="text-sm font-medium capitalize text-foreground">
																{formatEditableFieldLabel(name)}
															</p>
															<div className="flex items-center gap-3">
																<input
																	type="color"
																	aria-label={`${name} color`}
																	value={invalid ? "#000000" : normalizedValue}
																	onChange={(event) =>
																		setEditedColors((current) => ({
																			...current,
																			[name]: normalizeHexColor(event.target.value),
																		}))
																	}
																	className="h-10 w-14 cursor-pointer rounded-xl border border-brand/15 bg-white p-1"
																/>
																<span
																	className="size-6 rounded-full border border-black/10"
																	style={{ backgroundColor: invalid ? undefined : normalizedValue }}
																/>
															</div>
														</div>
														<div className="space-y-2">
															<label
																htmlFor={`brand-color-${name}`}
																className="text-xs uppercase tracking-[0.14em] text-brand-text/55"
															>
																Hex
															</label>
															<Input
																id={`brand-color-${name}`}
																value={value}
																maxLength={7}
																placeholder="#1A2B3C"
																aria-invalid={invalid}
																onChange={(event) =>
																	setEditedColors((current) => ({
																		...current,
																		[name]: normalizeHexColor(event.target.value),
																	}))
																}
																className={cn("uppercase", invalid && "border-destructive")}
															/>
														</div>
													</div>
												);
											})}
										</div>
									) : null}
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
									{brandEditOpen && (brandFonts.length || currentFont) ? (
										<div className="mt-3 grid gap-3 rounded-2xl border border-brand/10 bg-brand-light/8 p-3">
											<div ref={fontPickerRef} className="relative space-y-2">
												<label
													htmlFor="brand-font-picker-trigger"
													className="text-xs uppercase tracking-[0.14em] text-brand-text/55"
												>
													Primary font
												</label>
												<button
													id="brand-font-picker-trigger"
													type="button"
													aria-haspopup="dialog"
													aria-expanded={fontPickerOpen}
													onClick={handleToggleFontPicker}
													className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full items-center justify-between rounded-md border bg-white px-3 py-1 text-left text-sm outline-none focus-visible:ring-[3px]"
												>
													<span
														className={cn(
															"truncate pr-3 text-foreground",
															!selectedFont && "text-muted-foreground"
														)}
														style={selectedFont ? selectedFontPreviewStyle : undefined}
													>
														{selectedFont || "Select a font"}
													</span>
													<ChevronDown className="size-4 shrink-0 text-brand-text/60" />
												</button>
												{fontPickerOpen ? (
													<div className="absolute left-0 top-[calc(100%+0.75rem)] z-30 w-full rounded-3xl border border-brand/15 bg-white p-3 shadow-2xl shadow-brand/10">
														<div className="space-y-3">
															<div className="space-y-2">
																<label
																	htmlFor="brand-font-search"
																	className="text-xs uppercase tracking-[0.14em] text-brand-text/55"
																>
																	Search fonts
																</label>
																<Input
																	id="brand-font-search"
																	value={fontSearch}
																	placeholder="Search fonts"
																	onChange={(event) => setFontSearch(event.target.value)}
																	autoFocus
																/>
															</div>
															<div className="space-y-2">
																<label
																	htmlFor="brand-font-category-filter"
																	className="text-xs uppercase tracking-[0.14em] text-brand-text/55"
																>
																	Category
																</label>
																<select
																	id="brand-font-category-filter"
																	value={fontCategoryFilter}
																	onChange={(event) =>
																		setFontCategoryFilter(
																			event.target.value as BrandFontCategory | "all"
																		)
																	}
																	className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-white px-3 py-1 text-sm outline-none focus-visible:ring-[3px]"
																>
																	<option value="all">All fonts</option>
																	{Object.entries(BRAND_FONT_CATEGORY_LABELS).map(
																		([value, label]) => (
																			<option key={value} value={value}>
																				{label}
																			</option>
																		)
																	)}
																</select>
															</div>
															<div className="max-h-72 overflow-y-auto rounded-2xl border border-brand/10 bg-brand-light/8 p-1">
																{filteredFontOptions.length ? (
																	filteredFontOptions.map((font) => {
																		const isSelected = fontChoice === font.name;
																		return (
																			<button
																				key={font.name}
																				type="button"
																				onClick={() => {
																					setFontChoice(font.name);
																					setCustomFontValue("");
																					setFontSearch("");
																					setFontCategoryFilter("all");
																					setFontPickerOpen(false);
																				}}
																				className={cn(
																					"flex w-full items-center justify-between rounded-[18px] px-3 py-2 text-left transition",
																					isSelected
																						? "bg-white shadow-sm"
																						: "hover:bg-white/80"
																				)}
																			>
																				<div className="min-w-0">
																					<p
																						className="truncate text-base text-foreground"
																						style={getFontPreviewStyle(
																							font.name,
																							font.category
																						)}
																					>
																						{font.name}
																					</p>
																					<p className="text-xs text-muted-foreground">
																						{BRAND_FONT_CATEGORY_LABELS[font.category]}
																					</p>
																				</div>
																				{isSelected ? (
																					<Check className="size-4 shrink-0 text-foreground" />
																				) : null}
																			</button>
																		);
																	})
																) : (
																	<p className="px-3 py-6 text-sm text-muted-foreground">
																		No fonts match that search.
																	</p>
																)}
															</div>
															<div className="border-t border-brand/10 pt-3">
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	className="w-full justify-start"
																	onClick={() => {
																		setFontChoice("__custom__");
																		setFontSearch("");
																		setFontCategoryFilter("all");
																		setFontPickerOpen(false);
																	}}
																>
																	Use custom font…
																</Button>
															</div>
														</div>
													</div>
												) : null}
											</div>
											{fontChoice === "__custom__" ? (
												<div className="space-y-2">
													<label
														htmlFor="brand-font-custom"
														className="text-xs uppercase tracking-[0.14em] text-brand-text/55"
													>
														Custom font
													</label>
													<Input
														id="brand-font-custom"
														value={customFontValue}
														placeholder="Alegreya Sans"
														onChange={(event) => setCustomFontValue(event.target.value)}
													/>
												</div>
											) : null}
										</div>
									) : null}
									{brandEditOpen ? (
										<div className="mt-3 rounded-2xl border border-brand/10 bg-brand-light/8 p-3">
											<p className="text-xs text-muted-foreground">
												Changes apply through a real rebuild — this takes a few seconds, just like
												editing in chat.
											</p>
											<div className="mt-3 flex flex-wrap items-center gap-2">
												<Button
													type="button"
													size="sm"
													disabled={!canApplyBrandUpdate}
													onClick={handleApply}
												>
													Apply
												</Button>
												{hasInvalidColor ? (
													<p className="text-xs text-destructive">
														Use full 6-digit hex colors like #1A2B3C.
													</p>
												) : null}
											</div>
										</div>
									) : null}
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
												Status:{" "}
												{activeTool.brandSnapshot.competitorContext.status.replace(/_/g, " ")}
											</Badge>
											{activeTool.brandSnapshot.competitorContext.signal ? (
												<Badge
													variant="outline"
													className="border-brand/10 bg-white/70 text-brand-text"
												>
													Signal:{" "}
													{activeTool.brandSnapshot.competitorContext.signal.replace(/_/g, " ")}
												</Badge>
											) : null}
											{activeTool.brandSnapshot.competitorContext.industry ? (
												<Badge
													variant="outline"
													className="border-brand/10 bg-white/70 text-brand-text"
												>
													{activeTool.brandSnapshot.competitorContext.industry}
												</Badge>
											) : null}
										</div>
										{activeTool.brandSnapshot.competitorContext.status === "pending" ? (
											<p className="mt-3 text-xs text-muted-foreground">
												Analyzing competitors… this panel will fill in automatically.
											</p>
										) : null}
										{activeTool.brandSnapshot.competitorContext.competitors.length ? (
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
										) : null}
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

function getFontPreviewStyle(
	fontFamily: string,
	category?: BrandFontCategory
): CSSProperties | undefined {
	if (!fontFamily) return undefined;
	if (fontFamily === "system-ui") {
		return { fontFamily: "system-ui" };
	}
	const fallback =
		category === "serif"
			? "serif"
			: category === "monospace"
				? "monospace"
				: category === "handwriting"
					? "cursive"
					: "sans-serif";
	return { fontFamily: `"${fontFamily}", ${fallback}` };
}

function formatEditableFieldLabel(value: string) {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ");
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

function competitorContextBadgeVariant(
	status: "pending" | "completed" | "failed"
): "secondary" | "outline" | "destructive" {
	if (status === "pending") return "secondary";
	if (status === "failed") return "outline";
	return "secondary";
}

function competitorContextBadgeLabel(
	context: NonNullable<NonNullable<BuilderDashboardPanelProps["activeTool"]>["brandSnapshot"]>["competitorContext"]
) {
	if (!context) return "Competitor check";
	if (context.status === "pending") return "Competitors: analyzing…";
	if (context.status === "failed") return "Competitors: unavailable";
	const count = context.competitors.length ? ` (${context.competitors.length})` : "";
	return `Competitors: ${context.signal?.replace(/_/g, " ") ?? "review"}${count}`;
}
