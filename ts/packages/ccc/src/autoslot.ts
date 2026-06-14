import process from "node:process";

import type { ExtensionAPI } from "@asdl/pi-extension-runtime/cmux/types";
import {
	commitPreparedCheckpointMessageWithAsdlDev,
	prepareCheckpointMessageWithAsdlDev,
} from "./autobranch/asdl-dev-checkpoint.ts";
import { createAutobranchCheckpointFlow, type AutobranchFlowInput } from "./autobranch/flow.ts";
import type { ParsedAutobranchArgs } from "./autobranch/preparation.ts";
import { checkoutSlot } from "./slot-checkout.ts";

const COMMAND_NAME = "code:autoslot";
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
	notify: (message: string, level?: "info" | "warning" | "error") => void;
	setStatus: (message: string | undefined) => void;
}

export function registerAutoslotCommand(pi: AutoslotExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Create a Graphite branch from current work, then move it into a managed slot worktree",
		handler: async (args, ctx) => {
			await createAutoslot(pi, ctx, parseAutobranchArgs(args));
		},
	});
}

export async function createAutoslotFlow(input: AutoslotFlowInput): Promise<void> {
	const createdBranch = await createAutobranchCheckpointFlow(input);
	if (!createdBranch.ok) {
		input.notify(createdBranch.error, "error");
		return;
	}

	for (const warning of createdBranch.warnings) {
		input.notify(warning, "warning");
	}

	const branchName = parseCreatedBranchName(createdBranch.summary);
	const isCleanAfter = createdBranch.summary.includes("Working directory is clean.");
	if (!isCleanAfter) {
		input.notify(
			[
				`Autoslot created ${branchName}, but slot movement was skipped.`,
				"The worktree is not clean; `slot checkout --current` requires a clean worktree.",
			].join("\n"),
			"warning",
		);
		return;
	}

	input.setStatus("checking out branch slot…");
	try {
		const slot = await checkoutSlot(input.slotExec, input.cwd, { kind: "current" });
		if (!slot.ok) {
			input.notify([`Autoslot created ${branchName}, but slot checkout failed.`, "", slot.error].join("\n"), "error");
			return;
		}

		input.notify(
			[
				`Autoslot moved ${slot.target.branchName} to ${slot.target.slotName}.`,
				`Worktree: ${slot.target.worktreePath}`,
				`slot co ${slot.target.branchName}`,
			].join("\n"),
			"info",
		);
	} finally {
		input.setStatus(undefined);
	}
}

function parseCreatedBranchName(summary: string): string {
	const firstLine = summary.split("\n")[0] ?? "";
	return firstLine.replace(/^New branch: /, "").replace(/ \(base slug .*\)$/, "");
}

async function createAutoslot(pi: AutoslotExtensionAPI, ctx: AutobranchCommandContext, args: ParsedAutobranchArgs): Promise<void> {
	await ctx.waitForIdle();
	try {
		await createAutoslotFlow({
			cwd: ctx.cwd,
			args,
			exec: (command, commandArgs, cwd, timeout) => pi.exec(command, commandArgs, { cwd, timeout }),
			prepareCheckpointMessage: (snapshot) => prepareCheckpointMessageWithAsdlDev(snapshot, process.env),
			commitPreparedCheckpointMessage: (message) =>
				commitPreparedCheckpointMessageWithAsdlDev(
					(command, commandArgs, commandCwd, timeout) => pi.exec(command, commandArgs, { cwd: commandCwd, timeout }),
					ctx.cwd,
					message,
				),
			notify: (message, level) => {
				ctx.ui.notify(message, level);
			},
			setStatus: (message) => {
				ctx.ui.setStatus(STATUS_KEY, message);
			},
			slotExec: pi,
		});
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
