import type { SlotCliContext } from "./context.ts";
import { createRealSlotContext } from "./context.ts";
import { checkoutBranch, checkoutCurrent } from "./lifecycle/checkout.ts";
import { prepareNavigation, type CheckoutSideEffects } from "./navigation-result.ts";

export interface SlotCheckoutTarget {
	slotName: string;
	branchName: string;
	worktreePath: string;
	isAlreadyAssigned: boolean;
	hasCreatedBranch: boolean;
	currentWorktreeNote: string | null;
}

export interface SlotCheckoutFailure {
	errorType: string;
	message: string;
}

/** Machine-facing side-effect contract; canonical definition in `navigation-result.ts`. */
export type SlotCheckoutSideEffects = CheckoutSideEffects;

export type SlotCheckoutResult =
	| { ok: true; target: SlotCheckoutTarget }
	| { ok: false; failure: SlotCheckoutFailure };

export interface SlotClientOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
	context?: SlotCliContext;
	sideEffects?: SlotCheckoutSideEffects;
}

export interface SlotBranchCheckoutOptions {
	branchName: string;
	shouldCreateBranch?: boolean;
	base?: string | null;
}

export interface SlotClient {
	checkoutCurrent(): Promise<SlotCheckoutResult>;
	checkoutBranch(options: SlotBranchCheckoutOptions): Promise<SlotCheckoutResult>;
}

export function createSlotClient(options: SlotClientOptions): SlotClient {
	return {
		async checkoutCurrent() {
			const ctx = await resolveSlotContext(options);
			const result = await checkoutCurrent(ctx);
			return await mapCheckoutResult(ctx, result, resolveSlotCheckoutSideEffects(options));
		},
		async checkoutBranch(branchOptions) {
			const ctx = await resolveSlotContext(options);
			const result = await checkoutBranch(ctx, branchOptions.branchName, {
				shouldCreateBranch: branchOptions.shouldCreateBranch ?? false,
				base: branchOptions.base ?? null,
			});
			return await mapCheckoutResult(ctx, result, resolveSlotCheckoutSideEffects(options));
		},
	};
}

async function resolveSlotContext(options: SlotClientOptions): Promise<SlotCliContext> {
	if (options.context !== undefined) return options.context;
	return await createRealSlotContext({
		cwd: options.cwd,
		...(options.env === undefined ? {} : { env: options.env as NodeJS.ProcessEnv }),
	});
}

function resolveSlotCheckoutSideEffects(options: SlotClientOptions): SlotCheckoutSideEffects {
	return options.sideEffects ?? { shouldCopyClipboard: false, shouldWriteCdDirective: false };
}

async function mapCheckoutResult(
	ctx: SlotCliContext,
	result: Awaited<ReturnType<typeof checkoutCurrent>>,
	sideEffects: SlotCheckoutSideEffects,
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
	await prepareNavigation(ctx, result.outcome.worktree_path, sideEffects);
	return {
		ok: true,
		target: {
			slotName: result.outcome.slot_name,
			branchName: result.outcome.branch_name,
			worktreePath: result.outcome.worktree_path,
			isAlreadyAssigned: result.outcome.already_assigned,
			hasCreatedBranch: result.outcome.created_branch,
			currentWorktreeNote: result.outcome.current_wt_note,
		},
	};
}

export type { SlotCliContext } from "./context.ts";
