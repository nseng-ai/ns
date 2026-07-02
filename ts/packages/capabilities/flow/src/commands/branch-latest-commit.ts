import {
	createLatestCommitAutobranchFlow,
	type LatestCommitAutobranchInput,
} from "../autobranch/latest-commit.ts";
import { renderResultBlock } from "@sdl/core/cli-theme";
import { DEFAULT_FAST_MODEL_REF, SLUG_MODEL_ENV } from "@sdl/core/model-slug";
import { defineExtension, failed, ok, z, type SdlCommand } from "@sdl/kernel/sdk";

import { renderAutobranchFailureResultBlock } from "../shared/autobranch-result-block.ts";
import { renderGitResultBlock } from "../shared/git-result-block.ts";
import { renderPendingWorktreeFailure } from "../shared/pending-worktree-result.ts";
import { resolveFlowStreamCaps } from "../shared/phase-stream.ts";
import { execExtensionCommand, loadFlowPendingWorktreeSnapshot } from "../shared/worktree.ts";

const BRANCH_LATEST_COMMIT_DESCRIPTION = `Move the latest eligible unpushed single-parent commit to a new Graphite child branch.

This command requires a clean worktree. It creates a local-only Graphite branch with \`gt create\`, resets the source branch to the commit parent, hard-resets the new child branch to the original commit SHA, verifies HEAD, and cleans up recovery evidence. It does not push, publish, submit, or update PRs.

Use \`sdl flow autobranch\` instead when pending dirty worktree changes should be moved to a new branch.

Environment:
  ${SLUG_MODEL_ENV}  Model reference for generated branch slugs. Defaults to ${DEFAULT_FAST_MODEL_REF}.`;

const branchLatestCommitRequestSchema = z.object({
	slug: z
		.string()
		.optional()
		.describe("Branch slug to use instead of deriving one from the latest commit."),
});

type BranchLatestCommitRequest = z.output<typeof branchLatestCommitRequestSchema>;

export const flowBranchLatestCommitCommand: SdlCommand<typeof branchLatestCommitRequestSchema> = {
	name: "branch-latest-commit",
	summary: "Move the latest eligible commit to a new Graphite branch.",
	description: BRANCH_LATEST_COMMIT_DESCRIPTION,
	schema: branchLatestCommitRequestSchema,
	options: { slug: { short: "-s" } },
	async run(ctx, request: BranchLatestCommitRequest) {
		const caps = resolveFlowStreamCaps(ctx);
		const args: LatestCommitAutobranchInput["args"] =
			request.slug === undefined ? {} : { slug: request.slug };

		const loaded = await loadFlowPendingWorktreeSnapshot(ctx);
		if (!loaded.ok) {
			return failed(
				renderPendingWorktreeFailure(caps, {
					error: loaded.error,
					cwd: ctx.cwd,
					commandLabel: "`sdl flow branch-latest-commit`",
				}),
			);
		}

		const snapshot = loaded.snapshot;
		if (!snapshot.clean) {
			return failed(
				renderGitResultBlock(caps, {
					kind: "refusal",
					headline: "`sdl flow branch-latest-commit` requires a clean worktree and did not run.",
					command: "git status --porcelain=v1",
					cwd: snapshot.root,
					detail: snapshot.status,
					guidance:
						"Use `sdl flow autobranch` to move dirty worktree changes to a new branch, or commit/stash them first.",
				}),
			);
		}

		const result = await createLatestCommitAutobranchFlow({
			cwd: snapshot.root,
			args,
			snapshot,
			exec: (command, commandArgs, timeout) =>
				execExtensionCommand({ ctx, command, args: commandArgs, timeoutMs: timeout }),
		});
		if (!result.ok) {
			// A declined eligibility guardrail (already-pushed HEAD, Graphite children, root/merge commit)
			// is a first-class warn refusal, not a red failure (house-style §7.3).
			return failed(
				renderAutobranchFailureResultBlock({
					caps,
					outcome: result.outcome,
					cwd: snapshot.root,
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
				cwd: snapshot.root,
				body: result.summary.trimEnd(),
			}),
		);
	},
};

export default defineExtension({
	commands: [flowBranchLatestCommitCommand],
});
