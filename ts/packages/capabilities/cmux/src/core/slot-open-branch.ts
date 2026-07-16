import {
	confirmInferredBranchContext,
	resolveInferredBranchContext,
	type BranchContextEvidence,
} from "@nseng-ai/branch-context/api";

import { extractSlashCommandArgumentPrefix } from "@nseng-ai/capability-kit/branch-completions";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import { CMUX_WORKSPACE_OPEN_BRANCH_COMMAND_NAME } from "./command-surfaces.ts";
import { openBranchInCmuxSlot } from "./slot.ts";
import { createCccSlotClient } from "./slot-checkout.ts";
import type { SlotClient } from "@nseng-ai/slots/api";
import type { CommandContext } from "@nseng-ai/capability-kit/cmux/types";

type ResolvedBranch =
	| { inferred: false; branchName: string }
	| { inferred: true; branchName: string; evidence: BranchContextEvidence }
	| { error: string };

export interface CccSlotOpenBranchOptions {
	slotClient?: SlotClient;
}

export interface HandleCccSlotOpenBranchOptions {
	pi: CommandExecApi;
	args: string;
	ctx: CommandContext;
	options?: CccSlotOpenBranchOptions;
	notifyProgress: (message: string) => void;
}

const COMMAND_NAME = CMUX_WORKSPACE_OPEN_BRANCH_COMMAND_NAME;

export async function handleCccSlotOpenBranch(
	options: HandleCccSlotOpenBranchOptions,
): Promise<void> {
	const { pi, args, ctx } = options;
	const explicitBranch = args.trim();
	options.notifyProgress(
		explicitBranch.length > 0
			? `Opening cmux workspace for ${explicitBranch}…`
			: "Resolving branch context to open…",
	);
	await ctx.waitForIdle();

	const resolved: ResolvedBranch =
		explicitBranch.length > 0
			? { branchName: explicitBranch, inferred: false }
			: resolveInferredBranch(ctx);

	if ("error" in resolved) {
		ctx.ui.notify(resolved.error, "error");
		return;
	}

	if (resolved.inferred) {
		const confirmed = await confirmInferredBranchContext(ctx, {
			commandName: COMMAND_NAME,
			evidence: resolved.evidence,
			destinationDescription: "open it in a new cmux workspace",
		});
		if (!confirmed) {
			ctx.ui.notify("Cancelled; no cmux workspace was opened.", "info");
			return;
		}
	}

	const branch = resolved.branchName;
	if (resolved.inferred) {
		options.notifyProgress(`Opening cmux workspace for ${branch}…`);
	}

	const launched = await openBranchInCmuxSlot({
		pi,
		cwd: ctx.cwd,
		branchName: branch,
		slotClient: options.options?.slotClient ?? createCccSlotClient({ cwd: ctx.cwd }),
		notify: (message, level) => ctx.ui.notify(message, level),
	});
	if ("error" in launched) {
		return;
	}
}

function resolveInferredBranch(ctx: {
	sessionManager?: { getBranch?: () => unknown[] };
}): ResolvedBranch {
	const resolution = resolveInferredBranchContext(ctx);
	if (resolution.type === "none") {
		return {
			error: `Usage: /${COMMAND_NAME} <branch>\nNo latest [branch-context-output] branch found in the current session branch.`,
		};
	}
	return { inferred: true, branchName: resolution.branchName, evidence: resolution.evidence };
}

export function extractCommandArgumentPrefix(textBeforeCursor: string): string | undefined {
	return extractSlashCommandArgumentPrefix(COMMAND_NAME, textBeforeCursor);
}

export { getBranchCompletions } from "@nseng-ai/capability-kit/branch-completions";
