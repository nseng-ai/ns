import { failure, ok, type RenderCapabilities } from "@sdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { checkoutBranch, checkoutCurrent } from "../lifecycle/checkout.ts";
import { prepareNavigation } from "../navigation-result.ts";
import { renderSlotNavigationSuccess } from "../navigation-presentation.ts";
import { extractSlotNumber } from "../naming.ts";

export const checkoutRequestSchema = z.object({
	branchName: z.string().optional().describe("Branch to check out."),
	base: z.string().optional().describe("Base branch for -b/--new."),
	new: z.boolean().default(false).describe("Create BRANCH_NAME before assigning it."),
	current: z.boolean().default(false).describe("Move the current branch into a slot."),
	clipboard: z.boolean().default(true).describe("Copy the cd command to the clipboard."),
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
	clipboard_failure_reason: z
		.union([z.literal("backend_missing"), z.literal("subprocess_error")])
		.nullable(),
	clipboard_failure_detail: z.string().nullable(),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type CheckoutResult = z.infer<typeof checkoutResultSchema>;

export async function runCheckout(ctx: SlotCliContext, request: CheckoutRequest) {
	const inputsProvided = Number(request.branchName !== undefined) + Number(request.current);
	if (inputsProvided > 1)
		return failure("mutually_exclusive_args", "Pass exactly one of BRANCH_NAME or --current.");
	if (inputsProvided === 0)
		return failure("missing_arg", "Pass BRANCH_NAME or --current to identify the branch.");
	if (request.current && request.new)
		return failure("mutually_exclusive_args", "-b/--new cannot be combined with --current.");
	if (request.base !== undefined && !request.new)
		return failure("base_without_new", "BASE is only valid with -b/--new.");

	const lifecycleResult = request.current
		? await checkoutCurrent(ctx)
		: await checkoutBranch(ctx, request.branchName ?? "", {
				shouldCreateBranch: request.new,
				base: request.base ?? null,
			});
	if (lifecycleResult.type === "failure")
		return failure(lifecycleResult.failure.error_type, lifecycleResult.failure.message);
	const navigation = await prepareNavigation(ctx, lifecycleResult.outcome.worktree_path, {
		shouldCopyClipboard: request.clipboard,
		shouldWriteCdDirective: ctx.shouldWriteCdDirective,
	});
	return ok({ ...lifecycleResult.outcome, ...navigation });
}

export function renderCheckout(
	result: CheckoutResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	return renderSlotNavigationSuccess(
		{
			...result,
			headline: renderCheckoutHeadline(result),
			...(result.current_wt_note === null ? {} : { details: [result.current_wt_note] }),
		},
		caps,
	);
}

function renderCheckoutHeadline(result: CheckoutResult): string {
	if (!result.already_assigned) return `Checked out ${result.slot_name} -> ${result.branch_name}`;
	if (extractSlotNumber(result.slot_name) === null) {
		return `${result.branch_name} is already checked out in the main worktree at ${result.worktree_path}`;
	}
	return `${result.branch_name} is already assigned to ${result.slot_name}`;
}
