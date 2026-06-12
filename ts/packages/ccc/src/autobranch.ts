import { formatErrorMessage } from "@asdl/core/primitives";
import type { PendingWorktreeSnapshot } from "asdl-dev/pending-worktree";

import {
	commitPreparedCheckpointMessageWithAsdlDev,
	prepareCheckpointMessageWithAsdlDev,
	type ExtensionExec,
	type PreparedCheckpointMessage,
} from "./autobranch/asdl-dev-checkpoint.ts";
import { createAutobranchCheckpointFlow, parseAutobranchArgs, type AutobranchFlowInput } from "./autobranch/flow.ts";
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

export interface AutobranchExtensionAPI {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<{ stdout: string; stderr: string; code: number; killed?: boolean }>;
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: AutobranchCommandContext): Promise<void> | void;
		},
	): void;
}

type NoticeLevel = "info" | "warning" | "error" | "success";
type PrepareCheckpointMessage = (snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">) => Promise<PreparedCheckpointMessage>;
type CommitPreparedCheckpointMessage = (message: string) => Promise<{ summary: string } | { error: string }>;

export interface AutobranchCommandDeps {
	prepareCheckpointMessage?: PrepareCheckpointMessage | undefined;
	commitPreparedCheckpointMessage?: CommitPreparedCheckpointMessage | undefined;
	now?: (() => number) | undefined;
}

export function registerAutobranchCommand(pi: AutobranchExtensionAPI, deps: AutobranchCommandDeps = {}): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Create a Graphite branch from current uncommitted changes, or from the latest commit when the worktree is clean",
		handler: async (args, ctx) => {
			await runAutobranchFlow(pi, ctx, args, deps);
		},
	});
}

export interface BuildAutobranchFlowInputOptions {
	pi: ExtensionExec;
	ctx: AutobranchCommandContext;
	args: ParsedAutobranchArgs;
	statusKey?: string;
}

export function buildAutobranchFlowInput({
	pi,
	ctx,
	args,
	statusKey = STATUS_KEY,
}: BuildAutobranchFlowInputOptions): AutobranchFlowInput {
	return {
		cwd: ctx.cwd,
		args,
		exec: (command, commandArgs, cwd, timeout) => pi.exec(command, commandArgs, { cwd, timeout }),
		prepareCheckpointMessage: (snapshot) => prepareCheckpointMessageWithAsdlDev(snapshot),
		commitPreparedCheckpointMessage: (message) => commitPreparedCheckpointMessageWithAsdlDev(pi, ctx.cwd, message),
		notify: (message, level) => notify(ctx, message, level),
		setStatus: (message) => setStatus(ctx, statusKey, message),
	};
}

async function runAutobranchFlow(
	pi: AutobranchExtensionAPI,
	ctx: AutobranchCommandContext,
	argsText: string,
	deps: AutobranchCommandDeps,
): Promise<void> {
	await ctx.waitForIdle();
	try {
		await createAutobranchCheckpointFlow({
			cwd: ctx.cwd,
			args: parseAutobranchArgs(argsText),
			exec: (command, args, cwd, timeout) => pi.exec(command, args, { cwd, timeout }),
			prepareCheckpointMessage: deps.prepareCheckpointMessage ?? ((snapshot) => prepareCheckpointMessageWithAsdlDev(snapshot)),
			commitPreparedCheckpointMessage: deps.commitPreparedCheckpointMessage ?? ((message) => commitPreparedCheckpointMessageWithAsdlDev(pi, ctx.cwd, message)),
			notify: (message, level) => notify(ctx, message, level),
			setStatus: (message) => setStatus(ctx, STATUS_KEY, message),
			...(deps.now === undefined ? {} : { now: deps.now }),
		});
	} catch (error) {
		notify(ctx, `Could not run /${COMMAND_NAME}: ${formatErrorMessage(error)}`, "error");
	} finally {
		setStatus(ctx, STATUS_KEY, undefined);
	}
}

function notify(ctx: AutobranchCommandContext, message: string, level: NoticeLevel): void {
	ctx.ui.notify(message, level === "success" ? "info" : level);
}

function setStatus(ctx: AutobranchCommandContext, statusKey: string, message: string | undefined): void {
	ctx.ui.setStatus(statusKey, message);
}
