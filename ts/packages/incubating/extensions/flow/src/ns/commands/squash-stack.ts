import { NsCommandExecApi } from "@nseng-ai/extension-kit/command-runner";
import { formatCommand } from "@nseng-ai/foundation/command";
import { renderResultBlock } from "@nseng-ai/foundation/cli-theme";
import { defineCommand, negative, ok, z, type NsCommand, type NsExtensionApi } from "@nseng-ai/sdk";

import {
	describeStackSquashOutcome,
	formatStackSquashCellText,
	formatStackSquashSummary,
	runStackSquashFlow,
	stackSquashCommandFailureDetail,
	type StackSquashCommandFailure,
	type StackSquashGraphiteGateway,
	type StackSquashOutcome,
} from "../../stack-squash/stack-squash.ts";
import {
	createStackSquashMatrixProgressController,
	stackSquashCompletionUpdate,
} from "../../stack-squash/stack-squash-matrix-progress.ts";
import { flowStreamDeps, resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";
import { runFlowCliOperation } from "../flow-cli-runner.ts";
import { createFlowGraphiteStackGateway } from "../../stack-squash/graphite-stack-gateway.ts";
import { renderGitResultBlock } from "../presentation/git-result-block.ts";

const squashStackSchema = z.object({});

export const SQUASH_STACK_COMMAND_SUMMARY =
	"Squash every branch in the current Graphite stack to one commit.";

export interface FlowSquashStackCommandDependencies {
	createGraphiteStackGateway(ctx: NsExtensionApi): StackSquashGraphiteGateway;
}

export function createFlowSquashStackCommand(
	dependencies: FlowSquashStackCommandDependencies,
): NsCommand<typeof squashStackSchema> {
	return defineCommand({
		name: "squash-stack",
		summary: SQUASH_STACK_COMMAND_SUMMARY,
		description:
			"Squash every branch in the current Graphite stack from the tip down, then restore the tip branch.",
		schema: squashStackSchema,
		resultSchema: z.string(),
		renderHuman: (text) => text,
		handler: async (ctx) => {
			const caps = resolveFlowStreamCaps(ctx);
			const matrix = createStackSquashMatrixProgressController({
				caps,
				deps: flowStreamDeps(ctx, caps),
				...(ctx.progress.isLive ? { forward: ctx.progress } : {}),
			});
			try {
				const outcome = await runFlowCliOperation({
					ctx,
					run: async (commands) =>
						await runStackSquashFlow(commands, dependencies.createGraphiteStackGateway(ctx), {
							cwd: ctx.cwd,
							onProgress: matrix.note,
							onPlan: matrix.setPlan,
							onBranchStarted: (entry) =>
								matrix.setSquashStatus(entry.branch, {
									state: "active",
									text: formatStackSquashCellText(entry.commitsBefore),
								}),
							onBranchCompleted: (entry) =>
								matrix.setSquashStatus(entry.branch, stackSquashCompletionUpdate(entry)),
							onRestoreStarted: matrix.restoreStarted,
							onRestoreCompleted: matrix.restoreCompleted,
						}),
				});
				await matrix.finish({ isFailed: outcome.kind !== "success" });
				if (outcome.kind === "success") return ok(formatStackSquashSummary(outcome.processed));
				return negative(renderStackSquashNegative(caps, outcome));
			} finally {
				await matrix.stop();
			}
		},
	});
}

export const flowSquashStackCommand = createFlowSquashStackCommand({
	createGraphiteStackGateway: (ctx) => {
		const execApi = new NsCommandExecApi(ctx);
		return createFlowGraphiteStackGateway({ execApi, env: ctx.env });
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
				headline: describeStackSquashOutcome(outcome),
				command: "git status --porcelain=v1",
				cwd: outcome.cwd,
				detail: outcome.status,
			});
		case "empty-stack":
			return renderResultBlock(caps, {
				kind: "failure",
				headline: describeStackSquashOutcome(outcome),
				cwd: outcome.cwd,
			});
		case "worktree-probe-failed":
		case "stack-discovery-failed":
		case "commit-count-failed":
		case "checkout-failed":
		case "squash-failed":
		case "tip-restore-failed": {
			const headline = describeStackSquashOutcome(outcome);
			const failure = stackSquashCommandFailureDetail(outcome);
			if (failure !== undefined) return renderCommandFailure(caps, failure, headline);
			return renderResultBlock(caps, { kind: "failure", headline, cwd: outcome.cwd });
		}
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
