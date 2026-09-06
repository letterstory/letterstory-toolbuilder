import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const dmSans = DM_Sans({
	variable: "--font-dm-sans",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: {
		default: "Letterstory Toolbuilder",
		template: "%s | Letterstory Toolbuilder",
	},
	description: "Brand-aware micro-tool generation for the Letterstory toolbuilder product.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning className={dmSans.variable}>
			<body className="font-sans">
				{children}
				<Toaster position="top-right" richColors />
			</body>
		</html>
	);
}
