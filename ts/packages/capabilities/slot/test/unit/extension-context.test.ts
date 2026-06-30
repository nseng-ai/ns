import { CLINKR_CAPS_EXTENSION_KEY, ok, type Caps } from "@sdl/clinkr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SdlCommand, SdlCommandSchema, SdlExtensionApi } from "sdl-sdk";
import { noopSdlCommandIo, noopSdlProgress } from "sdl-sdk";

const createRealSlotContext = vi.fn(async (options: unknown) => ({ __contextOptions: options }));

vi.mock("../../src/context.ts", () => ({
	createRealSlotContext,
}));

vi.mock("../../src/operations/list.ts", async (importActual) => {
	const actual = await importActual<typeof import("../../src/operations/list.ts")>();
	return {
		...actual,
		runList: vi.fn(() => ok({ slots: [] })),
	};
});

const slotExtension = (await import("../../src/extension.ts")).default;

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

	it("forwards host extensions so interactive previews can reuse terminal colors", async () => {
		const extensions = { [CLINKR_CAPS_EXTENSION_KEY]: colorCaps };
		const command = slotExtension.commands?.find(
			(candidate): candidate is SdlCommand<SdlCommandSchema, unknown> => candidate.name === "list",
		);
		expect(command).toBeDefined();
		if (command === undefined) throw new Error("missing list command");
		if (command.schema === undefined) throw new Error("missing list command schema");

		await command.run(extensionApi({ extensions }), command.schema.parse({}));

		expect(createRealSlotContext).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: "/repo",
				env: { PATH: "/fake/bin" },
				extensions,
			}),
		);
	});
});

function extensionApi(options: { extensions: Readonly<Record<string, unknown>> }): SdlExtensionApi {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false }),
		textGenerator: { generateText: async () => ({ ok: true, text: "" }) },
		commandIo: noopSdlCommandIo,
		progress: noopSdlProgress,
		stdout: () => {},
		stderr: () => {},
		extensions: options.extensions,
	};
}
