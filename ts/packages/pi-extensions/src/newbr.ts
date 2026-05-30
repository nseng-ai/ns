import type { CommandResult } from "./checkpoint-flow.ts";
import { commitPreparedCheckpointMessage, prepareCheckpointMessageForPi, type ExtensionAPI, type ExtensionCommandContext } from "./checkpoint-pi.ts";
import { createNewBranchCheckpointFlow, parseNewBranchArgs } from "./newbr-flow.ts";
import type { ParsedNewBranchArgs } from "./newbr-preparation.ts";

const COMMAND_NAME = "dev:autobranch";
const STATUS_KEY = "autobranch";

export default function newBranchExtension(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Create a Graphite branch from current uncommitted changes, generating the branch name and checkpoint commit message",
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
		prepareCheckpointMessage: (snapshot) => prepareCheckpointMessageForPi(pi, ctx, snapshot),
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
