import { failure, ok, resolveRenderCapabilities, type RenderCapabilities } from "@sdl/clinkr";
import { renderResultBlock } from "@sdl/cli-theme";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { claimBranch } from "../lifecycle/claim.ts";

export const claimRequestSchema = z.object({
	branchName: z.string().describe("Local branch to claim."),
});

export const claimResultSchema = z.object({
	slot_name: z.string(),
	branch_name: z.string(),
	worktree_path: z.string(),
	replaced_branch_name: z.string().nullable(),
	source_slot_name: z.string().nullable(),
	source_worktree_path: z.string().nullable(),
	already_current: z.boolean(),
	main_worktree_path: z.string().nullable(),
	main_checkout_branch: z.string().nullable(),
	main_redirect_action: z
		.union([z.literal("checkout_branch"), z.literal("detach_head")])
		.nullable(),
	main_redirect_ref: z.string().nullable(),
	main_redirect_note: z.string().nullable(),
});

export type ClaimRequest = z.infer<typeof claimRequestSchema>;
export type ClaimResult = z.infer<typeof claimResultSchema>;

export async function runClaim(ctx: SlotCliContext, request: ClaimRequest) {
	const result = await claimBranch(ctx, request.branchName);
	if (result.type === "failure") return failure(result.failure.error_type, result.failure.message);
	return ok(result.outcome);
}

export function renderClaim(
	result: ClaimResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const renderCaps = resolveRenderCapabilities(caps);
	if (result.already_current) {
		return renderResultBlock(renderCaps, {
			kind: "success",
			headline: `${result.slot_name} already has ${result.branch_name}.`,
			body: `Worktree: ${result.worktree_path}`,
		});
	}
	const body = [
		`Slot: ${result.slot_name}`,
		`Branch: ${result.branch_name}`,
		`Worktree: ${result.worktree_path}`,
		...(result.source_slot_name === null || result.main_checkout_branch !== null
			? []
			: [`Source slot: ${result.source_slot_name}`]),
		...(result.replaced_branch_name === null || result.main_checkout_branch !== null
			? []
			: [`Replaced: ${result.replaced_branch_name}`]),
		...mainRedirectLines(result),
	].join("\n");
	return renderResultBlock(renderCaps, {
		kind: "success",
		headline: `Claimed ${result.slot_name} for ${result.branch_name}.`,
		body,
	});
}

function mainRedirectLines(result: ClaimResult): string[] {
	const note = result.main_redirect_note === null ? "" : ` (${result.main_redirect_note})`;
	if (result.main_redirect_action === "checkout_branch") {
		return [`Main worktree: checked out ${result.main_redirect_ref}${note}`];
	}
	if (result.main_redirect_action === "detach_head") {
		if (result.main_redirect_ref === null) return [`Main worktree: detached${note}`];
		return [`Main worktree: detached main worktree at ${result.main_redirect_ref}${note}`];
	}
	return result.main_redirect_note === null ? [] : [`Main worktree: ${result.main_redirect_note}`];
}
