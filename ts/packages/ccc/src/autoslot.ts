import type { ExtensionAPI } from "@asdl/pi-extension-runtime/cmux/types";
import { buildAutobranchFlowInput, type AutobranchCommandContext } from "./autobranch.ts";
import { createAutobranchCheckpointFlow, parseAutobranchArgs, type AutobranchFlowInput } from "./autobranch/flow.ts";
import type { ParsedAutobranchArgs } from "./autobranch/preparation.ts";
import { checkoutSlot } from "./slot-checkout.ts";

const COMMAND_NAME = "code:autoslot";
const STATUS_KEY = "autoslot";

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

	input.setStatus("checking out branch slot…");
	try {
		const slot = await checkoutSlot(input.slotExec, input.cwd, { kind: "current" });
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

async function createAutoslot(pi: AutoslotExtensionAPI, ctx: AutobranchCommandContext, args: ParsedAutobranchArgs): Promise<void> {
	await ctx.waitForIdle();
	try {
		await createAutoslotFlow({
			...buildAutobranchFlowInput({ pi, ctx, args, statusKey: STATUS_KEY }),
			slotExec: pi,
		});
	} finally {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	}
}
