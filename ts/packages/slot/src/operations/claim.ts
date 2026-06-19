import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { claimBranch } from "../lifecycle/claim.ts";

export const claimRequestSchema = z.object({
	branch_name: z.string().describe("Local branch to claim."),
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
	const result = await claimBranch(ctx, request.branch_name);
	if (result.type === "failure") return failure(result.failure.error_type, result.failure.message);
	return ok(result.outcome);
}

export function renderClaim(result: ClaimResult): string {
	if (result.already_current) return `${result.slot_name} already has ${result.branch_name}`;
	const source =
		result.source_slot_name !== null && result.main_checkout_branch === null
			? ` from ${result.source_slot_name}`
			: "";
	const replaced =
		result.replaced_branch_name !== null && result.main_checkout_branch === null
			? ` (replaced ${result.replaced_branch_name})`
			: "";
	return `Claimed ${result.slot_name} -> ${result.branch_name}${source}${replaced}${mainRedirectSuffix(result)}`;
}

function mainRedirectSuffix(result: ClaimResult): string {
	const note = result.main_redirect_note === null ? "" : ` (${result.main_redirect_note})`;
	if (result.main_redirect_action === "checkout_branch") {
		return `; checked out ${result.main_redirect_ref} in main worktree${note}`;
	}
	if (result.main_redirect_action === "detach_head") {
		if (result.main_redirect_ref === null) return `; detached main worktree${note}`;
		return `; detached main worktree at ${result.main_redirect_ref}${note}`;
	}
	return note;
}
