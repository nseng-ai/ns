import { failure, ok, resolveRenderCapabilities, type RenderCapabilities } from "@sdl/clinkr";
import { renderResultBlock } from "@sdl/core/cli-theme";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { claimBranch } from "../../lifecycle/claim.ts";

export const claimRequestSchema = z.object({
	branchName: z.string().describe("Local branch to claim."),
});

export const claimResultSchema = z.object({
	slotName: z.string(),
	branchName: z.string(),
	worktreePath: z.string(),
	replacedBranchName: z.string().nullable(),
	sourceSlotName: z.string().nullable(),
	sourceWorktreePath: z.string().nullable(),
	alreadyCurrent: z.boolean(),
	mainWorktreePath: z.string().nullable(),
	mainCheckoutBranch: z.string().nullable(),
	mainRedirectAction: z.union([z.literal("checkout-branch"), z.literal("detach-head")]).nullable(),
	mainRedirectRef: z.string().nullable(),
	mainRedirectNote: z.string().nullable(),
});

export type ClaimRequest = z.infer<typeof claimRequestSchema>;
export type ClaimResult = z.infer<typeof claimResultSchema>;

export async function runClaim(ctx: SlotCliContext, request: ClaimRequest) {
	const result = await claimBranch(ctx, request.branchName);
	if (result.type === "failure") return failure(result.failure.errorType, result.failure.message);
	return ok(result.outcome);
}

export function renderClaim(
	result: ClaimResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const renderCaps = resolveRenderCapabilities(caps);
	if (result.alreadyCurrent) {
		return renderResultBlock(renderCaps, {
			kind: "success",
			headline: `${result.slotName} already has ${result.branchName}.`,
			body: `Worktree: ${result.worktreePath}`,
		});
	}
	const body = [
		`Slot: ${result.slotName}`,
		`Branch: ${result.branchName}`,
		`Worktree: ${result.worktreePath}`,
		...(result.sourceSlotName === null || result.mainCheckoutBranch !== null
			? []
			: [`Source slot: ${result.sourceSlotName}`]),
		...(result.replacedBranchName === null || result.mainCheckoutBranch !== null
			? []
			: [`Replaced: ${result.replacedBranchName}`]),
		...mainRedirectLines(result),
	].join("\n");
	return renderResultBlock(renderCaps, {
		kind: "success",
		headline: `Claimed ${result.slotName} for ${result.branchName}.`,
		body,
	});
}

function mainRedirectLines(result: ClaimResult): string[] {
	const note = result.mainRedirectNote === null ? "" : ` (${result.mainRedirectNote})`;
	if (result.mainRedirectAction === "checkout-branch") {
		return [`Main worktree: checked out ${result.mainRedirectRef}${note}`];
	}
	if (result.mainRedirectAction === "detach-head") {
		if (result.mainRedirectRef === null) return [`Main worktree: detached${note}`];
		return [`Main worktree: detached main worktree at ${result.mainRedirectRef}${note}`];
	}
	return result.mainRedirectNote === null ? [] : [`Main worktree: ${result.mainRedirectNote}`];
}
