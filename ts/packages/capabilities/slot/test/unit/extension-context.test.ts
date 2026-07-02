import { ok, type Caps, type RenderCapabilities } from "@sdl/clinkr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SdlCommand, SdlCommandSchema, SdlExtensionApi } from "@sdl/kernel/sdk";
import { noopSdlCommandIo, noopSdlProgress } from "@sdl/kernel/sdk";

const createRealSlotContext = vi.fn(async (options: unknown) => ({ __contextOptions: options }));

vi.mock("../../src/core/context.ts", () => ({
	createRealSlotContext,
}));

vi.mock("../../src/operations/list.ts", async (importActual) => {
	const actual = await importActual<typeof import("../../src/operations/list.ts")>();
	return {
		...actual,
		runList: vi.fn(() => ok({ slots: [] })),
	};
});

const slotExtension = (await import("../../src/core/extension.ts")).default;

const colorCaps: Caps = {
	isTty: true,
	colorDepth: "truecolor",
	columns: 80,
	canRenderUnicode: true,
};

describe("slot SDL extension context", () => {
	beforeEach(() => {
		createRealSlotContext.mockClear();
	});

	it("passes host render capabilities explicitly so interactive previews can reuse terminal colors", async () => {
		const renderCapabilities: RenderCapabilities = { canEmitAnsi: true, caps: colorCaps };
		const command = slotExtension.commands?.find(
			(candidate): candidate is SdlCommand<SdlCommandSchema, unknown> => candidate.name === "list",
		);
		expect(command).toBeDefined();
		if (command === undefined) throw new Error("missing list command");
		if (command.schema === undefined) throw new Error("missing list command schema");

		await command.run(extensionApi({ renderCapabilities }), command.schema.parse({}));

		expect(createRealSlotContext).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: "/repo",
				env: { PATH: "/fake/bin" },
				renderCapabilities,
			}),
		);
	});
});

function extensionApi(options: { renderCapabilities: RenderCapabilities }): SdlExtensionApi {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false }),
		textGenerator: { generateText: async () => ({ ok: true, text: "" }) },
		commandIo: noopSdlCommandIo,
		progress: noopSdlProgress,
		renderCapabilities: options.renderCapabilities,
		stdout: () => {},
		stderr: () => {},
	};
}
