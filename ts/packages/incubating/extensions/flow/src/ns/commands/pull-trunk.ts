import { runTrunkPullDetailed, type TrunkPullResult } from "../../trunk-pull/trunk-pull.ts";
import { formatCommand } from "@nseng-ai/foundation/command";
import { renderResultBlock } from "@nseng-ai/foundation/cli-theme";
import { defineCommand, negative, ok, z, type NsCommand } from "@nseng-ai/sdk";
import type { Caps } from "@nseng-ai/clinkr";

import { runFlowCliOperation } from "../flow-cli-runner.ts";
import { renderGitResultBlock } from "../presentation/git-result-block.ts";
import { resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";

const pullTrunkSchema = z.object({});

export const flowPullTrunkCommand: NsCommand<typeof pullTrunkSchema> = defineCommand({
	name: "pull-trunk",
	summary: "Pull the configured Graphite trunk branch without running full gt sync.",
	description:
		"Pull the configured Graphite trunk branch from its configured Git upstream without running full gt sync.",
	schema: pullTrunkSchema,
	resultSchema: z.string(),
	handler: async (ctx) => {
		const caps = resolveFlowStreamCaps(ctx);
		const result = await runFlowCliOperation({
			ctx,
			run: async (io) => await runTrunkPullDetailed({ exec: io.exec }, ctx.cwd),
		});
		const block = renderTrunkPullBlock(caps, result);
		return result.outcome.kind === "success" ? ok(block) : negative(block);
	},
});

export default flowPullTrunkCommand;

function renderTrunkPullBlock(caps: Caps, result: TrunkPullResult): string {
	if (!isCommandBackedResult(result)) {
		switch (result.outcome.kind) {
			case "trunk-command-failed":
				return renderResultBlock(caps, {
					kind: "failure",
					headline: "Could not resolve Graphite trunk. Local trunk was not updated.",
					body: result.outcome.error.message,
					cwd: result.cwd,
				});
			case "trunk-empty":
				return renderResultBlock(caps, {
					kind: "failure",
					headline: "gt trunk --no-interactive returned no branch. Local trunk was not updated.",
					body: result.outcome.error.message,
					cwd: result.cwd,
				});
			case "upstream-missing":
				return renderResultBlock(caps, {
					kind: "refusal",
					headline: `Graphite trunk \`${result.outcome.trunk}\` has no configured Git upstream. Local trunk was not updated.`,
					guidance: `Configure one with \`git branch --set-upstream-to=<remote>/<remote-branch> ${result.outcome.trunk}\`, then retry.`,
					cwd: result.cwd,
				});
			case "upstream-inspection-failed":
				return renderResultBlock(caps, {
					kind: "failure",
					headline: `Could not inspect the configured Git upstream for Graphite trunk \`${result.outcome.trunk}\`. Local trunk was not updated.`,
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
				headline: `Pulled local Graphite trunk branch \`${result.outcome.trunk}\` only.`,
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
