import {
	createLatestCommitAutobranchFlow,
	type LatestCommitAutobranchInput,
} from "@sdl/autobranch/latest-commit";
import { DEFAULT_FAST_MODEL_REF, SLUG_MODEL_ENV } from "@sdl/core/model-slug";
import { defineExtension, failed, ok, z, type SdlCommand } from "@sdl/sdl/sdk";

import {
	execExtensionCommand,
	formatPendingWorktreeError,
	loadFlowPendingWorktreeSnapshot,
} from "../shared/worktree.ts";

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
	async run(ctx, request: BranchLatestCommitRequest) {
		const args: LatestCommitAutobranchInput["args"] =
			request.slug === undefined ? {} : { slug: request.slug };
		const loaded = await loadFlowPendingWorktreeSnapshot(ctx);
		if (!loaded.ok) {
			return failed(formatPendingWorktreeError(loaded.error).trimEnd(), 1);
		}

		const snapshot = loaded.snapshot;
		if (!snapshot.clean) {
			return failed(
				"Working tree has pending changes; use `sdl flow autobranch` to move dirty worktree changes to a new branch. `sdl flow branch-latest-commit` requires a clean worktree.",
				1,
			);
		}

		const result = await createLatestCommitAutobranchFlow({
			cwd: snapshot.root,
			args,
			snapshot,
			exec: (command, commandArgs, _cwd, timeout) =>
				execExtensionCommand({ ctx, command, args: commandArgs, timeoutMs: timeout }),
		});
		if (!result.ok) {
			return failed(result.error.trimEnd(), 1);
		}
		for (const warning of result.warnings) {
			ctx.stderr?.(`${warning.trimEnd()}\n`);
		}
		return ok(result.summary.trimEnd());
	},
};

export default defineExtension({
	commands: [flowBranchLatestCommitCommand],
});
