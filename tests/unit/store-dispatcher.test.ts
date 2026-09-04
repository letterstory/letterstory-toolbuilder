import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fileSave = vi.hoisted(() => vi.fn());
const fileGet = vi.hoisted(() => vi.fn());
const fileUpdate = vi.hoisted(() => vi.fn());
const fileRollback = vi.hoisted(() => vi.fn());
const fileList = vi.hoisted(() => vi.fn());

const supabaseSave = vi.hoisted(() => vi.fn());
const supabaseGet = vi.hoisted(() => vi.fn());
const supabaseUpdate = vi.hoisted(() => vi.fn());
const supabaseRollback = vi.hoisted(() => vi.fn());
const supabaseList = vi.hoisted(() => vi.fn());

vi.mock("@/lib/generation/store.file", () => ({
	fileToolStore: {
		saveGeneratedTool: fileSave,
		getGeneratedTool: fileGet,
		updateGeneratedTool: fileUpdate,
		rollbackGeneratedTool: fileRollback,
		listGeneratedTools: fileList,
	},
}));

vi.mock("@/lib/generation/store.supabase", () => ({
	supabaseToolStore: {
		saveGeneratedTool: supabaseSave,
		getGeneratedTool: supabaseGet,
		updateGeneratedTool: supabaseUpdate,
		rollbackGeneratedTool: supabaseRollback,
		listGeneratedTools: supabaseList,
	},
}));

describe("generation/store dispatcher", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.SUPABASE_URL;
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;
	});

	afterEach(() => {
		delete process.env.SUPABASE_URL;
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;
	});

	it("dispatches to the file backend when Supabase is not configured", async () => {
		const store = await import("@/lib/generation/store");
		expect(store.isToolStoreDurable()).toBe(false);

		await store.getGeneratedTool("tool-1");
		await store.listGeneratedTools();

		expect(fileGet).toHaveBeenCalledWith("tool-1");
		expect(fileList).toHaveBeenCalled();
		expect(supabaseGet).not.toHaveBeenCalled();
		expect(supabaseList).not.toHaveBeenCalled();
	});

	it("dispatches to the Supabase backend when SUPABASE_URL and key are set", async () => {
		process.env.SUPABASE_URL = "https://example.supabase.co";
		process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

		const store = await import("@/lib/generation/store");
		expect(store.isToolStoreDurable()).toBe(true);

		await store.getGeneratedTool("tool-2");

		expect(supabaseGet).toHaveBeenCalledWith("tool-2");
		expect(fileGet).not.toHaveBeenCalled();
	});

	it("re-selects the backend per call, without needing to re-import the module", async () => {
		const store = await import("@/lib/generation/store");

		await store.getGeneratedTool("tool-a");
		expect(fileGet).toHaveBeenCalledWith("tool-a");
		expect(supabaseGet).not.toHaveBeenCalled();

		process.env.SUPABASE_URL = "https://example.supabase.co";
		process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

		await store.getGeneratedTool("tool-b");
		expect(supabaseGet).toHaveBeenCalledWith("tool-b");
	});
});
