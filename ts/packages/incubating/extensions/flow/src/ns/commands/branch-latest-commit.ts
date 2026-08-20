import type { LatestCommitAutobranchInput } from "../../autobranch/latest-commit.ts";
import type { AutobranchProviderId } from "../../autobranch/provider.ts";
import { dispatchAutobranchCheckpoint } from "../../autobranch/checkpoint-flow.ts";
import { renderResultBlock, resolveThemeCaps } from "@nseng-ai/foundation/cli-theme";
import { defineCommand, negative, ok, z, type NsCommand } from "@nseng-ai/sdk";

import { renderAutobranchFailureResultBlock } from "../presentation/autobranch-result-block.ts";
import { renderGitResultBlock } from "../presentation/git-result-block.ts";
import { renderPendingWorktreeFailure } from "../presentation/pending-worktree-result.ts";
import { resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";
import { createAutobranchDispatchEnv } from "../worktree.ts";
import { MODEL_OPERATION_IDS } from "@nseng-ai/extension-kit/model-policy";
import { resolveFlowModelSelection } from "../model-policy.ts";

const branchLatestCommitResultSchema = z.object({ cwd: z.string(), summary: z.string() });

const branchLatestCommitRequestSchema = z.object({
	slug: z
		.string()
		.optional()
		.describe("Branch slug to use instead of deriving one from the latest commit."),
});

type BranchLatestCommitRequest = z.output<typeof branchLatestCommitRequestSchema>;

export function createFlowBranchLatestCommitCommand(
	provider: AutobranchProviderId,
): NsCommand<typeof branchLatestCommitRequestSchema> {
	const namespace = provider === "graphite" ? "gt" : "gs";
	const providerLabel = provider === "graphite" ? "Graphite" : "github/gh-stack";
	return defineCommand({
		schema: branchLatestCommitRequestSchema,
		resultSchema: branchLatestCommitResultSchema,
		options: { slug: { short: "-s" } },
		renderHuman: (result, caps) =>
			renderResultBlock(resolveThemeCaps(caps), {
				kind: "success",
				headline: `Moved the latest commit to a new ${providerLabel} branch.`,
				cwd: result.cwd,
				body: result.summary,
			}),
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
				createAutobranchDispatchEnv(ctx, args, model.modelSelection, provider),
			);

			switch (dispatched.outcome) {
				case "pending-worktree":
					return negative(
						renderPendingWorktreeFailure(caps, {
							error: dispatched.error,
							cwd: ctx.cwd,
							commandLabel: `\`ns flow ${namespace} branch-latest-commit\``,
						}),
					);
				case "refused-dirty":
					return negative(
						renderGitResultBlock(caps, {
							kind: "refusal",
							headline: `\`ns flow ${namespace} branch-latest-commit\` requires a clean worktree and did not run.`,
							command: "git status --porcelain=v1",
							cwd: dispatched.snapshot.root,
							detail: dispatched.snapshot.status,
							guidance: `Use \`ns flow ${namespace} autobranch\` to move dirty worktree changes to a new branch, or commit/stash them first.`,
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
								refusalHeadline: `Did not move the latest commit to a new ${providerLabel} branch.`,
								failureHeadline: `Could not move the latest commit to a new ${providerLabel} branch.`,
							}),
						);
					}

					for (const warning of result.warnings) {
						ctx.stderr?.(`${warning.trimEnd()}\n`);
					}
					return ok({ cwd: dispatched.snapshot.root, summary: result.summary.trimEnd() });
				}
			}
		},
	});
}

export const flowBranchLatestCommitCommand = createFlowBranchLatestCommitCommand("graphite");

export default flowBranchLatestCommitCommand;
