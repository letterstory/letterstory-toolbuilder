import type { ReactNode } from "react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

// Dashboard routes drive live tooling flows and must never be emitted as
// long-lived static HTML, or intermediary caches can pin stale JS chunks.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NAV_LINKS = [
	{ href: "/brand", label: "Brand ingestion" },
	{ href: "/build", label: "Build a tool" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen bg-muted/30">
			<header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
				<div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
					<div className="flex items-center gap-3">
						<div className="flex size-10 items-center justify-center rounded-xl bg-brand text-sm font-semibold text-brand-foreground shadow-sm">
							T
						</div>
						<div>
							<p className="text-sm font-semibold tracking-tight text-brand-text">Toolbuilder</p>
							<p className="text-xs text-muted-foreground">Brand-aware micro-tool generation</p>
						</div>
					</div>
					<nav className="flex items-center gap-4">
						{NAV_LINKS.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								className="text-sm font-medium text-muted-foreground transition-colors hover:text-brand-text"
							>
								{link.label}
							</Link>
						))}
					</nav>
				</div>
				<Separator />
			</header>
			<main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">{children}</main>
		</div>
	);
}
