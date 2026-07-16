/**
 * Herdr open-branch: check out an existing branch in a new Herdr workspace.
 *
 * Mirrors the cmux workspace:open-branch workflow with Herdr-native workspace
 * opening. Preserves explicit branch selection, inference from branch-context
 * evidence, confirmation, tab completions, and ns slot checkout.
 *
 * ns owns: slot checkout, branch-context inference, branch completions.
 * Herdr owns: workspace creation.
 */
import {
	confirmInferredBranchContext,
	resolveInferredBranchContext,
	type BranchContextEvidence,
} from "@nseng-ai/branch-context/api";
import { extractSlashCommandArgumentPrefix } from "@nseng-ai/capability-kit/branch-completions";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import type { CommandContext } from "@nseng-ai/capability-kit/pi-types";
import type { SlotClient } from "@nseng-ai/slots/api";

import { HERDR_SPACE_OPEN_BRANCH_COMMAND_NAME } from "./command-surfaces.ts";
import { openBranchInHerdrWorkspace } from "./slot.ts";
import { createHerdrSlotClient } from "./slot-checkout.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";

const COMMAND_NAME = HERDR_SPACE_OPEN_BRANCH_COMMAND_NAME;

type ResolvedBranch =
	| { inferred: false; branchName: string }
	| { inferred: true; branchName: string; evidence: BranchContextEvidence }
	| { error: string };

export interface HerdrSlotOpenBranchOptions {
	slotClient?: SlotClient;
}

export interface HandleHerdrSlotOpenBranchOptions {
	pi: CommandExecApi;
	herdr: HerdrGateway;
	args: string;
	ctx: CommandContext;
	options?: HerdrSlotOpenBranchOptions;
	notifyProgress: (message: string) => void;
}

export async function handleHerdrSlotOpenBranch(
	options: HandleHerdrSlotOpenBranchOptions,
): Promise<void> {
	const { pi, herdr, args, ctx } = options;
	const explicitBranch = args.trim();
	options.notifyProgress(
		explicitBranch.length > 0
			? `Opening Herdr workspace for ${explicitBranch}…`
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
			destinationDescription: "open it in a new Herdr workspace",
		});
		if (!confirmed) {
			ctx.ui.notify("Cancelled; no Herdr workspace was opened.", "info");
			return;
		}
	}

	const branch = resolved.branchName;
	if (resolved.inferred) {
		options.notifyProgress(`Opening Herdr workspace for ${branch}…`);
	}

	await openBranchInHerdrWorkspace({
		pi,
		herdr,
		cwd: ctx.cwd,
		branchName: branch,
		slotClient: options.options?.slotClient ?? createHerdrSlotClient({ cwd: ctx.cwd }),
		notify: (message, level) => ctx.ui.notify(message, level),
		notifyProgress: options.notifyProgress,
	});
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
