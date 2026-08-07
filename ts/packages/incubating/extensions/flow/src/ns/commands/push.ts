import { commandSucceeded, type ExecResult } from "@nseng-ai/foundation/command";
import { defineCommand, negative, ok, z, type NsCommand } from "@nseng-ai/sdk";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import { type GitErrorInfo, type GitGateway } from "@nseng-ai/foundation/git";
import { renderResultBlock, resolveThemeCaps } from "@nseng-ai/foundation/cli-theme";

import { execNsGit, readNsGitPorcelainStatus } from "../exec.ts";

import { renderGitResultBlock } from "../presentation/git-result-block.ts";
import { resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";

const PUSH_TIMEOUT_MS = 120_000;

export const PUSH_COMMAND_SUMMARY = "Push committed non-Graphite branch work with git push.";

const pushResultSchema = z.object({ cwd: z.string() });

export const flowPushCommand: NsCommand = defineCommand({
	schema: z.object({}),
	resultSchema: pushResultSchema,
	renderHuman: (result, caps) =>
		renderResultBlock(resolveThemeCaps(caps), {
			kind: "success",
			headline: "`git push` completed successfully.",
			body: "Command: git push",
			cwd: result.cwd,
			guidance:
				"For Graphite-tracked PR branches, prefer `ns flow submit`; if this push moved a PR branch outside Graphite, run `gt get` or `gt sync` before submitting again.",
		}),
	handler: async (ctx) => await runPush(ctx),
});

export default flowPushCommand;

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

async function runPush(ctx: NsExtensionApi) {
	const caps = resolveFlowStreamCaps(ctx);

	const status = await readNsGitPorcelainStatus(ctx);
	if (!status.ok) {
		return negative(
			renderGitResultBlock(caps, {
				kind: "failure",
				headline: "Could not inspect the worktree status. `ns flow push` did not run `git push`.",
				command: "git status --porcelain",
				cwd: ctx.cwd,
				result: status.result,
				guidance:
					"Inspect the Git output, fix the repository state, or use `ns flow submit` / `/ns:flow:submit` for the Graphite submit flow when appropriate.",
			}),
		);
	}

	if (!status.isClean) {
		return negative(
			renderGitResultBlock(caps, {
				kind: "refusal",
				headline: "`ns flow push` requires a clean worktree and did not run `git push`.",
				command: "git status --porcelain",
				cwd: ctx.cwd,
				detail: status.stdout,
				guidance:
					"Commit or stash outstanding changes first, or use `ns flow submit` / `/ns:flow:submit` for the Graphite submit flow when appropriate.",
			}),
		);
	}

	const pushResult = await execNsGit(ctx, ["push"], PUSH_TIMEOUT_MS);
	if (commandSucceeded(pushResult)) return ok({ cwd: ctx.cwd });

	return negative(
		renderGitResultBlock(caps, {
			kind: "failure",
			headline:
				"`git push` failed. The branch is likely out of sync or needs the Graphite submit flow; use `ns flow submit` / `/ns:flow:submit` for Graphite-tracked PR branches.",
			command: "git push",
			cwd: ctx.cwd,
			result: pushResult,
		}),
	);
}
