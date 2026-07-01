import { expect, test } from "vitest";

import { createSdlJiti, resolveCommandExportTarget } from "../../src/sdk/module-loader.ts";

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

test("command export targets prefer import conditions over default conditions", () => {
	expect(
		resolveCommandExportTarget({
			packageName: "@sdl/example",
			subpath: "./commands/run",
			target: { import: "./src/run.ts", default: "./dist/run.js" },
		}),
	).toBe("./src/run.ts");
});

test("command export targets fall back to default conditions", () => {
	expect(
		resolveCommandExportTarget({
			packageName: "@sdl/example",
			subpath: "./commands/run",
			target: { default: "./dist/run.js" },
		}),
	).toBe("./dist/run.js");
});

test("invalid command export targets name the package and subpath", () => {
	expect(() =>
		resolveCommandExportTarget({
			packageName: "@sdl/example",
			subpath: "./commands/run",
			target: { require: "./dist/run.cjs" },
		}),
	).toThrow(/@sdl\/example package\.json export for \.\/commands\/run/);
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

	const coreModelSlugModule =
		await jiti.import<typeof import("@sdl/core/model-slug")>("@sdl/core/model-slug");
	expect(typeof coreModelSlugModule.parseModelRef).toBe("function");

	const modelSlugModule = await jiti.import<{ deriveSlugWithModel: unknown }>(
		"@sdl/capability-kit/model-slug",
	);
	expect(typeof modelSlugModule.deriveSlugWithModel).toBe("function");

	const aretroCollectEvidenceModule = await jiti.import<{
		aretroExecCollectEvidenceSdlCommand: { name: string };
	}>("@sdl/aretro/sdl/commands/exec-collect-evidence");
	expect(aretroCollectEvidenceModule.aretroExecCollectEvidenceSdlCommand.name).toBe(
		"exec-collect-evidence",
	);

	const branchContextExtensionModule = await jiti.import<
		typeof import("@sdl/branch-context/extension")
	>("@sdl/branch-context/extension");
	const branchContextCommands = branchContextExtensionModule.default.commands;
	if (branchContextCommands === undefined) {
		throw new Error("Expected branch-context extension to define commands.");
	}
	expect(branchContextCommands.map((command) => command.name)).toEqual([
		"from-plan",
		"load",
		"attach",
		"list",
		"check",
		"delete",
	]);

	const handoffListModule = await jiti.import<{
		handoffListSdlCommand: { name: string };
	}>("@sdl/handoff/sdl/commands/list");
	expect(handoffListModule.handoffListSdlCommand.name).toBe("list");

	const objectiveListModule = await jiti.import<{
		objectiveListSdlCommand: { name: string };
	}>("@sdl/objective/sdl/commands/list");
	expect(objectiveListModule.objectiveListSdlCommand.name).toBe("list");
});
