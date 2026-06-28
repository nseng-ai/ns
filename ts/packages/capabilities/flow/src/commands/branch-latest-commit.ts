import {
	createLatestCommitAutobranchFlow,
	type LatestCommitAutobranchInput,
} from "@sdl/autobranch/latest-commit";
import { DEFAULT_FAST_MODEL_REF, SLUG_MODEL_ENV } from "@sdl/core/model-slug";
import { defineExtension, failed, ok, z, type ExecResult, type SdlCommand } from "sdl-sdk";

import { renderGitResultBlock } from "../shared/git-result-block.ts";
import { resolveFlowStreamCaps } from "../shared/phase-stream.ts";
import { renderWorkflowResultBlock } from "../shared/workflow-result-block.ts";
import {
	execExtensionCommand,
	loadFlowPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type WorktreeCommandResult,
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
		const caps = resolveFlowStreamCaps(ctx);
		const args: LatestCommitAutobranchInput["args"] =
			request.slug === undefined ? {} : { slug: request.slug };

		const loaded = await loadFlowPendingWorktreeSnapshot(ctx);
		if (!loaded.ok) {
			return failed(
				renderGitResultBlock(caps, {
					kind: "failure",
					headline: pendingWorktreeHeadline(loaded.error),
					command: pendingWorktreeCommand(loaded.error),
					cwd: ctx.cwd,
					result: toExecResult(loaded.error.result),
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
			return failed(
				renderWorkflowResultBlock(caps, {
					kind: "failure",
					headline: "Could not move the latest commit to a new Graphite branch.",
					cwd: snapshot.root,
					body: result.error.trimEnd(),
				}),
			);
		}

		for (const warning of result.warnings) {
			ctx.stderr?.(`${warning.trimEnd()}\n`);
		}
		return ok(
			renderWorkflowResultBlock(caps, {
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

// The snapshot load runs the standard pending-worktree git probes; map each failed probe to the
// command that ran so the house-style failure block names the real step (house style §4 plumbing).
function pendingWorktreeCommand(error: PendingWorktreeError): string {
	switch (error.kind) {
		case "not_git_repo":
			return "git rev-parse --show-toplevel";
		case "detached_head":
			return "git symbolic-ref --short HEAD";
		case "status_failed":
			return "git status --porcelain=v1";
		case "diff_failed":
			return "git diff HEAD --no-ext-diff";
	}
}

function pendingWorktreeHeadline(error: PendingWorktreeError): string {
	switch (error.kind) {
		case "not_git_repo":
			return "Not inside a git repository. `sdl flow branch-latest-commit` did not run.";
		case "detached_head":
			return "Could not determine the current branch. `sdl flow branch-latest-commit` did not run.";
		case "status_failed":
			return "Could not inspect the worktree status. `sdl flow branch-latest-commit` did not run.";
		case "diff_failed":
			return "Could not capture the worktree diff. `sdl flow branch-latest-commit` did not run.";
	}
}

function toExecResult(result: WorktreeCommandResult): ExecResult {
	return {
		code: result.code,
		stdout: result.stdout,
		stderr: result.stderr,
		killed: result.killed ?? false,
	};
}
