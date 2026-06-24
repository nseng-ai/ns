import process from "node:process";

import type { ParsedAutobranchArgs } from "@sdl/autobranch/dirty-worktree";
import { runWithCommandIo, type CommandIo } from "@sdl/core/command-io";
import {
	sendCommandProgressOrNotify,
	registerCommandWithImmediateAck,
} from "@sdl/pi-extension-runtime/command-ack";
import { commandIoFromPiContext } from "@sdl/pi-extension-runtime/command-io";
import type { ExtensionAPI } from "@sdl/pi-extension-runtime/cmux/types";
import {
	commitAutobranchCheckpointMessage,
	prepareAutobranchCheckpointMessage,
} from "./autobranch/checkpoint.ts";
import { createAutobranchCheckpointFlow, type AutobranchFlowInput } from "./autobranch/flow.ts";
import { startIdleWaitStatus } from "./idle-wait-status.ts";
import { checkoutSlot } from "./slot-checkout.ts";

const COMMAND_NAME = "sdl:flow:autoslot";
const STATUS_KEY = "autoslot";

export interface AutobranchCommandContext {
	cwd: string;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
}

export interface AutoslotExtensionAPI extends Pick<ExtensionAPI, "exec"> {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: AutobranchCommandContext): Promise<void> | void;
		},
	): void;
}

export interface AutoslotFlowInput extends AutobranchFlowInput {
	slotExec: Pick<ExtensionAPI, "exec">;
	io: CommandIo;
}

export interface AutoslotCliInput {
	cwd: string;
	env: Record<string, string | undefined>;
	args: ParsedAutobranchArgs;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string | undefined; timeout?: number | undefined },
	): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>;
	stdout(text: string): void;
	stderr(text: string): void;
	onOutput?: ((stream: "stdout" | "stderr", text: string) => void) | undefined;
}

export function registerAutoslotCommand(pi: AutoslotExtensionAPI): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description:
				"Create a Graphite branch from current work, then move it into a managed slot worktree",
			handler: async (args, ctx) => {
				await createAutoslot(pi, ctx, parseAutobranchArgs(args));
			},
		},
	});
}

export async function runAutoslotCli(input: AutoslotCliInput): Promise<number> {
	let hasError = false;
	const io = createAutoslotCliCommandIo(input, () => {
		hasError = true;
	});
	await runWithCommandIo(
		io,
		async (io) =>
			await createAutoslotFlow({
				cwd: input.cwd,
				args: input.args,
				exec: (command, commandArgs, timeout) =>
					input.exec(command, commandArgs, { cwd: input.cwd, timeout }),
				prepareCheckpointMessage: (snapshot) =>
					prepareAutobranchCheckpointMessage(snapshot, input.env),
				commitPreparedCheckpointMessage: (message) =>
					commitAutobranchCheckpointMessage(
						(command, commandArgs, commandCwd, timeout) =>
							input.exec(command, commandArgs, { cwd: commandCwd, timeout }),
						input.cwd,
						message,
					),
				io,
				slotExec: {
					exec: (command, args, options) => input.exec(command, args, options),
				},
			}),
	);
	return hasError ? 1 : 0;
}

export async function createAutoslotFlow(input: AutoslotFlowInput): Promise<void> {
	const createdBranch = await createAutobranchCheckpointFlow({
		...input,
		onPhase: (message) => {
			input.io.phase(message);
		},
	});
	if (!createdBranch.ok) {
		input.io.notify(createdBranch.error, "error");
		return;
	}

	for (const warning of createdBranch.warnings) {
		input.io.notify(warning, "warning");
	}

	const branchName = parseCreatedBranchName(createdBranch.summary);
	const isCleanAfter = createdBranch.summary.includes("Working directory is clean.");
	if (!isCleanAfter) {
		input.io.notify(
			[
				`Autoslot created ${branchName}, but slot movement was skipped.`,
				"The worktree is not clean; `slot checkout --current` requires a clean worktree.",
			].join("\n"),
			"warning",
		);
		return;
	}

	input.io.phase("Checking out branch slot…");
	const slot = await checkoutSlot(input.slotExec, input.cwd, { kind: "current" });
	if (!slot.ok) {
		input.io.notify(
			[`Autoslot created ${branchName}, but slot checkout failed.`, "", slot.error].join("\n"),
			"error",
		);
		return;
	}

	input.io.notify(
		[
			`Autoslot moved ${slot.target.branchName} to ${slot.target.slotName}.`,
			`Worktree: ${slot.target.worktreePath}`,
			`slot co ${slot.target.branchName}`,
		].join("\n"),
		"info",
	);
}

function createAutoslotCliCommandIo(input: AutoslotCliInput, onError: () => void): CommandIo {
	return {
		phase: (message) => {
			const line = `${message}\n`;
			if (input.onOutput !== undefined) {
				input.onOutput("stderr", line);
				return;
			}
			input.stderr(line);
		},
		notify: (message, level = "info") => {
			const output = `${message.trimEnd()}\n`;
			if (level === "error") {
				onError();
				input.stderr(output);
				return;
			}
			if (level === "warning") {
				input.stderr(output);
				return;
			}
			input.stdout(output);
		},
		clearPhase: () => {},
	};
}

function parseCreatedBranchName(summary: string): string {
	const firstLine = summary.split("\n")[0] ?? "";
	return firstLine.replace(/^New branch: /, "").replace(/ \(base slug .*\)$/, "");
}

async function createAutoslot(
	pi: AutoslotExtensionAPI,
	ctx: AutobranchCommandContext,
	args: ParsedAutobranchArgs,
): Promise<void> {
	const startMessage =
		"Starting /sdl:flow:autoslot — runs once Pi finishes its current response, then creates a branch and moves it to a slot. Interrupt Pi to run it now.";
	sendCommandProgressOrNotify({ host: pi, ctx, message: startMessage, delivery: "notify" });
	const stopIdleStatus = startIdleWaitStatus(ctx.ui, STATUS_KEY);
	try {
		try {
			await ctx.waitForIdle();
		} finally {
			stopIdleStatus();
		}
		const io = commandIoFromPiContext(ctx, { statusKey: STATUS_KEY });
		await runWithCommandIo(
			io,
			async (io) =>
				await createAutoslotFlow({
					cwd: ctx.cwd,
					args,
					exec: (command, commandArgs, timeout) =>
						pi.exec(command, commandArgs, { cwd: ctx.cwd, timeout }),
					prepareCheckpointMessage: (snapshot) =>
						prepareAutobranchCheckpointMessage(snapshot, process.env),
					commitPreparedCheckpointMessage: (message) =>
						commitAutobranchCheckpointMessage(
							(command, commandArgs, commandCwd, timeout) =>
								pi.exec(command, commandArgs, { cwd: commandCwd, timeout }),
							ctx.cwd,
							message,
						),
					io,
					slotExec: pi,
				}),
		);
	} finally {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	}
}

function parseAutobranchArgs(argsText: string): ParsedAutobranchArgs {
	const parts = argsText.trim().split(/\s+/).filter(Boolean);
	const parsed: ParsedAutobranchArgs = {};
	for (let index = 0; index < parts.length; index += 1) {
		const part = parts[index];
		const next = parts[index + 1];
		if (part === "--slug" && next) {
			parsed.slug = next;
			index += 1;
		} else if (part?.startsWith("--slug=")) {
			const value = part.slice("--slug=".length);
			if (value) {
				parsed.slug = value;
			}
		}
	}
	return parsed;
}
