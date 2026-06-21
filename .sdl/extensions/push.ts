import {
	commandSucceeded,
	defineExtension,
	failed,
	formatCommandEvidence,
	ok,
} from "@sdl/sdl/sdk";
import type { SdlContext } from "@sdl/sdl/sdk";

const PUSH_TIMEOUT_MS = 120_000;

const PUSH_COMMAND_DESCRIPTION = `Push already-committed work on the current branch with plain git push.

The command first runs git status --porcelain and requires a clean worktree before pushing. It then runs plain git push with a two-minute timeout. It has no intentional arguments or options.

This is not a replacement for sdl submit. Use \`sdl submit\` / \`/sdl:submit\` when the current Graphite stack needs submission, PR metadata updates, or the full submit flow.`;

export default defineExtension({
	commands: [
		{
			name: "push",
			description: PUSH_COMMAND_DESCRIPTION,
			async run(ctx) {
				return await runPush(ctx);
			},
		},
	],
});

async function runPush(ctx: SdlContext) {
	const statusResult = await ctx.exec("git", ["status", "--porcelain"]);
	if (!commandSucceeded(statusResult)) {
		return failed(
			formatCommandEvidence({
				intro: "Could not inspect the worktree status. `sdl push` did not run `git push`.",
				command: "git status --porcelain",
				cwd: ctx.cwd,
				result: statusResult,
				guidance:
					"Inspect the Git output, fix the repository state, or use `sdl submit` / `/sdl:submit` for the Graphite submit flow when appropriate.",
			}),
		);
	}

	if (statusResult.stdout.trim().length > 0) {
		return failed(formatDirtyWorktreeMessage(ctx.cwd, statusResult.stdout));
	}

	const pushResult = await ctx.exec("git", ["push"], { timeoutMs: PUSH_TIMEOUT_MS });
	if (commandSucceeded(pushResult)) {
		return ok(
			formatCommandEvidence({
				intro: "`git push` completed successfully.",
				command: "git push",
				cwd: ctx.cwd,
				result: pushResult,
			}),
		);
	}

	return failed(
		formatCommandEvidence({
			intro:
				"`git push` failed. The branch is likely out of sync or needs the Graphite submit flow; use `sdl submit` / `/sdl:submit` when appropriate.",
			command: "git push",
			cwd: ctx.cwd,
			result: pushResult,
		}),
	);
}

function formatDirtyWorktreeMessage(cwd: string, stdout: string): string {
	return [
		"`sdl push` requires a clean worktree and did not run `git push`.",
		"Commit or stash outstanding changes first, or use `sdl submit` / `/sdl:submit` for the Graphite submit flow when appropriate.",
		"Command: git status --porcelain",
		`Cwd: ${cwd}`,
		"stdout:",
		formatOutput(stdout),
	].join("\n");
}

function formatOutput(output: string): string {
	if (output === "") return "<empty>";
	return output.endsWith("\n") ? output.trimEnd() : output;
}
