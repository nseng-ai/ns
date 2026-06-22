import { expect, test } from "vitest";

import { createSdlJiti } from "../../src/sdk-module-loader.ts";

function sortedKeys(value: object): string[] {
	return Object.keys(value).sort();
}

test("virtual SDK module mirrors sdk.ts runtime value exports", async () => {
	const sdkModule = await import("../../src/sdk.ts");
	const virtualModule = await createSdlJiti().import<typeof sdkModule>("@sdl/sdl/sdk");
	const sdkKeys = sortedKeys(sdkModule);

	expect(sortedKeys(virtualModule)).toEqual(sdkKeys);
	for (const key of sdkKeys) {
		const sdkKey = key as keyof typeof sdkModule;
		expect(virtualModule[sdkKey]).toBe(sdkModule[sdkKey]);
	}
});

test("SDL jiti resolves internal migration package exports", async () => {
	const checkpointFlowModule = await createSdlJiti().import<
		typeof import("../../src/checkpoint-flow.ts")
	>("@sdl/sdl/checkpoint-flow");
	const changesModelSummaryModule = await createSdlJiti().import<
		typeof import("../../src/changes-model-summary.ts")
	>("@sdl/sdl/changes-model-summary");
	const prDescriptionModule =
		await createSdlJiti().import<typeof import("../../src/pr-description.ts")>(
			"@sdl/sdl/pr-description",
		);
	const textGenerationModule = await createSdlJiti().import<
		typeof import("../../src/text-generation.ts")
	>("@sdl/sdl/text-generation");

	expect(typeof checkpointFlowModule.prepareCheckpointMessage).toBe("function");
	expect(typeof checkpointFlowModule.buildCheckpointUserPrompt).toBe("function");
	expect(typeof changesModelSummaryModule.draftChangesSummary).toBe("function");
	expect(typeof prDescriptionModule.preparePrDescription).toBe("function");
	expect(typeof textGenerationModule.DEFAULT_CHANGES_MODEL_REF).toBe("string");
});
