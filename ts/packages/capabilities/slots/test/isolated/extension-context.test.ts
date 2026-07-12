import { type Caps, type RenderCapabilities } from "@nseng-ai/clinkr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NsCommand, NsCommandSchema, NsExtensionApi } from "@nseng-ai/sdk/sdk";
import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/sdk/sdk";

const createRealSlotContext = vi.fn(async (options: unknown) => ({
	__contextOptions: options,
	repo: { type: "repo", mainRepoRoot: "/repo", repoName: "repo" },
	git: {
		listBranchOccupancies: async () => [],
		listWorktrees: async () => [],
	},
}));

vi.mock("../../src/core/context.ts", () => ({
	createRealSlotContext,
}));

const { loadSlotNsCommand } = await import("../../src/ns/slot-ns-command.ts");

const colorCaps: Caps = {
	isTty: true,
	colorDepth: "truecolor",
	columns: 80,
	canRenderUnicode: true,
};

describe("slot ns extension context", () => {
	beforeEach(() => {
		createRealSlotContext.mockClear();
	});

	it("passes host render capabilities explicitly so interactive previews can reuse terminal colors", async () => {
		const renderCapabilities: RenderCapabilities = { canEmitAnsi: true, caps: colorCaps };
		const command = loadSlotNsCommand("list") as NsCommand<NsCommandSchema, unknown>;
		await command.run(extensionApi({ renderCapabilities }), { argv: [] });

		expect(createRealSlotContext).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: "/repo",
				env: { PATH: "/fake/bin" },
				renderCapabilities,
			}),
		);
	});
});

function extensionApi(options: { renderCapabilities: RenderCapabilities }): NsExtensionApi {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		exec: async () => ({
			type: "exited",
			stdout: "",
			stderr: "",
			code: 0,
			signal: null,
		}),
		textGenerator: { generateText: async () => ({ ok: true, text: "" }) },
		commandIo: noopNsCommandIo,
		progress: noopNsProgress,
		renderCapabilities: options.renderCapabilities,
		stdout: () => {},
		stderr: () => {},
	};
}
