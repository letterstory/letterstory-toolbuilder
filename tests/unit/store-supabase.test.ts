import { beforeEach, describe, expect, it, vi } from "vitest";

type ToolRow = {
	id: string;
	project_name: string;
	prompt: string;
	site_url: string | null;
	brand_snapshot: null;
	html: string;
	copy: { headline: string; supportingCopy: string } | null;
	brand_fidelity: null;
	visual_congruence: null;
	model: string;
	warnings: string[];
	created_at: string;
	updated_at: string;
	version: number;
	history: Array<{
		version: number;
		createdAt: string;
		projectName: string;
		prompt: string;
		siteUrl: string | null;
		brandSnapshot: null;
		html: string;
		copy: { headline: string; supportingCopy: string } | null;
		brandFidelity: null;
		visualCongruence: null;
		model: string;
		warnings: string[];
	}>;
};

const rows = vi.hoisted(() => new Map<string, ToolRow>());

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

const getSupabaseClientMock = vi.hoisted(() =>
	vi.fn(() => ({
		from: () => {
			let filters: Record<string, unknown> = {};
			let updatePayload: Partial<ToolRow> | null = null;

			const builder = {
				select() {
					return builder;
				},
				update(payload: Partial<ToolRow>) {
					updatePayload = payload;
					return builder;
				},
				eq(field: string, value: unknown) {
					filters = { ...filters, [field]: value };
					return builder;
				},
				async maybeSingle() {
					const row = [...rows.values()].find(
						(candidate) =>
							Object.entries(filters).every(([field, value]) => candidate[field as keyof ToolRow] === value)
					);
					return { data: row ? clone(row) : null, error: null };
				},
				async single() {
					const id = String(filters.id ?? "");
					const row = rows.get(id);
					if (!row || !updatePayload) {
						return { data: null, error: { message: "not found" } };
					}
					const nextRow = { ...row, ...clone(updatePayload) };
					rows.set(id, nextRow);
					return { data: clone(nextRow), error: null };
				},
			};

			return builder;
		},
	}))
);

vi.mock("@/lib/config/supabase", () => ({
	getSupabaseClient: getSupabaseClientMock,
}));

describe("supabaseToolStore", () => {
	beforeEach(() => {
		vi.resetModules();
		rows.clear();
		getSupabaseClientMock.mockClear();
		rows.set("tool-123", {
			id: "tool-123",
			project_name: "Calc",
			prompt: "v3",
			site_url: null,
			brand_snapshot: null,
			html: "<!doctype html><html><body>v3</body></html>",
			copy: { headline: "V3", supportingCopy: "Third version." },
			brand_fidelity: null,
			visual_congruence: null,
			model: "claude-sonnet-4-6",
			warnings: ["third"],
			created_at: "2024-01-01T00:00:00.000Z",
			updated_at: "2024-01-03T00:00:00.000Z",
			version: 3,
			history: [
				{
					version: 2,
					createdAt: "2024-01-02T00:00:00.000Z",
					projectName: "Calc",
					prompt: "v2",
					siteUrl: null,
					brandSnapshot: null,
					html: "<!doctype html><html><body>v2</body></html>",
					copy: { headline: "V2", supportingCopy: "Second version." },
					brandFidelity: null,
					visualCongruence: null,
					model: "claude-sonnet-4-6",
					warnings: ["second"],
				},
				{
					version: 1,
					createdAt: "2024-01-01T00:00:00.000Z",
					projectName: "Calc",
					prompt: "v1",
					siteUrl: null,
					brandSnapshot: null,
					html: "<!doctype html><html><body>v1</body></html>",
					copy: { headline: "V1", supportingCopy: "First version." },
					brandFidelity: null,
					visualCongruence: null,
					model: "claude-sonnet-4-6",
					warnings: [],
				},
			],
		});
	});

	it("does not create a brand-new forward version when rolling back", async () => {
		const { supabaseToolStore } = await import("../../src/lib/generation/store.supabase");

		const rolledBack = await supabaseToolStore.rollbackGeneratedTool("tool-123", 1);

		expect(rolledBack).toMatchObject({
			id: "tool-123",
			version: 1,
			prompt: "v1",
			html: "<!doctype html><html><body>v1</body></html>",
			copy: { headline: "V1", supportingCopy: "First version." },
		});
		expect(rolledBack?.history.map((entry) => entry.version)).not.toContain(4);
	});
});
