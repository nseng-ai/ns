import { formatErrorMessage } from "@asdl/core/primitives";

import {
	commitPreparedCheckpointMessageWithAsdlDev,
	prepareCheckpointMessageWithAsdlDev,
	type ExtensionExec,
} from "./autobranch/asdl-dev-checkpoint.ts";
import { createAutobranchCheckpointFlow, parseAutobranchArgs, type AutobranchFlowInput } from "./autobranch/flow.ts";
import type { ParsedAutobranchArgs } from "./autobranch/preparation.ts";

const COMMAND_NAME = "code:autobranch";
const STATUS_KEY = "autobranch";
const AUTOBRANCH_CLI_TIMEOUT_MS = 10 * 60 * 1000;

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
	): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>;
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
			await runAutobranchCli(pi, ctx, args);
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

async function runAutobranchCli(pi: AutobranchExtensionAPI, ctx: AutobranchCommandContext, argsText: string): Promise<void> {
	await ctx.waitForIdle();
	setStatus(ctx, STATUS_KEY, "running ccc exec autobranch…");
	try {
		const result = await pi.exec("ccc", buildAutobranchCliArgs(argsText), {
			cwd: ctx.cwd,
			timeout: AUTOBRANCH_CLI_TIMEOUT_MS,
		});
		renderCliResult(ctx, result);
	} catch (error) {
		notify(ctx, `Could not run ccc exec autobranch: ${formatErrorMessage(error)}`, "error");
	} finally {
		setStatus(ctx, STATUS_KEY, undefined);
	}
}

function buildAutobranchCliArgs(argsText: string): string[] {
	const parsed = parseAutobranchArgs(argsText);
	const args = ["exec", "autobranch"];
	if (parsed.slug !== undefined) {
		args.push("--slug", parsed.slug);
	}
	return args;
}

function renderCliResult(
	ctx: AutobranchCommandContext,
	result: { stdout: string; stderr: string; code: number; killed: boolean },
): void {
	const stdout = result.stdout.trimEnd();
	const stderr = result.stderr.trimEnd();
	if (stdout.length > 0) {
		notify(ctx, stdout, result.code === 0 ? "info" : "error");
	}
	if (stderr.length > 0) {
		notify(ctx, stderr, result.code === 0 ? "warning" : "error");
	}
	if (result.killed) {
		notify(ctx, `ccc exec autobranch timed out after ${AUTOBRANCH_CLI_TIMEOUT_MS / 1000}s.`, "error");
		return;
	}
	if (result.code !== 0 && stdout.length === 0 && stderr.length === 0) {
		notify(ctx, `ccc exec autobranch failed with exit code ${result.code}.`, "error");
	}
}

function notify(ctx: AutobranchCommandContext, message: string, level: "info" | "warning" | "error" | "success"): void {
	ctx.ui.notify(message, level === "success" ? "info" : level);
}

function setStatus(ctx: AutobranchCommandContext, statusKey: string, message: string | undefined): void {
	ctx.ui.setStatus(statusKey, message);
}
