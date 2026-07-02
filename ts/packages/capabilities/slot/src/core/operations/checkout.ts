import { failure, ok, type RenderCapabilities } from "@sdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { checkoutBranch, checkoutCurrent } from "../../lifecycle/checkout.ts";
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
	slotName: z.string(),
	branchName: z.string(),
	worktreePath: z.string(),
	cdCommand: z.string(),
	alreadyAssigned: z.boolean(),
	createdBranch: z.boolean(),
	currentWtNote: z.string().nullable(),
	clipboardCopied: z.boolean(),
	clipboardSkipped: z.boolean(),
	clipboardFailureReason: z
		.union([z.literal("backend-missing"), z.literal("subprocess-error")])
		.nullable(),
	clipboardFailureDetail: z.string().nullable(),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type CheckoutResult = z.infer<typeof checkoutResultSchema>;

export async function runCheckout(ctx: SlotCliContext, request: CheckoutRequest) {
	const inputsProvided = Number(request.branchName !== undefined) + Number(request.current);
	if (inputsProvided > 1)
		return failure("mutually-exclusive-args", "Pass exactly one of BRANCH_NAME or --current.");
	if (inputsProvided === 0)
		return failure("missing-arg", "Pass BRANCH_NAME or --current to identify the branch.");
	if (request.current && request.new)
		return failure("mutually-exclusive-args", "-b/--new cannot be combined with --current.");
	if (request.base !== undefined && !request.new)
		return failure("base-without-new", "BASE is only valid with -b/--new.");

	const lifecycleResult = request.current
		? await checkoutCurrent(ctx)
		: await checkoutBranch(ctx, request.branchName ?? "", {
				shouldCreateBranch: request.new,
				base: request.base ?? null,
			});
	if (lifecycleResult.type === "failure")
		return failure(lifecycleResult.failure.errorType, lifecycleResult.failure.message);
	const navigation = await prepareNavigation(ctx, lifecycleResult.outcome.worktreePath, {
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
			...(result.currentWtNote === null ? {} : { details: [result.currentWtNote] }),
		},
		caps,
	);
}

function renderCheckoutHeadline(result: CheckoutResult): string {
	if (!result.alreadyAssigned) return `Checked out ${result.slotName} -> ${result.branchName}`;
	if (extractSlotNumber(result.slotName) === null) {
		return `${result.branchName} is already checked out in the main worktree at ${result.worktreePath}`;
	}
	return `${result.branchName} is already assigned to ${result.slotName}`;
}
