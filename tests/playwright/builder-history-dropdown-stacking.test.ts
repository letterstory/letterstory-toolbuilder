import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { getSupabaseClient, isSupabaseConfigured } from "../../src/lib/config/supabase";
import { saveGeneratedTool, updateGeneratedTool } from "../../src/lib/generation/store";

function makeHtml(title: string, body: string) {
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font-family:Arial,sans-serif;margin:0;padding:24px;background:#f8fafc;color:#0f172a}.card{max-width:560px;margin:0 auto;border:1px solid #cbd5e1;border-radius:16px;padding:24px;background:white}h1{margin:0 0 12px;font-size:28px}p{line-height:1.6}</style></head><body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
}

async function seedTool() {
	const projectName = `History Overlay Regression Tool ${Date.now()}`;
	const saved = await saveGeneratedTool({
		projectName,
		prompt: "history overlay v1",
		siteUrl: "https://example.com",
		brandSnapshot: {
			brandName: "Example",
			colors: { primary: "#4338ca", background: "#ffffff", text: "#111827" },
			fonts: ["Inter"],
			headingFont: "Inter",
			bodyFont: "Inter",
			logoDataUri: null,
		},
		html: makeHtml(projectName, "Preview content version 1."),
		copy: { headline: "V1", supportingCopy: "History overlay supporting copy 1." },
		brandFidelity: null,
		visualCongruence: null,
		model: "test-model",
		warnings: [],
	});

	await updateGeneratedTool(saved.id, {
		projectName: saved.projectName,
		prompt: "history overlay v2",
		siteUrl: saved.siteUrl,
		brandSnapshot: saved.brandSnapshot,
		html: makeHtml(projectName, "Preview content version 2."),
		copy: { headline: "V2", supportingCopy: "History overlay supporting copy 2." },
		brandFidelity: null,
		visualCongruence: null,
		model: "test-model",
		warnings: [],
	});

	return (
		(await updateGeneratedTool(saved.id, {
			projectName: saved.projectName,
			prompt: "history overlay v3",
			siteUrl: saved.siteUrl,
			brandSnapshot: saved.brandSnapshot,
			html: makeHtml(projectName, "Preview content version 3."),
			copy: { headline: "V3", supportingCopy: "History overlay supporting copy 3." },
			brandFidelity: null,
			visualCongruence: null,
			model: "test-model",
			warnings: [],
		})) ?? saved
	);
}

async function cleanupTool(id: string) {
	try {
		if (isSupabaseConfigured()) {
			await getSupabaseClient().from("generated_tools").delete().eq("id", id);
			return;
		}
		await unlink(path.join(process.cwd(), ".data", "tools", `${id}.json`));
	} catch {
		// Ignore cleanup failures so the original assertion error survives.
	}
}

async function run() {
	const tool = await seedTool();
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

	try {
		const baseUrl = process.env.TOOLBUILDER_BASE_URL ?? "http://127.0.0.1:3000";
		await page.goto(`${baseUrl}/build`);
		await page.locator("main button").first().click();
		await page.getByRole("button", { name: tool.projectName }).click();
		await page.getByRole("button", { name: "Open version history" }).click();

		const overlap = await page.locator("body").evaluate(() => {
			const historyButton = document.querySelector('button[aria-label="Open version history"]');
			const dropdown = historyButton?.parentElement?.querySelector("div.absolute");
			const previewLabel = Array.from(document.querySelectorAll("p")).find(
				(el) => el.textContent?.trim() === "Live preview"
			);
			const previewCard = previewLabel?.closest("div")?.parentElement;

			if (!dropdown || !previewCard) {
				throw new Error("Could not find the version-history dropdown or preview card.");
			}

			const dropdownRect = dropdown.getBoundingClientRect();
			const previewRect = previewCard.getBoundingClientRect();
			const overlapPointX = Math.max(dropdownRect.left, previewRect.left) + 20;
			const overlapPointY = Math.max(dropdownRect.top, previewRect.top) + 20;
			const topEl = document.elementFromPoint(overlapPointX, overlapPointY);

			return {
				dropdownRect: dropdownRect.toJSON(),
				previewRect: previewRect.toJSON(),
				overlapWidth: Math.max(
					0,
					Math.min(dropdownRect.right, previewRect.right) - Math.max(dropdownRect.left, previewRect.left)
				),
				overlapHeight: Math.max(
					0,
					Math.min(dropdownRect.bottom, previewRect.bottom) - Math.max(dropdownRect.top, previewRect.top)
				),
				topInsideDropdown: Boolean(topEl && dropdown.contains(topEl)),
				topElementText: topEl?.textContent?.trim().slice(0, 120) ?? null,
				dropdownParentBackdropFilter: dropdown.parentElement
					? getComputedStyle(dropdown.parentElement).backdropFilter
					: null,
				previewBackdropFilter: previewCard.firstElementChild
					? getComputedStyle(previewCard.firstElementChild).backdropFilter
					: null,
			};
		});

		assert.ok(
			overlap.overlapWidth > 0 && overlap.overlapHeight > 0,
			`Expected the seeded dropdown to overlap the preview card, got ${JSON.stringify(overlap, null, 2)}`
		);
		assert.equal(
			overlap.topInsideDropdown,
			true,
			`Version-history dropdown is rendering underneath the preview pane.\n${JSON.stringify(overlap, null, 2)}`
		);
	} finally {
		await browser.close();
		await cleanupTool(tool.id);
	}
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
