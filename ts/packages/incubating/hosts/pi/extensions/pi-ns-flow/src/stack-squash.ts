import {
	runFlowStackSquash,
	type FlowStackSquashPresentation,
	type RunFlowStackSquashOptions,
} from "@nseng-ai/flow/api";
import {
	registerCommandWithImmediateAck,
	sendCommandProgressOrNotify,
} from "@nseng-ai/pi-runtime/commands/ack";
import { notifyCommandUi } from "@nseng-ai/pi-runtime/commands/helpers";
import { definePiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";
import {
	createPiCommandExecApi,
	type RawPiExecApi,
} from "@nseng-ai/pi-runtime/shared/command-exec";

import type { FlowCommandContext, FlowRegisteredCommand } from "./command-support.ts";

export const STACK_SQUASH_COMMAND_NAME = "gt:squash-stack";

export const stackSquashParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: STACK_SQUASH_COMMAND_NAME,
		workflow: "Squash each branch in the current Graphite stack to one commit from top to bottom",
		parity: "FULL",
		cli: "ns flow gt squash-stack",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-flow",
		sourceModule: "stack-squash",
		notes: "Pi command is a thin adapter over the shared stack-squash flow.",
	},
] as const);

export interface StackSquashExtensionAPI extends RawPiExecApi {
	registerCommand(name: string, options: FlowRegisteredCommand): void;
}

export type RunFlowStackSquash = (
	options: RunFlowStackSquashOptions,
) => Promise<FlowStackSquashPresentation>;

export function stackSquashExtension(pi: StackSquashExtensionAPI): void {
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
		options: { delivery: "message" },
	});
}

export default stackSquashExtension;

export async function runStackSquash(
	pi: StackSquashExtensionAPI,
	ctx: FlowCommandContext,
	run: RunFlowStackSquash = runFlowStackSquash,
): Promise<void> {
	const presentation = await run({
		execApi: createPiCommandExecApi(pi),
		cwd: ctx.cwd,
		env: process.env,
		onProgress: (message) => sendCommandProgressOrNotify({ host: pi, ctx, message }),
	});
	notifyCommandUi(ctx, presentation.message, presentation.type);
}
