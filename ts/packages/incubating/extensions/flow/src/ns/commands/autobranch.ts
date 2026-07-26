import type { ParsedAutobranchArgs } from "../../autobranch/dirty-worktree.ts";
import { dispatchAutobranchCheckpoint } from "../../autobranch/checkpoint-flow.ts";
import { renderResultBlock } from "@nseng-ai/foundation/cli-theme";
import { runWithNsCommandIo } from "@nseng-ai/sdk/command-io";
import { commandIoFromNsExtensionApi } from "@nseng-ai/sdk/command-io";
import { defineCommand, failure, negative, ok, z, type NsCommand } from "@nseng-ai/sdk";

import { renderAutobranchFailureResultBlock } from "../presentation/autobranch-result-block.ts";
import { prepareFlowCheckpointMessage } from "../model-generation.ts";
import { MODEL_OPERATION_IDS } from "@nseng-ai/extension-kit/model-policy";
import { resolveFlowModelSelection } from "../model-policy.ts";
import { renderPendingWorktreeFailure } from "../presentation/pending-worktree-result.ts";
import { resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";
import { FLOW_COMMAND_FAILED } from "../flow-cli-runner.ts";
import {
	createAutobranchDispatchEnv,
	createCommitWithPreparedMessage,
	type PendingWorktreeSnapshot,
} from "../worktree.ts";

const AUTOBRANCH_DESCRIPTION = `Create a Graphite branch using \`gt create\` from dirty worktree changes.

This command requires pending worktree changes. It stashes pending changes, creates a Graphite branch, restores the stash, and creates a checkpoint commit.

If the worktree is clean, use \`ns flow branch-latest-commit\` to move the latest eligible commit to a new Graphite child branch.

`;

const autobranchRequestSchema = z.object({
	slug: z
		.string()
		.optional()
		.describe("Branch slug to use instead of deriving one from the worktree."),
});

type AutobranchRequest = z.output<typeof autobranchRequestSchema>;

export const flowAutobranchCommand: NsCommand<typeof autobranchRequestSchema> = defineCommand({
	name: "autobranch",
	summary: "Create a Graphite branch from dirty worktree changes.",
	description: AUTOBRANCH_DESCRIPTION,
	schema: autobranchRequestSchema,
	resultSchema: z.string(),
	options: { slug: { short: "-s" } },
	handler: async (ctx, request: AutobranchRequest) => {
		const caps = resolveFlowStreamCaps(ctx);
		const args: ParsedAutobranchArgs = request.slug === undefined ? {} : { slug: request.slug };
		const slugModel = await resolveFlowModelSelection(ctx, MODEL_OPERATION_IDS.slug);
		if (!slugModel.ok) return failure(FLOW_COMMAND_FAILED, slugModel.error);
		const checkpointModel = await resolveFlowModelSelection(
			ctx,
			MODEL_OPERATION_IDS.flowCheckpoint,
		);
		if (!checkpointModel.ok) return failure(FLOW_COMMAND_FAILED, checkpointModel.error);
		const io = commandIoFromNsExtensionApi(ctx);
		return await runWithNsCommandIo(io, async (io) => {
			const result = await dispatchAutobranchCheckpoint(
				{
					mode: "require-dirty",
					dirty: {
						prepareCheckpointMessage: (
							pendingSnapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
						) =>
							prepareFlowCheckpointMessage(
								{ ...ctx, modelSelection: checkpointModel.modelSelection },
								pendingSnapshot,
							),
						commitPreparedCheckpointMessage: (message) =>
							createCommitWithPreparedMessage(ctx, message),
					},
				},
				{
					...createAutobranchDispatchEnv(ctx, args, slugModel.modelSelection),
					onPhase: (message) => io.phase(message),
				},
			);

			switch (result.outcome) {
				case "pending-worktree":
					return negative(
						renderPendingWorktreeFailure(caps, {
							error: result.error,
							cwd: ctx.cwd,
							commandLabel: "`ns flow autobranch`",
						}),
					);
				case "refused-clean":
					// A clean worktree is a declined guardrail (warn refusal, house-style §7.3), not a failure;
					// point the user at the command that handles a clean worktree.
					return negative(
						renderResultBlock(caps, {
							kind: "refusal",
							headline: "`ns flow autobranch` requires pending worktree changes and did not run.",
							cwd: result.snapshot.root,
							body: "Working tree is clean.",
							guidance:
								"Use `ns flow branch-latest-commit` to move the latest eligible commit to a new Graphite child branch.",
						}),
					);
				case "flow": {
					const flow = result.flow;
					if (flow.ok) {
						for (const warning of flow.warnings) {
							ctx.stderr?.(`${warning.trimEnd()}\n`);
						}
						return ok(
							renderResultBlock(caps, {
								kind: "success",
								headline: "Created a Graphite branch from dirty worktree changes.",
								cwd: result.snapshot.root,
								body: flow.summary.trimEnd(),
							}),
						);
					}
					return negative(
						renderAutobranchFailureResultBlock({
							caps,
							outcome: flow.outcome,
							cwd: result.snapshot.root,
							error: flow.error,
							refusalHeadline: "Did not create a Graphite branch from dirty worktree changes.",
							failureHeadline: "Could not create a Graphite branch from dirty worktree changes.",
						}),
					);
				}
			}
		});
	},
});

export default flowAutobranchCommand;
