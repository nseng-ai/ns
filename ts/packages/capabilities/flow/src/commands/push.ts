import { commandSucceeded, type ExecResult } from "@sdl/exec";
import { defineExtension, failed, ok, type SdlCommand } from "sdl-sdk";
import type { SdlExtensionApi } from "sdl-sdk";
import type { GitErrorInfo, GitGateway } from "@sdl/git";

import { execFlowGit, readFlowGitPorcelainStatus } from "../shared/git.ts";
import { renderGitResultBlock } from "../shared/git-result-block.ts";
import { resolveFlowStreamCaps } from "../shared/phase-stream.ts";

const PUSH_TIMEOUT_MS = 120_000;

const PUSH_COMMAND_DESCRIPTION = `Push already-committed work on the current branch with plain git push.

The command first runs git status --porcelain and requires a clean worktree before pushing. It then runs plain git push with a two-minute timeout. It has no intentional arguments or options.

This is not a replacement for sdl flow submit. Use \`sdl flow submit\` / \`/sdl:flow:submit\` when the current Graphite stack needs submission, PR metadata updates, or the full submit flow.`;

export const flowPushCommand: SdlCommand = {
	name: "push",
	summary: "Push committed work on the current branch with git push.",
	description: PUSH_COMMAND_DESCRIPTION,
	async run(ctx) {
		return await runPush(ctx);
	},
};

export default defineExtension({
	commands: [flowPushCommand],
});

export type RunPushCoreResult =
	| { type: "dirty" }
	| { type: "status-failed"; error: GitErrorInfo }
	| { type: "pushed"; result: ExecResult }
	| { type: "push-failed"; result: ExecResult };

export interface RunPushCoreOptions {
	git: GitGateway;
	cwd: string;
	push: () => Promise<ExecResult>;
}

export async function runPushCore(options: RunPushCoreOptions): Promise<RunPushCoreResult> {
	const status = await options.git.hasUncommittedChangesUnder({
		cwd: options.cwd,
		relativePath: ".",
	});
	if (!status.ok) return { type: "status-failed", error: status.error };
	if (status.value) return { type: "dirty" };

	const result = await options.push();
	return commandSucceeded(result) ? { type: "pushed", result } : { type: "push-failed", result };
}

async function runPush(ctx: SdlExtensionApi) {
	const caps = resolveFlowStreamCaps(ctx);

	const status = await readFlowGitPorcelainStatus(ctx);
	if (!status.ok) {
		return failed(
			renderGitResultBlock(caps, {
				kind: "failure",
				headline: "Could not inspect the worktree status. `sdl flow push` did not run `git push`.",
				command: "git status --porcelain",
				cwd: ctx.cwd,
				result: status.result,
				guidance:
					"Inspect the Git output, fix the repository state, or use `sdl flow submit` / `/sdl:flow:submit` for the Graphite submit flow when appropriate.",
			}),
		);
	}

	if (!status.isClean) {
		return failed(
			renderGitResultBlock(caps, {
				kind: "refusal",
				headline: "`sdl flow push` requires a clean worktree and did not run `git push`.",
				command: "git status --porcelain",
				cwd: ctx.cwd,
				detail: status.stdout,
				guidance:
					"Commit or stash outstanding changes first, or use `sdl flow submit` / `/sdl:flow:submit` for the Graphite submit flow when appropriate.",
			}),
		);
	}

	const pushResult = await execFlowGit(ctx, ["push"], PUSH_TIMEOUT_MS);
	if (commandSucceeded(pushResult)) {
		return ok(
			renderGitResultBlock(caps, {
				kind: "success",
				headline: "`git push` completed successfully.",
				command: "git push",
				cwd: ctx.cwd,
				result: pushResult,
			}),
		);
	}

	return failed(
		renderGitResultBlock(caps, {
			kind: "failure",
			headline:
				"`git push` failed. The branch is likely out of sync or needs the Graphite submit flow; use `sdl flow submit` / `/sdl:flow:submit` when appropriate.",
			command: "git push",
			cwd: ctx.cwd,
			result: pushResult,
		}),
	);
}
