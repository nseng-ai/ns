import { runTrunkPullDetailed, type TrunkPullResult } from "../../trunk-pull/trunk-pull.ts";
import { formatCommand } from "@nseng-ai/foundation/command";
import { defineExtension, failed, ok, z, type NsCommand } from "@nseng-ai/kernel/sdk";
import type { Caps } from "@nseng-ai/clinkr";

import { runFlowCliOperation } from "../flow-cli-runner.ts";
import { renderGitResultBlock } from "../presentation/git-result-block.ts";
import { resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";

const pullTrunkSchema = z.object({});

export const flowPullTrunkCommand: NsCommand<typeof pullTrunkSchema> = {
	name: "pull-trunk",
	summary: "Pull the configured Graphite trunk branch without running full gt sync.",
	description: "Pull the configured Graphite trunk branch without running full gt sync.",
	schema: pullTrunkSchema,
	run: async (ctx) => {
		const caps = resolveFlowStreamCaps(ctx);
		const result = await runFlowCliOperation({
			ctx,
			run: async (io) => await runTrunkPullDetailed({ exec: io.exec }, ctx.cwd),
		});
		const block = renderTrunkPullBlock(caps, result);
		return result.outcome.kind === "success" ? ok(block) : failed(block);
	},
};

export default defineExtension({
	commands: [flowPullTrunkCommand],
});

function renderTrunkPullBlock(caps: Caps, result: TrunkPullResult): string {
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
		case "trunk-command-failed":
			return renderGitResultBlock(caps, {
				kind: "failure",
				headline: "Could not resolve Graphite trunk. Local trunk was not updated.",
				command,
				cwd: result.cwd,
				result: result.execResult,
			});
		case "trunk-empty":
			return renderGitResultBlock(caps, {
				kind: "failure",
				headline: "gt trunk --no-interactive returned no branch. Local trunk was not updated.",
				command,
				cwd: result.cwd,
				result: result.execResult,
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
