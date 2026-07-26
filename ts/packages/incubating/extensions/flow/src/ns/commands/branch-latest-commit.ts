import type { LatestCommitAutobranchInput } from "../../autobranch/latest-commit.ts";
import { dispatchAutobranchCheckpoint } from "../../autobranch/checkpoint-flow.ts";
import { renderResultBlock } from "@nseng-ai/foundation/cli-theme";
import { defineCommand, negative, ok, z, type NsCommand } from "@nseng-ai/sdk";

import { renderAutobranchFailureResultBlock } from "../presentation/autobranch-result-block.ts";
import { renderGitResultBlock } from "../presentation/git-result-block.ts";
import { renderPendingWorktreeFailure } from "../presentation/pending-worktree-result.ts";
import { resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";
import { createAutobranchDispatchEnv } from "../worktree.ts";
import { MODEL_OPERATION_IDS } from "@nseng-ai/extension-kit/model-policy";
import { resolveFlowModelSelection } from "../model-policy.ts";

const BRANCH_LATEST_COMMIT_DESCRIPTION = `Move the latest eligible single-parent commit to a new Graphite child branch.

This command requires a clean worktree. The latest commit is eligible when the source has no upstream, is locally ahead of its locally known upstream, or is exactly synchronized on a non-trunk branch. Remote-ahead, diverged, and exactly synchronized configured Graphite trunk states are refused. Upstream checks use only local tracking refs and do not fetch.

It creates a local-only Graphite branch with \`gt create\`, resets the source branch to the commit parent, hard-resets the new child branch to the original commit SHA, verifies HEAD, and cleans up recovery evidence. The mutation does not fetch, push, publish, submit, or update PRs. After a synchronized success, the upstream remains unchanged; explicitly run \`ns flow submit\` from the new child to publish the reshaped stack.

Use \`ns flow autobranch\` instead when pending dirty worktree changes should be moved to a new branch.
`;

const branchLatestCommitRequestSchema = z.object({
	slug: z
		.string()
		.optional()
		.describe("Branch slug to use instead of deriving one from the latest commit."),
});

type BranchLatestCommitRequest = z.output<typeof branchLatestCommitRequestSchema>;

export const flowBranchLatestCommitCommand: NsCommand<typeof branchLatestCommitRequestSchema> =
	defineCommand({
		name: "branch-latest-commit",
		summary: "Move the latest eligible commit to a new Graphite branch.",
		description: BRANCH_LATEST_COMMIT_DESCRIPTION,
		schema: branchLatestCommitRequestSchema,
		resultSchema: z.string(),
		renderHuman: (text) => text,
		options: { slug: { short: "-s" } },
		handler: async (ctx, request: BranchLatestCommitRequest) => {
			const caps = resolveFlowStreamCaps(ctx);
			const args: LatestCommitAutobranchInput["args"] =
				request.slug === undefined ? {} : { slug: request.slug };

			const model = await resolveFlowModelSelection(ctx, MODEL_OPERATION_IDS.slug);
			if (!model.ok)
				return negative(
					renderResultBlock(caps, {
						kind: "failure",
						headline: "Invalid slug model configuration.",
						cwd: ctx.cwd,
						body: model.error,
					}),
				);
			const dispatched = await dispatchAutobranchCheckpoint(
				{ mode: "require-clean" },
				createAutobranchDispatchEnv(ctx, args, model.modelSelection),
			);

			switch (dispatched.outcome) {
				case "pending-worktree":
					return negative(
						renderPendingWorktreeFailure(caps, {
							error: dispatched.error,
							cwd: ctx.cwd,
							commandLabel: "`ns flow branch-latest-commit`",
						}),
					);
				case "refused-dirty":
					return negative(
						renderGitResultBlock(caps, {
							kind: "refusal",
							headline: "`ns flow branch-latest-commit` requires a clean worktree and did not run.",
							command: "git status --porcelain=v1",
							cwd: dispatched.snapshot.root,
							detail: dispatched.snapshot.status,
							guidance:
								"Use `ns flow autobranch` to move dirty worktree changes to a new branch, or commit/stash them first.",
						}),
					);
				case "flow": {
					const result = dispatched.flow;
					if (!result.ok) {
						// A declined eligibility guardrail (unsafe upstream relationship, synchronized trunk, Graphite children, root/merge commit)
						// is a first-class warn refusal, not a red failure (house-style §7.3).
						return negative(
							renderAutobranchFailureResultBlock({
								caps,
								outcome: result.outcome,
								cwd: dispatched.snapshot.root,
								error: result.error,
								refusalHeadline: "Did not move the latest commit to a new Graphite branch.",
								failureHeadline: "Could not move the latest commit to a new Graphite branch.",
							}),
						);
					}

					for (const warning of result.warnings) {
						ctx.stderr?.(`${warning.trimEnd()}\n`);
					}
					return ok(
						renderResultBlock(caps, {
							kind: "success",
							headline: "Moved the latest commit to a new Graphite branch.",
							cwd: dispatched.snapshot.root,
							body: result.summary.trimEnd(),
						}),
					);
				}
			}
		},
	});

export default flowBranchLatestCommitCommand;
