import {
	commitPreparedCheckpointMessageWithAsdlDev,
	prepareCheckpointMessageWithAsdlDev,
	type ExtensionExec,
} from "./autobranch/asdl-dev-checkpoint.ts";
import { createAutobranchCheckpointFlow, parseAutobranchArgs, type AutobranchFlowInput } from "./autobranch/flow.ts";
import type { ParsedAutobranchArgs } from "./autobranch/preparation.ts";
import { checkoutAutoslot, type AutoslotCheckoutExecAPI } from "./autoslot-checkout.ts";

const COMMAND_NAME = "code:autoslot";
const STATUS_KEY = "autoslot";

export interface AutoslotCommandContext {
	cwd: string;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
}

export interface AutoslotExtensionAPI extends ExtensionExec, AutoslotCheckoutExecAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: AutoslotCommandContext): Promise<void> | void;
		},
	): void;
}

export interface AutoslotFlowInput extends AutobranchFlowInput {
	slotExec: AutoslotCheckoutExecAPI;
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
		return;
	}

	if (!createdBranch.isCleanAfter) {
		input.notify(
			[
				`Autoslot created ${createdBranch.branchName}, but slot movement was skipped.`,
				"The worktree is not clean; `slot checkout --current` requires a clean worktree.",
			].join("\n"),
			"warning",
		);
		return;
	}

	input.setStatus("checking out current branch slot…");
	try {
		const slot = await checkoutAutoslot(input.slotExec, input.cwd);
		if (!slot.ok) {
			input.notify([`Autoslot created ${createdBranch.branchName}, but slot checkout failed.`, "", slot.error].join("\n"), "error");
			return;
		}

		input.notify(
			[
				"Autoslot moved branch to slot.",
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

async function createAutoslot(pi: AutoslotExtensionAPI, ctx: AutoslotCommandContext, args: ParsedAutobranchArgs): Promise<void> {
	await ctx.waitForIdle();
	try {
		await createAutoslotFlow({
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

function notify(ctx: AutoslotCommandContext, message: string, level: "info" | "warning" | "error" | "success"): void {
	ctx.ui.notify(message, level === "success" ? "info" : level);
}

function setStatus(ctx: AutoslotCommandContext, message: string | undefined): void {
	ctx.ui.setStatus(STATUS_KEY, message);
}
