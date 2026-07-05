import { expect, test } from "vitest";

import { createNsJiti } from "../../src/runtime/module-loader.ts";

// This intentionally proves real workspace/package import compatibility through Jiti.
// Keep this smoke in the integration lane; default tests should cover local alias logic directly.
test("repo-local migration extensions can import internal migration subpaths", async () => {
	const jiti = createNsJiti();

	const pendingWorktreeModule = await jiti.import<
		typeof import("@ns/capability-kit/pending-worktree")
	>("@ns/capability-kit/pending-worktree");
	expect(typeof pendingWorktreeModule.loadPendingWorktreeSnapshot).toBe("function");
	expect(typeof pendingWorktreeModule.formatPendingWorktreeCommandDetails).toBe("function");

	const checkpointFlowModule = await jiti.import<
		typeof import("@ns/capability-kit/checkpoint-flow")
	>("@ns/capability-kit/checkpoint-flow");
	expect(typeof checkpointFlowModule.prepareCheckpointMessage).toBe("function");
	expect(typeof checkpointFlowModule.buildCheckpointUserPrompt).toBe("function");
	expect(typeof checkpointFlowModule.createCommitWithPreparedMessage).toBe("function");

	const textGenerationModule = await jiti.import<
		typeof import("@ns/capability-kit/text-generation")
	>("@ns/capability-kit/text-generation");
	expect(textGenerationModule.CHECKPOINT_MODEL_ENV).toBe("NS_CHECKPOINT_MODEL");
	expect(textGenerationModule.CHANGES_MODEL_ENV).toBe("NS_CHANGES_MODEL");
	expect(typeof textGenerationModule.DEFAULT_CHANGES_MODEL_REF).toBe("string");
	expect(typeof textGenerationModule.selectCheckpointModelRef).toBe("function");
	expect(typeof textGenerationModule.selectChangesModelRef).toBe("function");

	const coreModelSlugModule =
		await jiti.import<typeof import("@ns/core/model-slug")>("@ns/core/model-slug");
	expect(typeof coreModelSlugModule.parseModelRef).toBe("function");

	const modelSlugModule = await jiti.import<{ deriveSlugWithModel: unknown }>(
		"@ns/capability-kit/model-slug",
	);
	expect(typeof modelSlugModule.deriveSlugWithModel).toBe("function");

	const addressDownloadFeedbackModule = await jiti.import<{
		default: { commands?: readonly { name: string }[] };
	}>("@ns/address/ns/commands/exec-download-feedback");
	expect(addressDownloadFeedbackModule.default.commands?.map((command) => command.name)).toEqual([
		"exec-download-feedback",
	]);

	const aretroCollectEvidenceModule = await jiti.import<{
		aretroExecCollectEvidenceNsCommand: { name: string };
	}>("@ns/aretro/ns/commands/exec-collect-evidence");
	expect(aretroCollectEvidenceModule.aretroExecCollectEvidenceNsCommand.name).toBe(
		"exec-collect-evidence",
	);

	const branchContextFromPlanModule = await jiti.import<{
		default: { commands?: readonly { name: string }[] };
	}>("@ns/branch-context/ns/commands/from-plan");
	expect(branchContextFromPlanModule.default.commands?.map((command) => command.name)).toEqual([
		"from-plan",
	]);

	const handoffListModule = await jiti.import<{
		handoffListNsCommand: { name: string };
	}>("@ns/handoff/ns/commands/list");
	expect(handoffListModule.handoffListNsCommand.name).toBe("list");

	const objectiveListModule = await jiti.import<{
		objectiveListNsCommand: { name: string };
	}>("@ns/objective/ns/commands/list");
	expect(objectiveListModule.objectiveListNsCommand.name).toBe("list");

	// jiti tripwire: this command's module graph includes the real Pi
	// child-session adapter and must load without pulling the optional
	// @ns/pi peer (the adapter spawns the pi binary; it imports no Pi code).
	const objectiveRunnerStepModule = await jiti.import<{
		default: { commands?: readonly { name: string }[] };
	}>("@ns/objective/ns/commands/exec-runner-step");
	expect(objectiveRunnerStepModule.default.commands?.map((command) => command.name)).toEqual([
		"exec-runner-step",
	]);
}, 30_000);
