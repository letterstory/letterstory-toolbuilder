import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";

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
							<p className="text-xs text-muted-foreground">Brand ingestion workspace</p>
						</div>
					</div>
					<p className="hidden text-sm text-muted-foreground md:block">
						Firecrawl + Letterstory design system
					</p>
				</div>
				<Separator />
			</header>
			<main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">{children}</main>
		</div>
	);
}
