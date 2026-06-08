import {
	commitPreparedCheckpointMessageWithAsdlDev,
	prepareCheckpointMessageWithAsdlDev,
	type ExtensionExec,
} from "./autobranch/asdl-dev-checkpoint.ts";
import { createAutobranchCheckpointFlow, parseAutobranchArgs } from "./autobranch/flow.ts";
import type { ParsedAutobranchArgs } from "./autobranch/preparation.ts";

const COMMAND_NAME = "code:autobranch";
const STATUS_KEY = "autobranch";

export interface AutobranchCommandContext {
	cwd: string;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
}

export interface AutobranchExtensionAPI extends ExtensionExec {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: AutobranchCommandContext): Promise<void> | void;
		},
	): void;
}

export function registerAutobranchCommand(pi: AutobranchExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Create a Graphite branch from current uncommitted changes, or from the latest commit when the worktree is clean",
		handler: async (args, ctx) => {
			await createAutobranchCheckpoint(pi, ctx, parseAutobranchArgs(args));
		},
	});
}

async function createAutobranchCheckpoint(pi: AutobranchExtensionAPI, ctx: AutobranchCommandContext, args: ParsedAutobranchArgs): Promise<void> {
	await ctx.waitForIdle();
	await createAutobranchCheckpointFlow({
		cwd: ctx.cwd,
		args,
		exec: (command, commandArgs, cwd, timeout) => pi.exec(command, commandArgs, { cwd, timeout }),
		prepareCheckpointMessage: (snapshot) => prepareCheckpointMessageWithAsdlDev(snapshot),
		commitPreparedCheckpointMessage: (message) => commitPreparedCheckpointMessageWithAsdlDev(pi, ctx.cwd, message),
		notify: (message, level) => notify(ctx, message, level),
		setStatus: (message) => setStatus(ctx, message),
	});
}


function notify(ctx: AutobranchCommandContext, message: string, level: "info" | "warning" | "error" | "success"): void {
	ctx.ui.notify(message, level === "success" ? "info" : level);
}

function setStatus(ctx: AutobranchCommandContext, message: string | undefined): void {
	ctx.ui.setStatus(STATUS_KEY, message);
}
