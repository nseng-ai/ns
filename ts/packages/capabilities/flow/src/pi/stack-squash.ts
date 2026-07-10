import { commandSucceeded } from "@nseng-ai/foundation/command";
import { formatCommandOutput, notifyCommandUi } from "@nseng-ai/pi/commands/helpers";
import {
	registerCommandWithImmediateAck,
	sendCommandProgressOrNotify,
} from "@nseng-ai/pi/commands/ack";
import { definePiSurfaceParity } from "@nseng-ai/pi/parity/extension";

import {
	describeStackSquashOutcome,
	formatStackSquashSummary,
	runStackSquashFlow,
	type StackSquashCommandFailure,
} from "../stack-squash/stack-squash.ts";
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
				await runStackSquash(pi, ctx);
			},
		},
	});
}

export async function runStackSquash(
	pi: StackSquashExtensionAPI,
	ctx: FlowCommandContext,
): Promise<void> {
	const outcome = await runStackSquashFlow(
		{ exec: (command, args, options) => pi.exec(command, args, options) },
		{
			cwd: ctx.cwd,
			onProgress: (message) => sendCommandProgressOrNotify({ host: pi, ctx, message }),
		},
	);

	switch (outcome.kind) {
		case "success":
			notifyCommandUi(ctx, formatStackSquashSummary(outcome.processed), "info");
			return;
		case "worktree-probe-failed":
			notifyCommandUi(
				ctx,
				formatFailureMessage(describeStackSquashOutcome(outcome), outcome),
				"error",
			);
			return;
		case "worktree-dirty":
			notifyCommandUi(ctx, `${describeStackSquashOutcome(outcome)}\n\n${outcome.status}`, "error");
			return;
		case "stack-discovery-failed":
			notifyCommandUi(ctx, formatDiscoveryFailure(outcome), "error");
			return;
		case "empty-stack":
			notifyCommandUi(ctx, describeStackSquashOutcome(outcome), "info");
			return;
		case "checkout-failed":
		case "squash-failed":
		case "tip-restore-failed":
			notifyCommandUi(
				ctx,
				formatFailureMessage(describeStackSquashOutcome(outcome), outcome),
				"error",
			);
	}
}

function formatDiscoveryFailure(
	outcome: Extract<
		Awaited<ReturnType<typeof runStackSquashFlow>>,
		{ kind: "stack-discovery-failed" }
	>,
): string {
	const message = describeStackSquashOutcome(outcome);
	if (commandSucceeded(outcome.execResult)) return message;
	return `${message}\n\n${formatCommandOutput(outcome.execResult)}`;
}

function formatFailureMessage(message: string, failure: StackSquashCommandFailure): string {
	return [message, formatCommandOutput(failure.execResult)]
		.filter((part) => part.length > 0)
		.join("\n\n");
}
