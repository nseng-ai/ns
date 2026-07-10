import { formatCommand } from "@nseng-ai/foundation/command";
import { renderResultBlock } from "@nseng-ai/foundation/cli-theme";
import { commandIoFromNsExtensionApi, runWithNsCommandIo } from "@nseng-ai/kernel/command-io";
import { defineCommand, negative, ok, z, type NsCommand } from "@nseng-ai/kernel/sdk";

import {
	formatStackSquashSummary,
	runStackSquashFlow,
	type StackSquashCommandFailure,
	type StackSquashOutcome,
} from "../../stack-squash/stack-squash.ts";
import { resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";
import { runFlowCliOperation } from "../flow-cli-runner.ts";
import { renderGitResultBlock } from "../presentation/git-result-block.ts";

const squashStackSchema = z.object({});

export const flowSquashStackCommand: NsCommand<typeof squashStackSchema> = defineCommand({
	name: "squash-stack",
	summary: "Squash every branch in the current Graphite stack to one commit.",
	description:
		"Squash every branch in the current Graphite stack from the tip down, then restore the tip branch.",
	schema: squashStackSchema,
	resultSchema: z.string(),
	handler: async (ctx) => {
		const caps = resolveFlowStreamCaps(ctx);
		const commandIo = commandIoFromNsExtensionApi(ctx);
		return await runWithNsCommandIo(commandIo, async (io) => {
			const outcome = await runFlowCliOperation({
				ctx,
				run: async (commands) =>
					await runStackSquashFlow(commands, {
						cwd: ctx.cwd,
						onProgress: (message) => io.phase(message),
					}),
			});
			if (outcome.kind === "success") return ok(formatStackSquashSummary(outcome.processed));
			return negative(renderStackSquashNegative(caps, outcome));
		});
	},
});

export default flowSquashStackCommand;

function renderStackSquashNegative(
	caps: Parameters<typeof renderResultBlock>[0],
	outcome: Exclude<StackSquashOutcome, { kind: "success" }>,
): string {
	switch (outcome.kind) {
		case "worktree-dirty":
			return renderGitResultBlock(caps, {
				kind: "refusal",
				headline: "Worktree has uncommitted changes; stack squash did not run.",
				command: "git status --porcelain=v1",
				cwd: outcome.cwd,
				detail: outcome.status,
			});
		case "empty-stack":
			return renderResultBlock(caps, {
				kind: "failure",
				headline: "No Graphite stack branches to squash.",
				cwd: outcome.cwd,
			});
		case "worktree-probe-failed":
			return renderCommandFailure(
				caps,
				outcome,
				"Cannot inspect worktree state; stack squash did not run.",
			);
		case "stack-discovery-failed":
			return renderCommandFailure(caps, outcome, outcome.message);
		case "checkout-failed":
			return renderCommandFailure(
				caps,
				outcome,
				`Could not check out Graphite branch \`${outcome.branch}\`; stack squash stopped.`,
			);
		case "squash-failed":
			return renderCommandFailure(
				caps,
				outcome,
				`Could not squash Graphite branch \`${outcome.branch}\`; stack squash stopped.`,
			);
		case "tip-restore-failed":
			return renderCommandFailure(
				caps,
				outcome,
				`Could not restore Graphite tip branch \`${outcome.branch}\`.`,
			);
	}
}

function renderCommandFailure(
	caps: Parameters<typeof renderGitResultBlock>[0],
	failure: StackSquashCommandFailure,
	headline: string,
): string {
	return renderGitResultBlock(caps, {
		kind: "failure",
		headline,
		command: formatCommand(failure.command, failure.args),
		cwd: failure.cwd,
		result: failure.execResult,
	});
}
