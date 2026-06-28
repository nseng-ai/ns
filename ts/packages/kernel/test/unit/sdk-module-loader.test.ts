import { expect, test } from "vitest";

import { createSdlJiti } from "../../src/sdk/module-loader.ts";

function sortedKeys(value: object): string[] {
	return Object.keys(value).sort();
}

test("virtual SDK module mirrors SDK runtime value exports", async () => {
	const sdkModule = await import("sdl-sdk");
	const virtualModule = await createSdlJiti().import<typeof sdkModule>("sdl-sdk");
	const sdkKeys = sortedKeys(sdkModule);

	expect(sortedKeys(virtualModule)).toEqual(sdkKeys);
	for (const key of sdkKeys) {
		const sdkKey = key as keyof typeof sdkModule;
		expect(virtualModule[sdkKey]).toBe(sdkModule[sdkKey]);
	}
});

test("repo-local migration extensions can import internal migration subpaths", async () => {
	const jiti = createSdlJiti();

	const pendingWorktreeModule = await jiti.import<
		typeof import("@sdl/capability-kit/pending-worktree")
	>("@sdl/capability-kit/pending-worktree");
	expect(typeof pendingWorktreeModule.loadPendingWorktreeSnapshot).toBe("function");
	expect(typeof pendingWorktreeModule.formatPendingWorktreeCommandDetails).toBe("function");

	const checkpointFlowModule = await jiti.import<
		typeof import("@sdl/capability-kit/checkpoint-flow")
	>("@sdl/capability-kit/checkpoint-flow");
	expect(typeof checkpointFlowModule.prepareCheckpointMessage).toBe("function");
	expect(typeof checkpointFlowModule.buildCheckpointUserPrompt).toBe("function");
	expect(typeof checkpointFlowModule.createCommitWithPreparedMessage).toBe("function");

	const textGenerationModule = await jiti.import<
		typeof import("@sdl/capability-kit/text-generation")
	>("@sdl/capability-kit/text-generation");
	expect(textGenerationModule.CHECKPOINT_MODEL_ENV).toBe("SDL_CHECKPOINT_MODEL");
	expect(textGenerationModule.CHANGES_MODEL_ENV).toBe("SDL_CHANGES_MODEL");
	expect(typeof textGenerationModule.DEFAULT_CHANGES_MODEL_REF).toBe("string");
	expect(typeof textGenerationModule.selectCheckpointModelRef).toBe("function");
	expect(typeof textGenerationModule.selectChangesModelRef).toBe("function");

	const modelSlugModule =
		await jiti.import<typeof import("@sdl/core/model-slug")>("@sdl/core/model-slug");
	expect(typeof modelSlugModule.deriveSlugWithModel).toBe("function");

	const autobranchModule = await jiti.import<typeof import("@sdl/autobranch/dirty-worktree")>(
		"@sdl/autobranch/dirty-worktree",
	);
	expect(typeof autobranchModule.runDirtyAutobranchFlow).toBe("function");
});
