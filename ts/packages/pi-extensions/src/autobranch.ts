import {
	commitPreparedCheckpointMessageWithAsdlDev,
	prepareCheckpointMessageWithAsdlDev,
	type CommandResult,
	type ExtensionExec,
} from "./asdl-dev-checkpoint.ts";
import { createAutobranchCheckpointFlow, parseAutobranchArgs } from "./autobranch-flow.ts";
import type { ParsedAutobranchArgs } from "./autobranch-preparation.ts";

const COMMAND_NAME = "code:autobranch";
const STATUS_KEY = "autobranch";

export type ExtensionCommandContext = {
	cwd: string;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
};

export type ExtensionAPI = ExtensionExec & {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: ExtensionCommandContext): Promise<void> | void;
		},
	): void;
};

export default function autobranchExtension(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Create a Graphite branch from current uncommitted changes, generating the branch name and checkpoint commit message",
		handler: async (args, ctx) => {
			await createAutobranchCheckpoint(pi, ctx, parseAutobranchArgs(args));
		},
	});
}

async function createAutobranchCheckpoint(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: ParsedAutobranchArgs): Promise<void> {
	await ctx.waitForIdle();
	await createAutobranchCheckpointFlow({
		cwd: ctx.cwd,
		args,
		exec: (command, commandArgs, cwd, timeout) => exec(pi, command, commandArgs, cwd, timeout),
		prepareCheckpointMessage: (snapshot) => prepareCheckpointMessageWithAsdlDev(snapshot),
		commitPreparedCheckpointMessage: (message) => commitPreparedCheckpointMessageWithAsdlDev(pi, ctx.cwd, message),
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
