import { expect, test } from "vitest";

import { createSdlJiti } from "../../src/sdk/module-loader.ts";

// This intentionally proves real workspace/package import compatibility through Jiti.
// Keep this smoke in the integration lane; default tests should cover local alias logic directly.
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

	const addressDownloadFeedbackModule = await jiti.import<{
		default: { commands?: readonly { name: string }[] };
	}>("@sdl/address/sdl/commands/exec-download-feedback");
	expect(addressDownloadFeedbackModule.default.commands?.map((command) => command.name)).toEqual([
		"exec-download-feedback",
	]);

	const aretroCollectEvidenceModule = await jiti.import<{
		aretroExecCollectEvidenceSdlCommand: { name: string };
	}>("@sdl/aretro/sdl/commands/exec-collect-evidence");
	expect(aretroCollectEvidenceModule.aretroExecCollectEvidenceSdlCommand.name).toBe(
		"exec-collect-evidence",
	);

	const branchContextFromPlanModule = await jiti.import<{
		default: { commands?: readonly { name: string }[] };
	}>("@sdl/branch-context/sdl/commands/from-plan");
	expect(branchContextFromPlanModule.default.commands?.map((command) => command.name)).toEqual([
		"from-plan",
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
