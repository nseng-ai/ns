import { formatCommandOutput, notifyCommandUi } from "@nseng-ai/pi-runtime/commands/helpers";
import {
	registerCommandWithImmediateAck,
	sendCommandProgressOrNotify,
} from "@nseng-ai/pi-runtime/commands/ack";
import { definePiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";
import { createPiCommandExecApi } from "@nseng-ai/pi-runtime/shared/command-exec";

import {
	describeStackSquashOutcome,
	formatStackSquashSummary,
	runStackSquashFlow,
	stackSquashCommandFailureDetail,
	type StackSquashCommandFailure,
	type StackSquashGraphiteGateway,
} from "../stack-squash/stack-squash.ts";
import { createFlowGraphiteStackGateway } from "../stack-squash/graphite-stack-gateway.ts";
import { type FlowCommandContext, type FlowRegisteredCommand } from "./command-support.ts";
import type { FlowGraphiteCommandHost } from "./graphite-command.ts";

export const STACK_SQUASH_COMMAND_NAME = "gt:squash-stack";

export const stackSquashParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: STACK_SQUASH_COMMAND_NAME,
		workflow: "Squash each branch in the current Graphite stack to one commit from top to bottom",
		parity: "FULL",
		cli: "ns flow squash-stack",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/flow/pi",
		sourceModule: "stack-squash",
		notes: "Pi command is a thin adapter over the shared stack-squash flow.",
	},
] as const);

export interface StackSquashExtensionAPI extends FlowGraphiteCommandHost {
	registerCommand(name: string, options: FlowRegisteredCommand): void;
}

export default function stackSquashExtension(pi: StackSquashExtensionAPI): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: STACK_SQUASH_COMMAND_NAME,
		commandDefinition: {
			description:
				"Run gt squash on every branch in the current stack from the tip down to the bottom",
			handler: async (_args, ctx) => {
				await ctx.waitForIdle?.();
				const execApi = createPiCommandExecApi(pi);
				await runStackSquash(
					pi,
					ctx,
					createFlowGraphiteStackGateway({ execApi, env: process.env }),
				);
			},
		},
		options: { delivery: "message" },
	});
}

export async function runStackSquash(
	pi: StackSquashExtensionAPI,
	ctx: FlowCommandContext,
	graphite: StackSquashGraphiteGateway,
): Promise<void> {
	const outcome = await runStackSquashFlow(
		{ exec: (command, args, options) => createPiCommandExecApi(pi).exec(command, args, options) },
		graphite,
		{
			cwd: ctx.cwd,
			onProgress: (message) => sendCommandProgressOrNotify({ host: pi, ctx, message }),
		},
	);

	switch (outcome.kind) {
		case "success":
			notifyCommandUi(ctx, formatStackSquashSummary(outcome.processed), "info");
			return;
		case "worktree-dirty":
			notifyCommandUi(ctx, `${describeStackSquashOutcome(outcome)}\n\n${outcome.status}`, "error");
			return;
		case "empty-stack":
			notifyCommandUi(ctx, describeStackSquashOutcome(outcome), "info");
			return;
		case "worktree-probe-failed":
		case "stack-discovery-failed":
		case "checkout-failed":
		case "squash-failed":
		case "tip-restore-failed": {
			const message = describeStackSquashOutcome(outcome);
			const failure = stackSquashCommandFailureDetail(outcome);
			notifyCommandUi(
				ctx,
				failure === undefined ? message : formatFailureMessage(message, failure),
				"error",
			);
		}
	}
}

function formatFailureMessage(message: string, failure: StackSquashCommandFailure): string {
	return [message, formatCommandOutput(failure.execResult)]
		.filter((part) => part.length > 0)
		.join("\n\n");
}
