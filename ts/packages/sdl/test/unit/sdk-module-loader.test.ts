import { expect, test } from "vitest";

import { createSdlJiti } from "../../src/sdk/module-loader.ts";

function sortedKeys(value: object): string[] {
	return Object.keys(value).sort();
}

test("virtual SDK module mirrors SDK runtime value exports", async () => {
	const sdkModule = await import("../../src/sdk/index.ts");
	const virtualModule = await createSdlJiti().import<typeof sdkModule>("@sdl/sdl/sdk");
	const sdkKeys = sortedKeys(sdkModule);

	expect(sortedKeys(virtualModule)).toEqual(sdkKeys);
	for (const key of sdkKeys) {
		const sdkKey = key as keyof typeof sdkModule;
		expect(virtualModule[sdkKey]).toBe(sdkModule[sdkKey]);
	}
});

test("repo-local migration extensions can import internal migration subpaths", async () => {
	const jiti = createSdlJiti();

	const pendingWorktreeModule = await jiti.import<typeof import("../../src/pending-worktree.ts")>(
		"@sdl/sdl/pending-worktree",
	);
	expect(typeof pendingWorktreeModule.loadPendingWorktreeSnapshot).toBe("function");
	expect(typeof pendingWorktreeModule.formatPendingWorktreeCommandDetails).toBe("function");

	const checkpointFlowModule = await jiti.import<typeof import("../../src/checkpoint-flow.ts")>(
		"@sdl/sdl/checkpoint-flow",
	);
	expect(typeof checkpointFlowModule.prepareCheckpointMessage).toBe("function");
	expect(typeof checkpointFlowModule.buildCheckpointUserPrompt).toBe("function");
	expect(typeof checkpointFlowModule.createCommitWithPreparedMessage).toBe("function");

	const changesModelSummaryModule = await jiti.import<
		typeof import("../../src/changes-model-summary.ts")
	>("@sdl/sdl/changes-model-summary");
	expect(typeof changesModelSummaryModule.draftChangesSummary).toBe("function");

	const prDescriptionModule =
		await jiti.import<typeof import("../../src/pr-description.ts")>("@sdl/sdl/pr-description");
	expect(typeof prDescriptionModule.preparePrDescription).toBe("function");
	expect(typeof prDescriptionModule.prepareRegeneratedPrDescriptionForCurrentBranch).toBe(
		"function",
	);

	const submitModule = await jiti.import<typeof import("../../src/submit.ts")>("@sdl/sdl/submit");
	expect(typeof submitModule.createSdlSubmitRuntime).toBe("function");
	expect(typeof submitModule.runSubmitCommand).toBe("function");

	const textGenerationModule = await jiti.import<typeof import("../../src/sdk/text-generation.ts")>(
		"@sdl/sdl/text-generation",
	);
	expect(textGenerationModule.CHECKPOINT_MODEL_ENV).toBe("SDL_CHECKPOINT_MODEL");
	expect(textGenerationModule.CHANGES_MODEL_ENV).toBe("SDL_CHANGES_MODEL");
	expect(typeof textGenerationModule.DEFAULT_CHANGES_MODEL_REF).toBe("string");
	expect(typeof textGenerationModule.selectCheckpointModelRef).toBe("function");
	expect(typeof textGenerationModule.selectChangesModelRef).toBe("function");
});
