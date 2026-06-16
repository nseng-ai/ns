import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { checkoutBranch, checkoutCurrent } from "../lifecycle/checkout.ts";
import { buildNavigationResultFields } from "../navigation-result.ts";
import { extractSlotNumber } from "../naming.ts";

export const checkoutRequestSchema = z.object({
	branch_name: z.string().optional().describe("Branch to check out."),
	base: z.string().optional().describe("Base branch for -b/--new."),
	new: z.boolean().default(false).describe("Create BRANCH_NAME before assigning it."),
	current: z.boolean().default(false).describe("Move the current branch into a slot."),
	clipboard: z.boolean().default(true).describe("Copy the cd command to the clipboard.")
});

export const checkoutResultSchema = z.object({
	slot_name: z.string(),
	branch_name: z.string(),
	worktree_path: z.string(),
	cd_command: z.string(),
	already_assigned: z.boolean(),
	created_branch: z.boolean(),
	current_wt_note: z.string().nullable(),
	clipboard_copied: z.boolean(),
	clipboard_skipped: z.boolean(),
	clipboard_failure_reason: z.union([z.literal("backend_missing"), z.literal("subprocess_error")]).nullable(),
	clipboard_failure_detail: z.string().nullable(),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type CheckoutResult = z.infer<typeof checkoutResultSchema>;

export async function runCheckout(ctx: SlotCliContext, request: CheckoutRequest) {
	const inputsProvided = Number(request.branch_name !== undefined) + Number(request.current);
	if (inputsProvided > 1) return failure("mutually_exclusive_args", "Pass exactly one of BRANCH_NAME or --current.");
	if (inputsProvided === 0) return failure("missing_arg", "Pass BRANCH_NAME or --current to identify the branch.");
	if (request.current && request.new) return failure("mutually_exclusive_args", "-b/--new cannot be combined with --current.");
	if (request.base !== undefined && !request.new) return failure("base_without_new", "BASE is only valid with -b/--new.");

	const lifecycleResult = request.current
		? await checkoutCurrent(ctx)
		: await checkoutBranch(ctx, request.branch_name ?? "", { shouldCreateBranch: request.new, base: request.base ?? null });
	if (lifecycleResult.type === "failure") return failure(lifecycleResult.failure.error_type, lifecycleResult.failure.message);
	const navigation = await buildNavigationResultFields(ctx, { worktreePath: lifecycleResult.outcome.worktree_path, shouldSkipClipboard: !request.clipboard });
	return ok({ ...lifecycleResult.outcome, ...navigation });
}

export function renderCheckout(result: CheckoutResult): string {
	const lines: string[] = [];
	if (result.current_wt_note !== null) lines.push(result.current_wt_note);
	if (result.already_assigned) {
		if (extractSlotNumber(result.slot_name) === null) {
			lines.push(`${result.branch_name} is already checked out in the main worktree at ${result.worktree_path}`);
		} else {
			lines.push(`${result.branch_name} is already assigned to ${result.slot_name}`);
		}
	} else {
		lines.push(`Checked out ${result.slot_name} -> ${result.branch_name}`);
	}
	lines.push(result.cd_command);
	if (!result.clipboard_skipped) {
		lines.push(result.clipboard_copied ? "Copied cd command to clipboard." : `Clipboard unavailable (${result.clipboard_failure_detail ?? "pbcopy failed"})`);
	}
	return lines.join("\n");
}
