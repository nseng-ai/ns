import { commitPreparedCheckpointMessage, prepareCheckpointMessageForPi, type ExtensionAPI, type ExtensionCommandContext } from "./cp.ts";
import type { CommandResult } from "./checkpoint-flow.ts";
import { createNewBranchCheckpointFlow, parseNewBranchArgs, type ParsedNewBranchArgs } from "./newbr-flow.ts";

const COMMAND_NAME = "newbr";
const STATUS_KEY = "newbr";

export default function newBranchExtension(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Create a Graphite branch from the current diff, then checkpoint it with /cp logic",
		handler: async (args, ctx) => {
			await createNewBranchCheckpoint(pi, ctx, parseNewBranchArgs(args));
		},
	});
}

async function createNewBranchCheckpoint(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: ParsedNewBranchArgs): Promise<void> {
	await ctx.waitForIdle();
	await createNewBranchCheckpointFlow({
		cwd: ctx.cwd,
		args,
		exec: (command, commandArgs, cwd, timeout) => exec(pi, command, commandArgs, cwd, timeout),
		prepareCheckpointMessage: (status, diff) => prepareCheckpointMessageForPi(pi, ctx, status, diff),
		commitPreparedCheckpointMessage: (message) => commitPreparedCheckpointMessage(pi, ctx.cwd, message),
		notify: (message, level) => notify(ctx, message, level),
		setStatus: (message) => setStatus(ctx, message),
	});
}

async function exec(
	pi: ExtensionAPI,
	command: string,
	args: string[],
	cwd: string,
	timeout: number,
): Promise<CommandResult> {
	return pi.exec(command, args, { cwd, timeout });
}

function notify(ctx: ExtensionCommandContext, message: string, level: "info" | "warning" | "error" | "success"): void {
	ctx.ui.notify(message, level === "success" ? "info" : level);
}

function setStatus(ctx: ExtensionCommandContext, message: string | undefined): void {
	ctx.ui.setStatus(STATUS_KEY, message);
}
