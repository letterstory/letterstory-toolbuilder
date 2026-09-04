"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import {
	AlertCircle,
	Check,
	Copy,
	ExternalLink,
	History,
	LoaderCircle,
	RefreshCw,
	Sparkles,
} from "lucide-react";
import type { ToolGenerationResult } from "@/lib/generation";
import type { GeneratedToolRecord } from "@/lib/generation/store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type RequestState = "idle" | "loading";
type StatusTone = "info" | "success" | "warning" | "destructive";

interface StatusMessage {
	title: string;
	description: string;
	tone: StatusTone;
}

// The recent-tools list only ever needs metadata to render cards and link to
// /t/[id] — the API route omits the (potentially large) html body.
type ToolSummary = Omit<GeneratedToolRecord, "html">;

const INITIAL_STATUS: StatusMessage = {
	title: "Ready to generate",
	description: "Describe a tool, optionally point at a brand site, and Toolbuilder will build a real working iframe-embeddable tool.",
	tone: "info",
};

const EXAMPLE_PROMPTS = [
	"A mileage reimbursement calculator: enter miles driven and it computes the reimbursement using the current IRS standard mileage rate.",
	"A blood pressure category checker: enter systolic/diastolic readings and it classifies them (normal, elevated, stage 1/2 hypertension, crisis) with plain-language guidance.",
	"A SaaS ROI calculator: enter current manual hours/week and hourly cost, show annual savings from automating with the product.",
];

// Sandboxed with scripts/forms/popups but no allow-same-origin: the generated
// document can run its own interactive JS, but can't read this origin's
// cookies/storage or reach into the parent page — the isolation boundary
// discussed for v1 shared-server tool hosting.
const IFRAME_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals";

export function ToolBuilderWorkspace() {
	const [projectName, setProjectName] = useState("");
	const [siteUrl, setSiteUrl] = useState("");
	const [prompt, setPrompt] = useState(EXAMPLE_PROMPTS[0]);
	const [requestState, setRequestState] = useState<RequestState>("idle");
	const [statusMessage, setStatusMessage] = useState<StatusMessage>(INITIAL_STATUS);
	const [copiedTarget, setCopiedTarget] = useState<"iframe" | "full" | null>(null);

	// The tool currently shown in the preview/embed panel — either a fresh
	// generation or a previously generated one reopened from the recent list.
	const [activeTool, setActiveTool] = useState<ToolSummary | null>(null);
	const [recentTools, setRecentTools] = useState<ToolSummary[]>([]);
	const [recentLoading, setRecentLoading] = useState(false);

	const loadRecentTools = useCallback(async () => {
		setRecentLoading(true);
		try {
			const response = await fetch("/api/tools");
			const data = (await response.json()) as { status: string; tools?: ToolSummary[] };
			setRecentTools(data.tools ?? []);
		} catch {
			// Non-critical — the list is a convenience, generation still works
			// even if this fails, so we fail silently rather than block the form.
		} finally {
			setRecentLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadRecentTools();
	}, [loadRecentTools]);

	const previewUrl = activeTool ? `/t/${activeTool.id}` : null;
	const iframeTag = activeTool
		? `<iframe src="${typeof window !== "undefined" ? window.location.origin : ""}/t/${activeTool.id}" sandbox="${IFRAME_SANDBOX}" style="width:100%;min-height:520px;border:0" title="${activeTool.projectName}"></iframe>`
		: "";
	const embedSnippet = iframeTag;
	const fullEmbedSnippet =
		activeTool && activeTool.copy
			? [
					`<h2>${escapeHtml(activeTool.copy.headline)}</h2>`,
					`<p>${escapeHtml(activeTool.copy.supportingCopy)}</p>`,
					iframeTag,
				].join("\n")
			: "";

	async function handleGenerate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setRequestState("loading");
		setCopiedTarget(null);
		setStatusMessage({
			title: "Generating tool",
			description: siteUrl
				? "Pulling brand context, then asking Claude to build the real tool logic. This can take up to a minute."
				: "Asking Claude to build the real tool logic. This can take up to a minute.",
			tone: "info",
		});

		try {
			const response = await fetch("/api/tools/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ projectName, siteUrl, prompt }),
			});
			const data = (await response.json()) as ToolGenerationResult;
			setStatusMessage(toStatusMessage(data));
			if (data.status === "success") {
				setActiveTool(data.tool);
				void loadRecentTools();
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setStatusMessage({ title: "Generation failed", description: message, tone: "destructive" });
		} finally {
			setRequestState("idle");
		}
	}

	function handleReopenRecent(item: ToolSummary) {
		setActiveTool(item);
		setCopiedTarget(null);
		setStatusMessage({
			title: "Reopened tool",
			description: `Showing "${item.projectName}" from ${formatTimestamp(item.createdAt)}.`,
			tone: "info",
		});
	}

	async function handleCopyEmbed(target: "iframe" | "full", text: string) {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedTarget(target);
			setTimeout(() => setCopiedTarget(null), 2000);
		} catch {
			// Clipboard access can be denied by the browser; the snippet is still
			// selectable/copyable manually from the <pre> below.
		}
	}

	return (
		<div className="grid gap-6 lg:grid-cols-2">
			<Card className="lg:col-span-2">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Sparkles className="size-4" />
						Build a tool
					</CardTitle>
					<CardDescription>
						This calls the real generation flow in <code>src/lib/generation/orchestrator.ts</code>: brand context
						(optional) plus a plain-language prompt produce a single self-contained, functional HTML tool.
					</CardDescription>
				</CardHeader>
				<form onSubmit={handleGenerate}>
					<CardContent className="space-y-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="projectName">Tool name</Label>
								<Input
									id="projectName"
									value={projectName}
									onChange={(event) => setProjectName(event.target.value)}
									placeholder="Mileage reimbursement calculator"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="siteUrl">Brand site (optional)</Label>
								<Input
									id="siteUrl"
									value={siteUrl}
									onChange={(event) => setSiteUrl(event.target.value)}
									placeholder="https://stripe.com"
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="prompt">Describe the tool</Label>
							<Textarea
								id="prompt"
								value={prompt}
								onChange={(event) => setPrompt(event.target.value)}
								rows={4}
								placeholder="Describe the tool's inputs, logic, and outputs in plain language."
							/>
							<div className="flex flex-wrap gap-2 pt-1">
								{EXAMPLE_PROMPTS.map((example) => (
									<Button
										key={example}
										type="button"
										variant="outline"
										size="sm"
										onClick={() => setPrompt(example)}
									>
										{example.slice(0, 28)}…
									</Button>
								))}
							</div>
						</div>
					</CardContent>
					<CardFooter className="flex-col items-stretch gap-4">
						<Button type="submit" disabled={requestState === "loading"}>
							{requestState === "loading" ? (
								<LoaderCircle className="size-4 animate-spin" />
							) : (
								<Sparkles className="size-4" />
							)}
							Generate tool
						</Button>
						<StatusAlert message={statusMessage} />
					</CardFooter>
				</form>
			</Card>

			{activeTool ? (
				<>
					<Card>
						<CardHeader>
							<CardTitle>Live preview</CardTitle>
							<CardDescription>Rendered exactly as it will appear embedded on the customer&apos;s site.</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="overflow-hidden rounded-xl border bg-white">
								<iframe
									key={activeTool.id}
									src={previewUrl ?? undefined}
									sandbox={IFRAME_SANDBOX}
									title={activeTool.projectName}
									className="h-[520px] w-full"
								/>
							</div>
						</CardContent>
						<CardFooter>
							<Button asChild variant="outline" size="sm">
								<a href={previewUrl ?? "#"} target="_blank" rel="noreferrer">
									<ExternalLink className="size-4" />
									Open in a new tab
								</a>
							</Button>
						</CardFooter>
					</Card>

					{activeTool.copy ? (
						<Card>
							<CardHeader>
								<CardTitle>Supporting copy</CardTitle>
								<CardDescription>Suggested headline + explanation to place above the embedded tool.</CardDescription>
							</CardHeader>
							<CardContent className="space-y-2">
								<p className="text-sm font-semibold">{activeTool.copy.headline}</p>
								<p className="text-sm text-muted-foreground">{activeTool.copy.supportingCopy}</p>
							</CardContent>
						</Card>
					) : null}

					<Card>
						<CardHeader>
							<CardTitle>Embed snippet</CardTitle>
							<CardDescription>Paste this into the customer&apos;s CMS page where the tool should appear.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<pre className="min-w-0 overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs [overflow-wrap:anywhere] whitespace-pre-wrap">
								{fullEmbedSnippet || embedSnippet}
							</pre>
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant="secondary">{activeTool.model}</Badge>
								{activeTool.siteUrl ? <Badge variant="secondary">{activeTool.siteUrl}</Badge> : null}
								{activeTool.brandSnapshot?.brandName ? (
									<Badge variant="secondary">{activeTool.brandSnapshot.brandName}</Badge>
								) : null}
								{activeTool.brandFidelity ? (
									<Badge variant={brandFidelityBadgeVariant(activeTool.brandFidelity.verdict)}>
										Brand fidelity: {activeTool.brandFidelity.verdict}
									</Badge>
								) : null}
							</div>
							{activeTool.brandFidelity?.notes ? (
								<p className="text-xs text-muted-foreground">{activeTool.brandFidelity.notes}</p>
							) : null}
							{activeTool.warnings.length ? (
								<Alert>
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
						</CardContent>
						<CardFooter className="flex flex-wrap gap-2">
							<Button type="button" variant="outline" size="sm" onClick={() => void handleCopyEmbed("iframe", embedSnippet)}>
								{copiedTarget === "iframe" ? <Check className="size-4" /> : <Copy className="size-4" />}
								{copiedTarget === "iframe" ? "Copied" : "Copy iframe only"}
							</Button>
							{fullEmbedSnippet ? (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => void handleCopyEmbed("full", fullEmbedSnippet)}
								>
									{copiedTarget === "full" ? <Check className="size-4" /> : <Copy className="size-4" />}
									{copiedTarget === "full" ? "Copied" : "Copy with headline & copy"}
								</Button>
							) : null}
						</CardFooter>
					</Card>
					<Separator className="lg:col-span-2" />
				</>
			) : null}

			<Card className="lg:col-span-2">
				<CardHeader className="flex-row items-center justify-between space-y-0">
					<div>
						<CardTitle className="flex items-center gap-2">
							<History className="size-4" />
							Recent tools
						</CardTitle>
						<CardDescription>Reopen a previously generated tool to preview or re-embed it.</CardDescription>
					</div>
					<Button type="button" variant="ghost" size="sm" onClick={() => void loadRecentTools()} disabled={recentLoading}>
						<RefreshCw className={recentLoading ? "size-4 animate-spin" : "size-4"} />
						Refresh
					</Button>
				</CardHeader>
				<CardContent>
					{recentTools.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							{recentLoading ? "Loading…" : "No tools generated yet — build your first one above."}
						</p>
					) : (
						<ul className="divide-y rounded-lg border">
							{recentTools.map((item) => (
								<li key={item.id} className="flex items-center justify-between gap-4 px-4 py-3">
									<div className="min-w-0">
										<p className="truncate text-sm font-medium">{item.projectName}</p>
										<p className="truncate text-xs text-muted-foreground">
											{formatTimestamp(item.createdAt)}
											{item.siteUrl ? ` · ${item.siteUrl}` : ""}
										</p>
									</div>
									<div className="flex shrink-0 items-center gap-2">
										<Button type="button" variant="outline" size="sm" onClick={() => handleReopenRecent(item)}>
											Preview
										</Button>
										<Button asChild variant="ghost" size="sm">
											<a href={`/t/${item.id}`} target="_blank" rel="noreferrer">
												<ExternalLink className="size-4" />
											</a>
										</Button>
									</div>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
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
		<Alert variant={message.tone === "destructive" ? "destructive" : "default"} className={styles[message.tone]}>
			<AlertCircle className="size-4" />
			<AlertTitle>{message.title}</AlertTitle>
			<AlertDescription>{message.description}</AlertDescription>
		</Alert>
	);
}

function toStatusMessage(result: ToolGenerationResult): StatusMessage {
	if (result.status === "success") {
		return {
			title: "Tool generated",
			description: `"${result.tool.projectName}" is ready to preview and embed.${
				result.tool.warnings.length ? " See generation notes below." : ""
			}`,
			tone: result.tool.warnings.length ? "warning" : "success",
		};
	}
	if (result.status === "not_configured") {
		return { title: "Generation not configured", description: result.message, tone: "warning" };
	}
	return { title: "Generation failed", description: result.message, tone: "destructive" };
}

function formatTimestamp(iso: string): string {
	try {
		return new Date(iso).toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	} catch {
		return iso;
	}
}

function brandFidelityBadgeVariant(verdict: "pass" | "warn" | "fail"): "secondary" | "outline" | "destructive" {
	if (verdict === "fail") return "destructive";
	if (verdict === "warn") return "outline";
	return "secondary";
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
