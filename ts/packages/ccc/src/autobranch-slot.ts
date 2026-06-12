import {
	commitPreparedCheckpointMessageWithAsdlDev,
	prepareCheckpointMessageWithAsdlDev,
	type ExtensionExec,
} from "./autobranch/asdl-dev-checkpoint.ts";
import { createAutobranchCheckpointFlow, parseAutobranchArgs, type AutobranchFlowInput } from "./autobranch/flow.ts";
import type { ParsedAutobranchArgs } from "./autobranch/preparation.ts";
import { checkoutCurrentSlot, type SlotCheckoutCurrentExecAPI } from "./slot-checkout-current.ts";

const COMMAND_NAME = "code:autoslot";
const STATUS_KEY = "autoslot";

export interface AutobranchSlotCommandContext {
	cwd: string;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
}

export interface AutobranchSlotExtensionAPI extends ExtensionExec, SlotCheckoutCurrentExecAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: AutobranchSlotCommandContext): Promise<void> | void;
		},
	): void;
}

export interface AutobranchSlotFlowInput extends AutobranchFlowInput {
	slotExec: SlotCheckoutCurrentExecAPI;
}

export function registerAutobranchSlotCommand(pi: AutobranchSlotExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Create an autobranch, then move the new branch into a managed slot worktree",
		handler: async (args, ctx) => {
			await createAutobranchSlot(pi, ctx, parseAutobranchArgs(args));
		},
	});
}

export async function createAutobranchSlotFlow(input: AutobranchSlotFlowInput): Promise<void> {
	const autobranch = await createAutobranchCheckpointFlow(input);
	if (!autobranch.ok) {
		return;
	}

	if (!autobranch.isCleanAfter) {
		input.notify(
			[
				`Autobranch completed for ${autobranch.branchName}, but slot movement was skipped.`,
				"The worktree is not clean after autobranch; `slot checkout --current` requires a clean worktree.",
			].join("\n"),
			"warning",
		);
		return;
	}

	input.setStatus("checking out current branch slot…");
	try {
		const slot = await checkoutCurrentSlot(input.slotExec, input.cwd);
		if (!slot.ok) {
			input.notify([`Autobranch created ${autobranch.branchName}, but slot checkout failed.`, "", slot.error].join("\n"), "error");
			return;
		}

		input.notify(
			[
				"Autobranch moved to slot.",
				`Branch: ${slot.target.branchName}`,
				`Slot: ${slot.target.slotName}`,
				`Worktree: ${slot.target.worktreePath}`,
				`Next: ${slot.target.cdCommand}`,
			].join("\n"),
			"info",
		);
	} finally {
		input.setStatus(undefined);
	}
}

async function createAutobranchSlot(pi: AutobranchSlotExtensionAPI, ctx: AutobranchSlotCommandContext, args: ParsedAutobranchArgs): Promise<void> {
	await ctx.waitForIdle();
	try {
		await createAutobranchSlotFlow({
			cwd: ctx.cwd,
			args,
			exec: (command, commandArgs, cwd, timeout) => pi.exec(command, commandArgs, { cwd, timeout }),
			slotExec: pi,
			prepareCheckpointMessage: (snapshot) => prepareCheckpointMessageWithAsdlDev(snapshot),
			commitPreparedCheckpointMessage: (message) => commitPreparedCheckpointMessageWithAsdlDev(pi, ctx.cwd, message),
			notify: (message, level) => notify(ctx, message, level),
			setStatus: (message) => setStatus(ctx, message),
		});
	} finally {
		setStatus(ctx, undefined);
	}
}

function notify(ctx: AutobranchSlotCommandContext, message: string, level: "info" | "warning" | "error" | "success"): void {
	ctx.ui.notify(message, level === "success" ? "info" : level);
}

function setStatus(ctx: AutobranchSlotCommandContext, message: string | undefined): void {
	ctx.ui.setStatus(STATUS_KEY, message);
}
