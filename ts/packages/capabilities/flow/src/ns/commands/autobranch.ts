import {
	runDirtyAutobranchFlow,
	type ParsedAutobranchArgs,
} from "../../autobranch/dirty-worktree.ts";
import type { AutobranchFlowOutcome } from "../../autobranch/flow-result.ts";
import { renderResultBlock } from "@nseng-ai/foundation/cli-theme";
import { runWithNsCommandIo } from "@nseng-ai/kernel/command-io";
import type { NsCommandIo } from "@nseng-ai/kernel/sdk";
import { DEFAULT_FAST_MODEL_REF, SLUG_MODEL_ENV } from "@nseng-ai/foundation/model-slug";
import { commandIoFromNsExtensionApi } from "@nseng-ai/kernel/command-io";
import {
	defineCommand,
	negative,
	ok,
	z,
	type NsCommand,
	type NsExtensionApi,
} from "@nseng-ai/kernel/sdk";

import { renderAutobranchFailureResultBlock } from "../presentation/autobranch-result-block.ts";
import { prepareFlowCheckpointMessage } from "../model-generation.ts";
import { renderPendingWorktreeFailure } from "../presentation/pending-worktree-result.ts";
import { resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";
import {
	CHECKPOINT_MODEL_ENV,
	DEFAULT_CHECKPOINT_MODEL_REF,
	LEGACY_CHECKPOINT_MODEL_ENV,
} from "@nseng-ai/capability-kit/text-generation";
import {
	createAutobranchExecContext,
	createCommitWithPreparedMessage,
	loadFlowPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
} from "../worktree.ts";

const AUTOBRANCH_DESCRIPTION = `Create a Graphite branch using \`gt create\` from dirty worktree changes.

This command requires pending worktree changes. It stashes pending changes, creates a Graphite branch, restores the stash, and creates a checkpoint commit.

If the worktree is clean, use \`ns flow branch-latest-commit\` to move the latest eligible unpushed commit to a new Graphite child branch.

Environment:
  ${SLUG_MODEL_ENV}  Model reference for generated branch slugs. Defaults to ${DEFAULT_FAST_MODEL_REF}.
  ${CHECKPOINT_MODEL_ENV}  Model reference for generated checkpoint messages. Defaults to ${DEFAULT_CHECKPOINT_MODEL_REF}. Falls back to ${LEGACY_CHECKPOINT_MODEL_ENV} when unset.`;

const autobranchRequestSchema = z.object({
	slug: z
		.string()
		.optional()
		.describe("Branch slug to use instead of deriving one from the worktree."),
});

type AutobranchRequest = z.output<typeof autobranchRequestSchema>;

export interface FlowAutobranchCommandOptions {
	now?: () => number;
}

export function createFlowAutobranchCommand(
	options: FlowAutobranchCommandOptions = {},
): NsCommand<typeof autobranchRequestSchema> {
	return defineCommand({
		name: "autobranch",
		summary: "Create a Graphite branch from dirty worktree changes.",
		description: AUTOBRANCH_DESCRIPTION,
		schema: autobranchRequestSchema,
		resultSchema: z.string(),
		options: { slug: { short: "-s" } },
		handler: async (ctx, request: AutobranchRequest) => {
			const caps = resolveFlowStreamCaps(ctx);
			const args: ParsedAutobranchArgs = request.slug === undefined ? {} : { slug: request.slug };
			const io = commandIoFromNsExtensionApi(ctx);
			return await runWithNsCommandIo(io, async (io) => {
				const result = await createAutobranchCheckpointFlow(ctx, args, io, options.now);
				if (result.ok) {
					for (const warning of result.warnings) {
						ctx.stderr?.(`${warning.trimEnd()}\n`);
					}
					return ok(
						renderResultBlock(caps, {
							kind: "success",
							headline: "Created a Graphite branch from dirty worktree changes.",
							cwd: result.root,
							body: result.summary.trimEnd(),
						}),
					);
				}

				if (result.reason === "pending_worktree") {
					return negative(
						renderPendingWorktreeFailure(caps, {
							error: result.error,
							cwd: ctx.cwd,
							commandLabel: "`ns flow autobranch`",
						}),
					);
				}

				if (result.reason === "clean_worktree") {
					// A clean worktree is a declined guardrail (warn refusal, house-style §7.3), not a failure;
					// point the user at the command that handles a clean worktree.
					return negative(
						renderResultBlock(caps, {
							kind: "refusal",
							headline: "`ns flow autobranch` requires pending worktree changes and did not run.",
							cwd: result.root,
							body: "Working tree is clean.",
							guidance:
								"Use `ns flow branch-latest-commit` to move the latest eligible unpushed commit to a new Graphite child branch.",
						}),
					);
				}

				return negative(
					renderAutobranchFailureResultBlock({
						caps,
						outcome: result.outcome,
						cwd: result.root,
						error: result.error,
						refusalHeadline: "Did not create a Graphite branch from dirty worktree changes.",
						failureHeadline: "Could not create a Graphite branch from dirty worktree changes.",
					}),
				);
			});
		},
	});
}

export const flowAutobranchCommand = createFlowAutobranchCommand();

export default flowAutobranchCommand;

type AutobranchCheckpointResult =
	| { ok: true; root: string; summary: string; warnings: string[] }
	| { ok: false; reason: "pending_worktree"; error: PendingWorktreeError }
	| { ok: false; reason: "clean_worktree"; root: string }
	| { ok: false; reason: "flow"; root: string; outcome: AutobranchFlowOutcome; error: string };

async function createAutobranchCheckpointFlow(
	ctx: NsExtensionApi,
	args: ParsedAutobranchArgs,
	io: NsCommandIo,
	now?: () => number,
): Promise<AutobranchCheckpointResult> {
	io.phase("Inspecting worktree…");
	const loaded = await loadFlowPendingWorktreeSnapshot(ctx);
	if (!loaded.ok) {
		return { ok: false, reason: "pending_worktree", error: loaded.error };
	}

	const snapshot = loaded.snapshot;
	if (snapshot.clean) {
		return { ok: false, reason: "clean_worktree", root: snapshot.root };
	}

	const { exec, git } = createAutobranchExecContext(ctx, snapshot.root);
	const flow = await runDirtyAutobranchFlow({
		cwd: snapshot.root,
		args,
		snapshot,
		exec,
		git,
		prepareCheckpointMessage: (pendingSnapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">) =>
			prepareFlowCheckpointMessage(ctx, pendingSnapshot),
		commitPreparedCheckpointMessage: (message) => createCommitWithPreparedMessage(ctx, message),
		onPhase: (message) => io.phase(message),
		...(now === undefined ? {} : { now }),
	});
	if (!flow.ok) {
		return {
			ok: false,
			reason: "flow",
			root: snapshot.root,
			outcome: flow.outcome,
			error: flow.error,
		};
	}

	return { ok: true, root: snapshot.root, summary: flow.summary, warnings: flow.warnings };
}
