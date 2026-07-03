import { expect, test } from "vitest";

import { createSdlJiti } from "../../src/runtime/module-loader.ts";

// This intentionally proves real workspace/package import compatibility through Jiti.
// Keep this smoke in the integration lane; default tests should cover local alias logic directly.
test("repo-local migration extensions can import internal migration subpaths", async () => {
	const jiti = createSdlJiti();

	const pendingWorktreeModule = await jiti.import<
		typeof import("@ji/capability-kit/pending-worktree")
	>("@ji/capability-kit/pending-worktree");
	expect(typeof pendingWorktreeModule.loadPendingWorktreeSnapshot).toBe("function");
	expect(typeof pendingWorktreeModule.formatPendingWorktreeCommandDetails).toBe("function");

	const checkpointFlowModule = await jiti.import<
		typeof import("@ji/capability-kit/checkpoint-flow")
	>("@ji/capability-kit/checkpoint-flow");
	expect(typeof checkpointFlowModule.prepareCheckpointMessage).toBe("function");
	expect(typeof checkpointFlowModule.buildCheckpointUserPrompt).toBe("function");
	expect(typeof checkpointFlowModule.createCommitWithPreparedMessage).toBe("function");

	const textGenerationModule = await jiti.import<
		typeof import("@ji/capability-kit/text-generation")
	>("@ji/capability-kit/text-generation");
	expect(textGenerationModule.CHECKPOINT_MODEL_ENV).toBe("NS_CHECKPOINT_MODEL");
	expect(textGenerationModule.CHANGES_MODEL_ENV).toBe("NS_CHANGES_MODEL");
	expect(typeof textGenerationModule.DEFAULT_CHANGES_MODEL_REF).toBe("string");
	expect(typeof textGenerationModule.selectCheckpointModelRef).toBe("function");
	expect(typeof textGenerationModule.selectChangesModelRef).toBe("function");

	const coreModelSlugModule =
		await jiti.import<typeof import("@ji/core/model-slug")>("@ji/core/model-slug");
	expect(typeof coreModelSlugModule.parseModelRef).toBe("function");

	const modelSlugModule = await jiti.import<{ deriveSlugWithModel: unknown }>(
		"@ji/capability-kit/model-slug",
	);
	expect(typeof modelSlugModule.deriveSlugWithModel).toBe("function");

	const addressDownloadFeedbackModule = await jiti.import<{
		default: { commands?: readonly { name: string }[] };
	}>("@ji/address/ji/commands/exec-download-feedback");
	expect(addressDownloadFeedbackModule.default.commands?.map((command) => command.name)).toEqual([
		"exec-download-feedback",
	]);

	const aretroCollectEvidenceModule = await jiti.import<{
		aretroExecCollectEvidenceSdlCommand: { name: string };
	}>("@ji/aretro/ji/commands/exec-collect-evidence");
	expect(aretroCollectEvidenceModule.aretroExecCollectEvidenceSdlCommand.name).toBe(
		"exec-collect-evidence",
	);

	const branchContextFromPlanModule = await jiti.import<{
		default: { commands?: readonly { name: string }[] };
	}>("@ji/branch-context/ji/commands/from-plan");
	expect(branchContextFromPlanModule.default.commands?.map((command) => command.name)).toEqual([
		"from-plan",
	]);

	const handoffListModule = await jiti.import<{
		handoffListSdlCommand: { name: string };
	}>("@ji/handoff/ji/commands/list");
	expect(handoffListModule.handoffListSdlCommand.name).toBe("list");

	const objectiveListModule = await jiti.import<{
		objectiveListSdlCommand: { name: string };
	}>("@ji/objective/ji/commands/list");
	expect(objectiveListModule.objectiveListSdlCommand.name).toBe("list");

	// jiti tripwire: this command's module graph includes the real Pi
	// child-session adapter and must load without pulling the optional
	// @ji/pi peer (the adapter spawns the pi binary; it imports no Pi code).
	const objectiveRunnerStepModule = await jiti.import<{
		default: { commands?: readonly { name: string }[] };
	}>("@ji/objective/ji/commands/exec-runner-step");
	expect(objectiveRunnerStepModule.default.commands?.map((command) => command.name)).toEqual([
		"exec-runner-step",
	]);
}, 30_000);
