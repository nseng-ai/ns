import { runTrunkPullDetailed, type TrunkPullDetailedResult } from "@sdl/ccc/trunk-pull";
import { formatCommand } from "@sdl/core/exec";
import { defineExtension, failed, ok, z, type SdlCommand } from "sdl-sdk";
import type { Caps } from "@sdl/clinkr";

import { runFlowCccOperation } from "../shared/ccc-cli.ts";
import { renderGitResultBlock } from "../shared/git-result-block.ts";
import { resolveFlowStreamCaps } from "../shared/phase-stream.ts";

const pullTrunkSchema = z.object({});

export const flowPullTrunkCommand: SdlCommand<typeof pullTrunkSchema> = {
	name: "pull-trunk",
	summary: "Pull the configured Graphite trunk branch without running full gt sync.",
	description: "Pull the configured Graphite trunk branch without running full gt sync.",
	schema: pullTrunkSchema,
	run: async (ctx) => {
		const caps = resolveFlowStreamCaps(ctx);
		const result = await runFlowCccOperation({
			ctx,
			run: async (io) => await runTrunkPullDetailed({ exec: io.exec }, ctx.cwd),
		});
		const block = renderTrunkPullBlock(caps, result);
		return result.ok ? ok(block) : failed(block);
	},
};

export default defineExtension({
	commands: [flowPullTrunkCommand],
});

function renderTrunkPullBlock(caps: Caps, result: TrunkPullDetailedResult): string {
	if (result.ok) {
		return renderGitResultBlock(caps, {
			kind: "success",
			headline: `Pulled local Graphite trunk branch \`${result.trunk}\` only.`,
			command: formatCommand(result.command, result.args),
			cwd: result.cwd,
			result: result.result,
			guidance: "No full `gt sync` was run.",
		});
	}

	switch (result.reason) {
		case "trunk-command-failed":
			return renderGitResultBlock(caps, {
				kind: "failure",
				headline: "Could not resolve Graphite trunk. Local trunk was not updated.",
				command: formatCommand(result.command, result.args),
				cwd: result.cwd,
				result: result.result,
			});
		case "trunk-empty":
			return renderGitResultBlock(caps, {
				kind: "failure",
				headline: "gt trunk --no-interactive returned no branch. Local trunk was not updated.",
				command: formatCommand(result.command, result.args),
				cwd: result.cwd,
				result: result.result,
			});
		case "worktree-list-failed":
			return renderGitResultBlock(caps, {
				kind: "failure",
				headline: "Could not inspect Git worktrees. Local trunk was not updated.",
				command: formatCommand(result.command, result.args),
				cwd: result.cwd,
				result: result.result,
			});
		case "update-failed":
			return renderGitResultBlock(caps, {
				kind: "failure",
				headline: `Could not update local trunk branch \`${result.trunk}\`.`,
				command: formatCommand(result.command, result.args),
				cwd: result.cwd,
				result: result.result,
			});
	}
}
