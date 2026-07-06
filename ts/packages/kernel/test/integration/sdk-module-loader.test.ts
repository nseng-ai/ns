import { expect, test } from "vitest";

import { createNsJiti } from "../../src/runtime/module-loader.ts";

// This intentionally proves real workspace/package import compatibility through Jiti
// without checkout-source aliases. Keep this smoke in the integration lane because it
// loads real workspace package graphs.
test("repo-local extensions can import package subpaths without source aliases", async () => {
	const jiti = createNsJiti();

	const pendingWorktreeModule = await jiti.import<
		typeof import("@nseng-ai/capability-kit/pending-worktree")
	>("@nseng-ai/capability-kit/pending-worktree");
	expect(typeof pendingWorktreeModule.loadPendingWorktreeSnapshot).toBe("function");
	expect(typeof pendingWorktreeModule.formatPendingWorktreeCommandDetails).toBe("function");

	const checkpointFlowModule = await jiti.import<
		typeof import("@nseng-ai/capability-kit/checkpoint-flow")
	>("@nseng-ai/capability-kit/checkpoint-flow");
	expect(typeof checkpointFlowModule.prepareCheckpointMessage).toBe("function");
	expect(typeof checkpointFlowModule.buildCheckpointUserPrompt).toBe("function");
	expect(typeof checkpointFlowModule.createCommitWithPreparedMessage).toBe("function");

	const textGenerationModule = await jiti.import<
		typeof import("@nseng-ai/capability-kit/text-generation")
	>("@nseng-ai/capability-kit/text-generation");
	expect(textGenerationModule.CHECKPOINT_MODEL_ENV).toBe("NS_CHECKPOINT_MODEL");
	expect(textGenerationModule.CHANGES_MODEL_ENV).toBe("NS_CHANGES_MODEL");
	expect(typeof textGenerationModule.DEFAULT_CHANGES_MODEL_REF).toBe("string");
	expect(typeof textGenerationModule.selectCheckpointModelRef).toBe("function");
	expect(typeof textGenerationModule.selectChangesModelRef).toBe("function");

	const coreModelSlugModule = await jiti.import<typeof import("@nseng-ai/foundation/model-slug")>(
		"@nseng-ai/foundation/model-slug",
	);
	expect(typeof coreModelSlugModule.parseModelRef).toBe("function");

	const modelSlugModule = await jiti.import<{ deriveSlugWithModel: unknown }>(
		"@nseng-ai/capability-kit/model-slug",
	);
	expect(typeof modelSlugModule.deriveSlugWithModel).toBe("function");

	const addressDownloadFeedbackModule = await jiti.import<{
		default: { commands?: readonly { name: string }[] };
	}>("@nseng-ai/pr-feedback/ns/commands/exec-download-feedback");
	expect(addressDownloadFeedbackModule.default.commands?.map((command) => command.name)).toEqual([
		"exec-download-feedback",
	]);

	const aretroCollectEvidenceModule = await jiti.import<{
		aretroExecCollectEvidenceNsCommand: { name: string };
	}>("@nseng-ai/retros/ns/commands/exec-collect-evidence");
	expect(aretroCollectEvidenceModule.aretroExecCollectEvidenceNsCommand.name).toBe(
		"exec-collect-evidence",
	);

	const branchContextFromPlanModule = await jiti.import<{
		default: { commands?: readonly { name: string }[] };
	}>("@nseng-ai/branch-context/ns/commands/from-plan");
	expect(branchContextFromPlanModule.default.commands?.map((command) => command.name)).toEqual([
		"from-plan",
	]);

	const handoffListModule = await jiti.import<{
		handoffListNsCommand: { name: string };
	}>("@nseng-ai/handoffs/ns/commands/list");
	expect(handoffListModule.handoffListNsCommand.name).toBe("list");

	const objectiveListModule = await jiti.import<{
		objectiveListNsCommand: { name: string };
	}>("@nseng-ai/objectives/ns/commands/list");
	expect(objectiveListModule.objectiveListNsCommand.name).toBe("list");
}, 30_000);
