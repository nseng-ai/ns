import { runTrunkPullDetailed, type TrunkPullResult } from "../../trunk-pull/trunk-pull.ts";
import { formatCommand } from "@nseng-ai/foundation/command";
import { renderResultBlock, resolveThemeCaps } from "@nseng-ai/foundation/cli-theme";
import { defineCommand, negative, ok, z, type NsCommand } from "@nseng-ai/sdk";
import type { Caps } from "@nseng-ai/clinkr";

import { runFlowCliOperation } from "../flow-cli-runner.ts";
import { renderGitResultBlock } from "../presentation/git-result-block.ts";
import { resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";

const pullTrunkSchema = z.object({});
const pullTrunkResultSchema = z.object({
	trunk: z.string(),
	cwd: z.string(),
	command: z.string(),
});

export const flowPullTrunkCommand: NsCommand<typeof pullTrunkSchema> = defineCommand({
	schema: pullTrunkSchema,
	resultSchema: pullTrunkResultSchema,
	renderHuman: (result, caps) =>
		renderResultBlock(resolveThemeCaps(caps), {
			kind: "success",
			headline: `Pulled local Git trunk branch \`${result.trunk}\` only.`,
			body: `No full \`gt sync\` was run.\nCommand: ${result.command}`,
			cwd: result.cwd,
		}),
	handler: async (ctx) => {
		const caps = resolveFlowStreamCaps(ctx);
		const result = await runFlowCliOperation({
			ctx,
			run: async (io) => await runTrunkPullDetailed({ exec: io.exec }, ctx.cwd),
		});
		if (result.outcome.kind === "success" && isCommandBackedResult(result)) {
			return ok({
				trunk: result.outcome.trunk,
				cwd: result.cwd,
				command: formatCommand(result.command, result.args),
			});
		}
		return negative(renderTrunkPullBlock(caps, result));
	},
});

export default flowPullTrunkCommand;

function renderTrunkPullBlock(caps: Caps, result: TrunkPullResult): string {
	if (!isCommandBackedResult(result)) {
		switch (result.outcome.kind) {
			case "trunk-resolution-failed":
				return renderResultBlock(caps, {
					kind: "failure",
					headline:
						"Could not resolve the Git trunk branch from cached `refs/remotes/origin/HEAD`. Local trunk was not updated.",
					body: result.outcome.error.message,
					guidance:
						"Refresh it with `git remote set-head origin --auto`, or set it explicitly with `git remote set-head origin <branch>`, then retry.",
					cwd: result.cwd,
				});
			case "trunk-missing":
				return renderResultBlock(caps, {
					kind: "failure",
					headline:
						"Cached `refs/remotes/origin/HEAD` does not identify a Git trunk branch. Local trunk was not updated.",
					guidance:
						"Refresh it with `git remote set-head origin --auto`, or set it explicitly with `git remote set-head origin <branch>`, then retry.",
					cwd: result.cwd,
				});
			case "upstream-missing":
				return renderResultBlock(caps, {
					kind: "refusal",
					headline: `Git trunk \`${result.outcome.trunk}\` has no configured upstream. Local trunk was not updated.`,
					guidance: `Configure one with \`git branch --set-upstream-to=<remote>/<remote-branch> ${result.outcome.trunk}\`, then retry.`,
					cwd: result.cwd,
				});
			case "upstream-inspection-failed":
				return renderResultBlock(caps, {
					kind: "failure",
					headline: `Could not inspect the configured upstream for Git trunk \`${result.outcome.trunk}\`. Local trunk was not updated.`,
					body: result.outcome.error.message,
					cwd: result.cwd,
				});
		}
	}

	const command = formatCommand(result.command, result.args);
	switch (result.outcome.kind) {
		case "success":
			return renderGitResultBlock(caps, {
				kind: "success",
				headline: `Pulled local Git trunk branch \`${result.outcome.trunk}\` only.`,
				command,
				cwd: result.cwd,
				result: result.execResult,
				guidance: "No full `gt sync` was run.",
			});
		case "worktree-list-failed":
			return renderGitResultBlock(caps, {
				kind: "failure",
				headline: "Could not inspect Git worktrees. Local trunk was not updated.",
				command,
				cwd: result.cwd,
				result: result.execResult,
			});
		case "update-failed":
			return renderGitResultBlock(caps, {
				kind: "failure",
				headline: `Could not update local trunk branch \`${result.outcome.trunk}\`.`,
				command,
				cwd: result.cwd,
				result: result.execResult,
			});
	}
}

function isCommandBackedResult(
	result: TrunkPullResult,
): result is Extract<TrunkPullResult, { execResult: unknown }> {
	return "execResult" in result;
}
