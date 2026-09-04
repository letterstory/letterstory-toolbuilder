import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** Prepends https:// when the user omits a protocol (e.g. "google.com" -> "https://google.com"). */
export function normalizeSiteUrl(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return trimmed;
	return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
