import type { SlotCliContext } from "./context.ts";
import { createRealSlotContext } from "./context.ts";
import { checkoutBranch, checkoutCurrent } from "./lifecycle/checkout.ts";
import { buildNavigationResultFields } from "./navigation-result.ts";

export interface SlotCheckoutTarget {
	slotName: string;
	branchName: string;
	worktreePath: string;
	cdCommand: string;
	alreadyAssigned: boolean;
	createdBranch: boolean;
	currentWorktreeNote: string | null;
}

export interface SlotCheckoutFailure {
	errorType: string;
	message: string;
}

export type SlotCheckoutResult =
	| { ok: true; target: SlotCheckoutTarget }
	| { ok: false; failure: SlotCheckoutFailure };

export interface SlotCheckoutOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
	context?: SlotCliContext;
}

export interface SlotBranchCheckoutOptions extends SlotCheckoutOptions {
	branchName: string;
	shouldCreateBranch?: boolean;
	base?: string | null;
}

export async function checkoutCurrentSlot(
	options: SlotCheckoutOptions,
): Promise<SlotCheckoutResult> {
	const ctx = await resolveSlotContext(options);
	const result = await checkoutCurrent(ctx);
	return await mapCheckoutResult(ctx, result);
}

export async function checkoutBranchSlot(
	options: SlotBranchCheckoutOptions,
): Promise<SlotCheckoutResult> {
	const ctx = await resolveSlotContext(options);
	const result = await checkoutBranch(ctx, options.branchName, {
		shouldCreateBranch: options.shouldCreateBranch ?? false,
		base: options.base ?? null,
	});
	return await mapCheckoutResult(ctx, result);
}

async function resolveSlotContext(options: SlotCheckoutOptions): Promise<SlotCliContext> {
	if (options.context !== undefined) return options.context;
	return await createRealSlotContext({
		cwd: options.cwd,
		...(options.env === undefined ? {} : { env: options.env as NodeJS.ProcessEnv }),
	});
}

async function mapCheckoutResult(
	ctx: SlotCliContext,
	result: Awaited<ReturnType<typeof checkoutCurrent>>,
): Promise<SlotCheckoutResult> {
	if (result.type === "failure") {
		return {
			ok: false,
			failure: {
				errorType: result.failure.error_type,
				message: result.failure.message,
			},
		};
	}
	const navigation = await buildNavigationResultFields(ctx, {
		worktreePath: result.outcome.worktree_path,
		shouldSkipClipboard: true,
	});
	return {
		ok: true,
		target: {
			slotName: result.outcome.slot_name,
			branchName: result.outcome.branch_name,
			worktreePath: result.outcome.worktree_path,
			cdCommand: navigation.cd_command,
			alreadyAssigned: result.outcome.already_assigned,
			createdBranch: result.outcome.created_branch,
			currentWorktreeNote: result.outcome.current_wt_note,
		},
	};
}

export type { SlotCliContext } from "./context.ts";
