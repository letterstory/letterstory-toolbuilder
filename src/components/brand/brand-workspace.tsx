"use client";

import type { ComponentType, FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import {
	AlertCircle,
	ArrowUpRight,
	BadgeCheck,
	Eye,
	ImageIcon,
	LoaderCircle,
	Palette,
	ShieldAlert,
	ShieldCheck,
	ShieldX,
	Sparkles,
	Type,
	WandSparkles,
} from "lucide-react";
import type {
	BrandCompetitorComparisonResult,
	BrandFidelityValidationResult,
	BrandIngestionResult,
	BrandProfile,
} from "@/lib/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn, normalizeSiteUrl } from "@/lib/utils";

const INITIAL_URL = "https://stripe.com";

type RequestState = "idle" | "loading" | "submitting-validation" | "submitting-compare";

type StatusTone = "info" | "success" | "warning" | "destructive";

interface StatusMessage {
	title: string;
	description: string;
	tone: StatusTone;
}

export function BrandWorkspace() {
	const [siteUrl, setSiteUrl] = useState(INITIAL_URL);
	const [requestState, setRequestState] = useState<RequestState>("idle");
	const [ingestionResult, setIngestionResult] = useState<BrandIngestionResult | null>(null);
	const [validationResult, setValidationResult] = useState<BrandFidelityValidationResult | null>(
		null
	);
	const [fixesApplied, setFixesApplied] = useState(false);
	const [competitorUrlsInput, setCompetitorUrlsInput] = useState("");
	const [compareResult, setCompareResult] = useState<BrandCompetitorComparisonResult | null>(null);
	const [statusMessage, setStatusMessage] = useState<StatusMessage>({
		title: "Ready to ingest",
		description:
			"Enter a marketing site URL to extract real brand tokens and inspect the output before generation.",
		tone: "info",
	});

	const profile = ingestionResult?.status === "success" ? ingestionResult.profile : null;
	const formattedProfile = useMemo(
		() => (profile ? JSON.stringify(profile, null, 2) : ""),
		[profile]
	);

	async function handleIngest(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const normalizedUrl = normalizeSiteUrl(siteUrl);
		setSiteUrl(normalizedUrl);
		setRequestState("loading");
		setValidationResult(null);
		setFixesApplied(false);
		setStatusMessage({
			title: "Running Context.dev ingestion",
			description: "Pulling the site, normalizing the profile, and preparing the dashboard.",
			tone: "info",
		});

		try {
			const response = await fetch("/api/brand/ingest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ siteUrl: normalizedUrl }),
			});
			const result = (await response.json()) as BrandIngestionResult;
			setIngestionResult(result);
			setStatusMessage(toIngestionStatusMessage(result));
		} catch {
			setIngestionResult({
				status: "error",
				requestedUrl: normalizedUrl,
				message: "The request failed before Toolbuilder could read the response.",
			});
			setStatusMessage({
				title: "Request failed",
				description:
					"The dashboard could not reach the brand ingestion route. Check the dev server and try again.",
				tone: "destructive",
			});
		} finally {
			setRequestState("idle");
		}
	}

	async function handleValidate() {
		if (!profile) return;
		setRequestState("submitting-validation");
		setFixesApplied(false);
		setStatusMessage({
			title: "Running brand fidelity validation",
			description:
				"Cross-checking the extracted profile against fresh rendered-page content and Claude assessment.",
			tone: "info",
		});

		try {
			const response = await fetch("/api/brand/validate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ siteUrl, profile }),
			});
			const result = (await response.json()) as BrandFidelityValidationResult;
			setValidationResult(result);
			setStatusMessage(toValidationStatusMessage(result));
		} catch {
			setValidationResult({
				status: "error",
				code: "anthropic_error",
				requestedUrl: siteUrl,
				message: "The validation request failed before Toolbuilder could read the response.",
			});
			setStatusMessage({
				title: "Validation request failed",
				description:
					"The dashboard could not reach the validation route. Check the dev server and try again.",
				tone: "destructive",
			});
		} finally {
			setRequestState("idle");
		}
	}

	function handleApplyFixes() {
		if (!validationResult || validationResult.status !== "success") return;
		setIngestionResult({
			status: "success",
			requestedUrl: siteUrl,
			profile: validationResult.enrichedProfile,
		});
		setFixesApplied(true);
		setStatusMessage({
			title: "Applied fidelity fixes to profile",
			description:
				"Merged the validation's corrected typography hierarchy, spacing rhythm, imagery style, tone of voice, and descriptors into the brand profile. Overview and Raw profile now reflect the update.",
			tone: "success",
		});
	}

	async function handleCompare() {
		if (!profile) return;
		const competitorUrls = competitorUrlsInput
			.split(",")
			.map((entry) => normalizeSiteUrl(entry))
			.filter(Boolean);
		if (!competitorUrls.length) {
			setStatusMessage({
				title: "Add at least one competitor",
				description: "Enter one or more competitor URLs, separated by commas, before comparing.",
				tone: "warning",
			});
			return;
		}

		setRequestState("submitting-compare");
		setStatusMessage({
			title: "Comparing against competitors",
			description:
				"Scoring extracted-token distinctiveness, plus a Claude-vision visual similarity check when configured.",
			tone: "info",
		});

		try {
			const response = await fetch("/api/brand/compare", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ primarySiteUrl: siteUrl, primaryProfile: profile, competitorUrls }),
			});
			const result = (await response.json()) as BrandCompetitorComparisonResult;
			setCompareResult(result);
			setStatusMessage(toCompareStatusMessage(result));
		} catch {
			setCompareResult({
				status: "error",
				code: "context_dev_error",
				requestedUrl: siteUrl,
				message: "The comparison request failed before Toolbuilder could read the response.",
			});
			setStatusMessage({
				title: "Comparison request failed",
				description:
					"The dashboard could not reach the competitor comparison route. Check the dev server and try again.",
				tone: "destructive",
			});
		} finally {
			setRequestState("idle");
		}
	}

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<WandSparkles className="size-5 text-brand-text" />
						Ingest a brand site
					</CardTitle>
					<CardDescription>
						This workspace calls the real server-side ingestion flow in{" "}
						<code>src/lib/brand/service.ts</code>.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
						onSubmit={handleIngest}
					>
						<div className="grid gap-2">
							<Label htmlFor="brand-site-url">Site URL</Label>
							<Input
								id="brand-site-url"
								type="text"
								inputMode="url"
								placeholder="https://stripe.com"
								value={siteUrl}
								onChange={(event) => setSiteUrl(event.target.value)}
								onBlur={(event) => setSiteUrl(normalizeSiteUrl(event.target.value))}
								required
							/>
						</div>
						<div className="flex flex-wrap gap-3">
							<Button type="submit" disabled={requestState !== "idle"}>
								{requestState === "loading" ? (
									<LoaderCircle className="animate-spin" />
								) : (
									<WandSparkles />
								)}
								Run ingestion
							</Button>
							<Button
								type="button"
								variant="outline"
								disabled={!profile || requestState !== "idle"}
								onClick={handleValidate}
							>
								{requestState === "submitting-validation" ? (
									<LoaderCircle className="animate-spin" />
								) : (
									<Sparkles />
								)}
								Validate fidelity
							</Button>
						</div>
					</form>
				</CardContent>
				<CardFooter>
					<p className="text-sm text-muted-foreground">
						Tip: try a public marketing homepage like Stripe, Ramp, or Basecamp to see richer brand
						cues.
					</p>
				</CardFooter>
			</Card>

			<StatusAlert message={statusMessage} />

			{requestState === "loading" ? <LoadingSkeleton /> : null}

			{profile ? (
				<Tabs defaultValue="overview" className="gap-4">
					<TabsList>
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="validation">Validation</TabsTrigger>
						<TabsTrigger value="competitors">Competitors</TabsTrigger>
						<TabsTrigger value="raw">Raw profile</TabsTrigger>
					</TabsList>
					<TabsContent value="overview" className="space-y-6">
						<BrandOverview profile={profile} />
					</TabsContent>
					<TabsContent value="validation" className="space-y-6">
						<BrandValidationPanel
							validationResult={validationResult}
							onValidate={handleValidate}
							isValidating={requestState === "submitting-validation"}
							disabled={requestState !== "idle"}
							onApplyFixes={handleApplyFixes}
							fixesApplied={fixesApplied}
						/>
					</TabsContent>
					<TabsContent value="competitors" className="space-y-6">
						<BrandCompetitorPanel
							compareResult={compareResult}
							competitorUrlsInput={competitorUrlsInput}
							onCompetitorUrlsInputChange={setCompetitorUrlsInput}
							onCompare={handleCompare}
							isComparing={requestState === "submitting-compare"}
							disabled={requestState !== "idle"}
						/>
					</TabsContent>
					<TabsContent value="raw">
						<Card>
							<CardHeader>
								<CardTitle>Structured profile</CardTitle>
								<CardDescription>
									Useful for debugging the exact normalized object passed into generation and
									validation.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Textarea
									value={formattedProfile}
									readOnly
									className="min-h-[28rem] font-mono text-xs"
								/>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			) : requestState === "idle" ? (
				<Card className="border-dashed">
					<CardContent className="py-12 text-center text-sm text-muted-foreground">
						Run an ingestion to populate the dashboard with real brand data.
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}

function BrandOverview({ profile }: { profile: BrandProfile }) {
	const colorEntries = Object.entries(profile.colors);
	const hasLogo = Boolean(profile.images.logo.url || profile.primaryLogoUrl);
	const logoUrl = profile.images.logo.url ?? profile.primaryLogoUrl;
	const canonicalLogoUri = profile.images.logo.canonicalDataUri;

	return (
		<>
			<Card>
				<CardHeader>
					<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
						<div className="space-y-2">
							<CardTitle className="text-2xl">{profile.brandName ?? profile.url}</CardTitle>
							<CardDescription className="max-w-3xl">
								{(profile.metadata.description as string | undefined)
									? String(profile.metadata.description)
									: "Context.dev returned a brand profile without a page description."}
							</CardDescription>
						</div>
						<div className="flex flex-wrap gap-2">
							<Badge variant="outline">{profile.source}</Badge>
							{profile.colorScheme ? (
								<Badge variant="secondary">{profile.colorScheme}</Badge>
							) : null}
							{typeof profile.confidence === "number" ? (
								<Badge className="bg-brand-light text-brand-text">
									{Math.round(profile.confidence * 100)}% confidence
								</Badge>
							) : null}
						</div>
					</div>
				</CardHeader>
				<CardContent className="grid min-w-0 gap-6 lg:grid-cols-[1.3fr_0.9fr]">
					<div className="grid min-w-0 gap-6 md:grid-cols-2">
						<SectionCard
							icon={Palette}
							title="Palette"
							description="Visual swatches from the normalized Context.dev response."
						>
							{colorEntries.length ? (
								<div className="grid gap-3 sm:grid-cols-2">
									{colorEntries.map(([name, value]) => (
										<div key={`${name}-${value}`} className="rounded-lg border p-3">
											<div
												className="mb-3 h-16 rounded-md border"
												style={{ backgroundColor: value }}
											/>
											<p className="text-sm font-medium capitalize">{formatKey(name)}</p>
											<p className="text-xs text-muted-foreground">{value}</p>
										</div>
									))}
								</div>
							) : (
								<EmptyCopy>No structured colors were returned for this site.</EmptyCopy>
							)}
						</SectionCard>

						<SectionCard
							icon={Type}
							title="Typography"
							description="Primary fonts, hierarchy, and scale cues."
						>
							<div className="space-y-4">
								<Definition
									label="Detected fonts"
									value={profile.fonts.join(", ") || "No fonts returned"}
								/>
								<Definition label="Primary font" value={profile.typography.primaryFont ?? "—"} />
								<Definition label="Heading font" value={profile.typography.headingFont ?? "—"} />
								<Definition label="Body font" value={profile.typography.bodyFont ?? "—"} />
								<Definition label="Hierarchy" value={profile.typography.hierarchy ?? "—"} />
								{Object.keys(profile.typography.scale).length ? (
									<div className="space-y-2">
										<p className="text-sm font-medium">Type scale</p>
										<div className="flex flex-wrap gap-2">
											{Object.entries(profile.typography.scale).map(([name, value]) => (
												<Badge key={`${name}-${value}`} variant="outline">
													{formatKey(name)}: {value}
												</Badge>
											))}
										</div>
									</div>
								) : null}
							</div>
						</SectionCard>

						<SectionCard
							icon={BadgeCheck}
							title="Personality"
							description="Tone, audience, and descriptors from the profile."
						>
							<div className="space-y-4">
								<Definition label="Tone" value={profile.personality.tone ?? "—"} />
								<Definition label="Tone of voice" value={profile.personality.toneOfVoice ?? "—"} />
								<Definition label="Energy" value={profile.personality.energy ?? "—"} />
								<Definition label="Audience" value={profile.personality.targetAudience ?? "—"} />
								{profile.personality.descriptors.length ? (
									<div className="flex flex-wrap gap-2">
										{profile.personality.descriptors.map((descriptor) => (
											<Badge key={descriptor} variant="secondary">
												{descriptor}
											</Badge>
										))}
									</div>
								) : null}
								{profile.personality.notableSignals.length ? (
									<div className="space-y-2">
										<p className="text-sm font-medium">Notable signals</p>
										<ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
											{profile.personality.notableSignals.map((signal) => (
												<li key={signal}>{signal}</li>
											))}
										</ul>
									</div>
								) : null}
							</div>
						</SectionCard>

						<SectionCard
							icon={Sparkles}
							title="Design system"
							description="Implementation and spacing signals."
						>
							<div className="space-y-4">
								<Definition label="Framework" value={profile.designSystem.framework ?? "—"} />
								<Definition
									label="Component library"
									value={profile.designSystem.componentLibrary ?? "—"}
								/>
								<Definition
									label="Implementation style"
									value={profile.designSystem.implementationStyle ?? "—"}
								/>
								<Definition
									label="Base spacing"
									value={profile.spacing.baseUnit ? `${profile.spacing.baseUnit}px` : "—"}
								/>
								<Definition label="Spacing rhythm" value={profile.spacing.rhythm ?? "—"} />
								<Definition label="Border radius" value={profile.spacing.borderRadius ?? "—"} />
								{profile.designSystem.notes.length ? (
									<ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
										{profile.designSystem.notes.map((note) => (
											<li key={note}>{note}</li>
										))}
									</ul>
								) : null}
							</div>
						</SectionCard>
					</div>

					<div className="min-w-0 space-y-6">
						<SectionCard
							icon={ImageIcon}
							title="Imagery & logo"
							description="Preview the actual asset Context.dev selected, plus other linked image metadata."
						>
							<div className="space-y-4">
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="space-y-2">
										<p className="text-xs font-medium text-muted-foreground">
											Raw Context.dev selection
										</p>
										<div className="flex min-h-40 items-center justify-center rounded-xl border bg-muted/40 p-6">
											{hasLogo && logoUrl ? (
												// eslint-disable-next-line @next/next/no-img-element
												<img
													src={logoUrl}
													alt={
														profile.images.logo.alt ?? `${profile.brandName ?? profile.url} logo`
													}
													className="max-h-28 max-w-full object-contain"
												/>
											) : (
												<EmptyCopy>No logo preview returned.</EmptyCopy>
											)}
										</div>
									</div>
									<div className="space-y-2">
										<p className="text-xs font-medium text-muted-foreground">
											Canonical (normalized) logo
										</p>
										<div className="flex min-h-40 items-center justify-center rounded-xl border bg-muted/40 p-6">
											{canonicalLogoUri ? (
												// eslint-disable-next-line @next/next/no-img-element
												<img
													src={canonicalLogoUri}
													alt={`${profile.brandName ?? profile.url} canonical logo`}
													className="max-h-28 max-w-full object-contain"
												/>
											) : (
												<EmptyCopy>No canonical logo resolved yet.</EmptyCopy>
											)}
										</div>
									</div>
								</div>
								<div className="space-y-3 text-sm">
									<Definition label="Primary logo URL" value={profile.primaryLogoUrl ?? "—"} />
									<Definition label="Logo kind" value={profile.images.logo.kind ?? "—"} />
									<Definition
										label="Canonical logo source"
										value={profile.images.logo.canonicalSourceUrl ?? "—"}
									/>
									<Definition label="Imagery style" value={profile.images.imageryStyle ?? "—"} />
									<Definition label="Favicon" value={profile.images.faviconUrl ?? "—"} />
									<Definition label="OG image" value={profile.images.ogImageUrl ?? "—"} />
								</div>
								{profile.images.logo.canonicalWarnings.length ? (
									<Alert>
										<AlertCircle className="size-4" />
										<AlertTitle>Canonical logo notes</AlertTitle>
										<AlertDescription>
											<ul className="list-disc space-y-1 pl-5">
												{profile.images.logo.canonicalWarnings.map((warning) => (
													<li key={warning}>{warning}</li>
												))}
											</ul>
										</AlertDescription>
									</Alert>
								) : null}
								{profile.images.notes.length ? (
									<Alert>
										<AlertCircle className="size-4" />
										<AlertTitle>Asset notes</AlertTitle>
										<AlertDescription>
											<ul className="list-disc space-y-1 pl-5">
												{profile.images.notes.map((note) => (
													<li key={note}>{note}</li>
												))}
											</ul>
										</AlertDescription>
									</Alert>
								) : null}
							</div>
						</SectionCard>

						<SectionCard
							icon={ArrowUpRight}
							title="Source page"
							description="Reference metadata for the exact normalized site root."
						>
							<div className="space-y-4 text-sm">
								<Definition label="Normalized URL" value={profile.url} />
								<Definition label="Page title" value={readMetadataString(profile.metadata.title)} />
								<Definition
									label="Status code"
									value={readMetadataString(profile.metadata.statusCode)}
								/>
								<Separator />
								<div>
									<p className="mb-2 text-sm font-medium">Additional logo candidates</p>
									{profile.logoUrls.length ? (
										<ul className="min-w-0 space-y-2 text-xs text-muted-foreground">
											{profile.logoUrls.map((url) => {
												const isDataUri = url.startsWith("data:");
												const display =
													isDataUri || url.length > MAX_INLINE_VALUE_LENGTH
														? `${url.slice(0, MAX_INLINE_VALUE_LENGTH)}…`
														: url;
												return (
													<li
														key={url}
														className="min-w-0 [overflow-wrap:anywhere]"
														title={display === url ? undefined : url}
													>
														{display}
													</li>
												);
											})}
										</ul>
									) : (
										<EmptyCopy>No alternate logo candidates returned.</EmptyCopy>
									)}
								</div>
							</div>
						</SectionCard>
					</div>
				</CardContent>
			</Card>
		</>
	);
}

function BrandValidationPanel({
	validationResult,
	onValidate,
	isValidating,
	disabled,
	onApplyFixes,
	fixesApplied,
}: {
	validationResult: BrandFidelityValidationResult | null;
	onValidate: () => void;
	isValidating: boolean;
	disabled: boolean;
	onApplyFixes: () => void;
	fixesApplied: boolean;
}) {
	if (!validationResult) {
		return (
			<Card className="border-dashed">
				<CardContent className="flex flex-col items-center gap-4 py-12 text-center text-sm text-muted-foreground">
					<p>
						Run the validation step to cross-check the extracted profile against fresh rendered-page
						content and Claude review.
					</p>
					<Button type="button" onClick={onValidate} disabled={disabled}>
						{isValidating ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
						Validate fidelity
					</Button>
				</CardContent>
			</Card>
		);
	}

	if (validationResult.status !== "success") {
		return (
			<Card>
				<CardContent className="flex flex-col gap-4 pt-6">
					<Alert variant="destructive">
						<ShieldX className="size-4" />
						<AlertTitle>
							{validationResult.status === "not_configured"
								? "Validation not configured"
								: "Validation failed"}
						</AlertTitle>
						<AlertDescription>{validationResult.message}</AlertDescription>
					</Alert>
					<Button
						type="button"
						variant="outline"
						className="self-start"
						onClick={onValidate}
						disabled={disabled}
					>
						{isValidating ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
						Retry validation
					</Button>
				</CardContent>
			</Card>
		);
	}

	const { assessment } = validationResult;
	const statusStyles: Record<string, string> = {
		pass: "border-emerald-200 bg-emerald-50 text-emerald-700",
		warn: "border-amber-200 bg-amber-50 text-amber-700",
		fail: "border-rose-200 bg-rose-50 text-rose-700",
	};
	const Icon =
		assessment.status === "pass"
			? ShieldCheck
			: assessment.status === "warn"
				? ShieldAlert
				: ShieldX;

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							<Icon className="size-5" />
							Fidelity assessment
						</CardTitle>
						<CardDescription>{assessment.summary}</CardDescription>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<Badge variant="outline" className={cn("capitalize", statusStyles[assessment.status])}>
							{assessment.status} · {assessment.similarityScore}/100 · {assessment.confidence}{" "}
							confidence
						</Badge>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onValidate}
							disabled={disabled}
						>
							{isValidating ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
							Re-run validation
						</Button>
						{assessment.gaps.length ? (
							<Button
								type="button"
								size="sm"
								onClick={onApplyFixes}
								disabled={disabled || fixesApplied}
								title="Merge the validation's corrected hierarchy, spacing rhythm, imagery style, tone, and descriptors into the brand profile."
							>
								{fixesApplied ? <ShieldCheck /> : <BadgeCheck />}
								{fixesApplied ? "Fixes applied" : `Apply fixes (${assessment.gaps.length})`}
							</Button>
						) : null}
					</div>
				</div>
			</CardHeader>
			<CardContent className="grid min-w-0 gap-6 lg:grid-cols-[0.95fr_1.05fr]">
				<div className="space-y-4">
					<Definition label="Model" value={validationResult.model} />
					<Definition label="Reference URL" value={validationResult.referenceUrl} />
					<Definition label="Derived tone" value={assessment.derivedSignals.toneOfVoice ?? "—"} />
					<Definition label="Imagery style" value={assessment.derivedSignals.imageryStyle ?? "—"} />
					<Definition
						label="Type hierarchy"
						value={assessment.derivedSignals.typeHierarchy ?? "—"}
					/>
					<Definition
						label="Spacing rhythm"
						value={assessment.derivedSignals.spacingRhythm ?? "—"}
					/>
					<div>
						<p className="mb-2 text-sm font-medium">Confirmed signals</p>
						{assessment.confirmedSignals.length ? (
							<div className="flex flex-wrap gap-2">
								{assessment.confirmedSignals.map((signal) => (
									<Badge key={signal} variant="secondary">
										{signal}
									</Badge>
								))}
							</div>
						) : (
							<EmptyCopy>No confirmed signals were returned.</EmptyCopy>
						)}
					</div>
				</div>
				<div>
					<p className="mb-3 text-sm font-medium">Gaps to address</p>
					{assessment.gaps.length ? (
						<div className="space-y-3">
							{assessment.gaps.map((gap, index) => (
								<div key={`${gap.field}-${index}`} className="rounded-lg border p-4">
									<div className="mb-2 flex items-center justify-between gap-3">
										<p className="text-sm font-semibold capitalize">{gap.field}</p>
										<Badge variant="outline" className="capitalize">
											{gap.severity}
										</Badge>
									</div>
									<p className="text-sm">{gap.issue}</p>
									<p className="mt-2 text-xs text-muted-foreground">Evidence: {gap.evidence}</p>
									<p className="mt-2 text-xs text-muted-foreground">
										Recommendation: {gap.recommendation}
									</p>
								</div>
							))}
						</div>
					) : (
						<EmptyCopy>No explicit gaps were returned.</EmptyCopy>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

const MAX_INLINE_VALUE_LENGTH = 120;

function BrandCompetitorPanel({
	compareResult,
	competitorUrlsInput,
	onCompetitorUrlsInputChange,
	onCompare,
	isComparing,
	disabled,
}: {
	compareResult: BrandCompetitorComparisonResult | null;
	competitorUrlsInput: string;
	onCompetitorUrlsInputChange: (value: string) => void;
	onCompare: () => void;
	isComparing: boolean;
	disabled: boolean;
}) {
	const inputRow = (
		<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
			<div className="grid gap-2">
				<Label htmlFor="competitor-urls">Competitor URLs</Label>
				<Input
					id="competitor-urls"
					placeholder="adyen.com, paypal.com"
					value={competitorUrlsInput}
					onChange={(event) => onCompetitorUrlsInputChange(event.target.value)}
				/>
			</div>
			<Button type="button" onClick={onCompare} disabled={disabled}>
				{isComparing ? <LoaderCircle className="animate-spin" /> : <Eye />}
				Compare
			</Button>
		</div>
	);

	if (!compareResult) {
		return (
			<Card className="border-dashed">
				<CardContent className="flex flex-col gap-4 py-8">
					<p className="text-center text-sm text-muted-foreground">
						Compare this brand against named competitors on extracted palette families, fonts, and
						tone descriptors. Visual-similarity scoring is unavailable in the current Context.dev
						cutover because the ingestion flow no longer fetches screenshots.
					</p>
					{inputRow}
				</CardContent>
			</Card>
		);
	}

	if (compareResult.status !== "success") {
		return (
			<Card>
				<CardContent className="flex flex-col gap-4 pt-6">
					<Alert variant="destructive">
						<ShieldX className="size-4" />
						<AlertTitle>
							{compareResult.status === "not_configured"
								? "Comparison not configured"
								: "Comparison failed"}
						</AlertTitle>
						<AlertDescription>{compareResult.message}</AlertDescription>
					</Alert>
					{inputRow}
				</CardContent>
			</Card>
		);
	}

	const { competitors, overallDistinctiveness, overallVisualDistinctiveness } = compareResult;
	const statusStyles: Record<string, string> = {
		distinct: "border-emerald-200 bg-emerald-50 text-emerald-700",
		adjacent: "border-amber-200 bg-amber-50 text-amber-700",
		overlapping: "border-rose-200 bg-rose-50 text-rose-700",
	};

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Eye className="size-5" />
						Distinctiveness summary
					</CardTitle>
					<CardDescription>{overallDistinctiveness.summary}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-2">
						<Badge
							variant="outline"
							className={cn("capitalize", statusStyles[overallDistinctiveness.status])}
						>
							Token distinctiveness · {overallDistinctiveness.score}/100 ·{" "}
							{overallDistinctiveness.status}
						</Badge>
						{overallVisualDistinctiveness ? (
							<Badge
								variant="outline"
								className={cn("capitalize", statusStyles[overallVisualDistinctiveness.status])}
							>
								Visual distinctiveness · {overallVisualDistinctiveness.score}/100 ·{" "}
								{overallVisualDistinctiveness.status}
							</Badge>
						) : (
							<Badge variant="outline">
								Visual check unavailable in the current Context.dev cutover
							</Badge>
						)}
					</div>
					{inputRow}
				</CardContent>
			</Card>

			<div className="grid gap-4 md:grid-cols-2">
				{competitors.map(({ profile: competitorProfile, comparison }) => (
					<Card key={comparison.competitorUrl}>
						<CardHeader>
							<div className="flex items-center justify-between gap-3">
								<CardTitle className="text-base">
									{comparison.competitorBrandName ?? competitorProfile.url}
								</CardTitle>
								<Badge
									variant="outline"
									className={cn("capitalize", statusStyles[comparison.status])}
								>
									{comparison.distinctivenessScore}/100 · {comparison.status}
								</Badge>
							</div>
							<CardDescription>{comparison.rationale}</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3 text-sm">
							{comparison.sharedColorFamilies.length ? (
								<Definition
									label="Shared color families"
									value={comparison.sharedColorFamilies.join(", ")}
								/>
							) : null}
							{comparison.sharedFonts.length ? (
								<Definition label="Shared fonts" value={comparison.sharedFonts.join(", ")} />
							) : null}
							<div className="rounded-lg border p-3">
								<p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
									<Eye className="size-3.5" />
									Visual similarity
								</p>
								{comparison.visualSimilarity ? (
									<>
										<p className="text-sm font-semibold">{comparison.visualSimilarity.score}/100</p>
										<p className="text-xs text-muted-foreground">
											{comparison.visualSimilarity.rationale}
										</p>
									</>
								) : (
									<EmptyCopy>
										Not available in the current Context.dev cutover because screenshots are no
										longer fetched.
									</EmptyCopy>
								)}
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}

function Definition({ label, value }: { label: string; value: string }) {
	const isDataUri = value.startsWith("data:");
	const displayValue =
		isDataUri || value.length > MAX_INLINE_VALUE_LENGTH
			? `${value.slice(0, MAX_INLINE_VALUE_LENGTH)}…`
			: value;

	return (
		<div className="min-w-0 space-y-1">
			<p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
				{label}
			</p>
			<p
				className="min-w-0 text-sm text-foreground [overflow-wrap:anywhere]"
				title={displayValue === value ? undefined : value}
			>
				{displayValue}
				{isDataUri ? (
					<span className="ml-1 text-xs text-muted-foreground">(inline data URI, truncated)</span>
				) : null}
			</p>
		</div>
	);
}

function EmptyCopy({ children }: { children: ReactNode }) {
	return <p className="text-sm text-muted-foreground">{children}</p>;
}

function SectionCard({
	icon: Icon,
	title,
	description,
	children,
}: {
	icon: ComponentType<{ className?: string }>;
	title: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<Card className="gap-4">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-lg">
					<Icon className="size-5 text-brand-text" />
					{title}
				</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

function LoadingSkeleton() {
	return (
		<div className="grid gap-6 lg:grid-cols-2">
			{Array.from({ length: 4 }).map((_, index) => (
				<Card key={index}>
					<CardHeader>
						<Skeleton className="h-5 w-32" />
						<Skeleton className="h-4 w-56" />
					</CardHeader>
					<CardContent className="space-y-3">
						<Skeleton className="h-20 w-full" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-4/5" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function StatusAlert({ message }: { message: StatusMessage }) {
	const styles: Record<StatusTone, string> = {
		info: "border-brand/15 bg-brand-light/40 text-brand-text",
		success: "border-emerald-200 bg-emerald-50 text-emerald-700",
		warning: "border-amber-200 bg-amber-50 text-amber-700",
		destructive: "",
	};

	return (
		<Alert
			variant={message.tone === "destructive" ? "destructive" : "default"}
			className={styles[message.tone]}
		>
			<AlertCircle className="size-4" />
			<AlertTitle>{message.title}</AlertTitle>
			<AlertDescription>{message.description}</AlertDescription>
		</Alert>
	);
}

function toIngestionStatusMessage(result: BrandIngestionResult): StatusMessage {
	if (result.status === "success") {
		return {
			title: "Brand profile ready",
			description: `Loaded ${result.profile.brandName ?? result.profile.url} with ${Object.keys(result.profile.colors).length} colors and ${result.profile.fonts.length} detected fonts.`,
			tone: "success",
		};
	}

	if (result.status === "not_configured") {
		return {
			title: "Context.dev not configured",
			description: result.message,
			tone: "warning",
		};
	}

	return {
		title: "Brand ingestion failed",
		description: result.message,
		tone: "destructive",
	};
}

function toValidationStatusMessage(result: BrandFidelityValidationResult): StatusMessage {
	if (result.status === "success") {
		return {
			title: `Validation complete: ${result.assessment.status}`,
			description: `${result.assessment.similarityScore}/100 similarity. ${result.assessment.summary}`,
			tone:
				result.assessment.status === "pass"
					? "success"
					: result.assessment.status === "warn"
						? "warning"
						: "destructive",
		};
	}

	if (result.status === "not_configured") {
		return {
			title: "Validation not configured",
			description: result.message,
			tone: "warning",
		};
	}

	return {
		title: "Validation failed",
		description: result.message,
		tone: "destructive",
	};
}

function toCompareStatusMessage(result: BrandCompetitorComparisonResult): StatusMessage {
	if (result.status === "success") {
		const { overallDistinctiveness, overallVisualDistinctiveness } = result;
		return {
			title: `Comparison complete: ${overallDistinctiveness.status}`,
			description: overallVisualDistinctiveness
				? `${overallDistinctiveness.score}/100 token distinctiveness, ${overallVisualDistinctiveness.score}/100 visual distinctiveness.`
				: `${overallDistinctiveness.score}/100 token distinctiveness. Visual-similarity scoring is unavailable in the current Context.dev cutover.`,
			tone:
				overallDistinctiveness.status === "distinct"
					? "success"
					: overallDistinctiveness.status === "adjacent"
						? "warning"
						: "destructive",
		};
	}

	if (result.status === "not_configured") {
		return {
			title: "Comparison not configured",
			description: result.message,
			tone: "warning",
		};
	}

	return {
		title: "Comparison failed",
		description: result.message,
		tone: "destructive",
	};
}

function formatKey(value: string) {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[-_]/g, " ")
		.trim();
}

function readMetadataString(value: unknown) {
	if (value === null || value === undefined || value === "") return "—";
	return String(value);
}
