import { beforeEach, describe, expect, it, vi } from "vitest";

const mkdirMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const readdirMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());
const randomUuidMock = vi.hoisted(() => vi.fn(() => "tool-123"));

vi.mock("node:fs/promises", () => ({
	mkdir: mkdirMock,
	readFile: readFileMock,
	readdir: readdirMock,
	writeFile: writeFileMock,
}));

vi.mock("node:crypto", () => ({
	randomUUID: randomUuidMock,
}));

describe("fileToolStore", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		mkdirMock.mockReset();
		readFileMock.mockReset();
		readdirMock.mockReset();
		writeFileMock.mockReset();
		randomUuidMock.mockClear();
	});

	it("falls back to in-memory storage when the filesystem is not writable", async () => {
		mkdirMock.mockRejectedValue(Object.assign(new Error("permission denied"), { code: "EACCES" }));

		const { fileToolStore } = await import("../../src/lib/generation/store.file");
		const saved = await fileToolStore.saveGeneratedTool({
			projectName: "Calc",
			prompt: "BMI calculator",
			siteUrl: null,
			brandSnapshot: null,
			html: "<!doctype html><html><body>hi</body></html>",
			copy: null,
			brandFidelity: null,
			model: "claude-sonnet-4-6",
			warnings: [],
		});

		expect(saved.id).toBe("tool-123");
		expect(writeFileMock).not.toHaveBeenCalled();
		await expect(fileToolStore.getGeneratedTool("tool-123")).resolves.toMatchObject({
			id: "tool-123",
			projectName: "Calc",
		});
		await expect(fileToolStore.listGeneratedTools()).resolves.toHaveLength(1);
	});

	it("updates history correctly while running in in-memory fallback mode", async () => {
		mkdirMock.mockRejectedValue(Object.assign(new Error("read only file system"), { code: "EROFS" }));

		const { fileToolStore } = await import("../../src/lib/generation/store.file");
		await fileToolStore.saveGeneratedTool({
			projectName: "Calc",
			prompt: "v1",
			siteUrl: null,
			brandSnapshot: null,
			html: "<!doctype html><html><body>v1</body></html>",
			copy: null,
			brandFidelity: null,
			model: "claude-sonnet-4-6",
			warnings: [],
		});

		const updated = await fileToolStore.updateGeneratedTool("tool-123", {
			projectName: "Calc",
			prompt: "v2",
			siteUrl: null,
			brandSnapshot: null,
			html: "<!doctype html><html><body>v2</body></html>",
			copy: null,
			brandFidelity: null,
			model: "claude-sonnet-4-6",
			warnings: [],
		});

		expect(updated).toMatchObject({
			id: "tool-123",
			version: 2,
			history: [expect.objectContaining({ version: 1, prompt: "v1" })],
		});
	});
});
