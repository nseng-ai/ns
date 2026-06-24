import type { SlotCliContext } from "./context.ts";
import { createRealSlotContext } from "./context.ts";
import { checkoutBranch, checkoutCurrent } from "./lifecycle/checkout.ts";
import { prepareCheckoutNavigationResult } from "./navigation-result.ts";

export interface SlotCheckoutTarget {
	slotName: string;
	branchName: string;
	worktreePath: string;
	cdCommand: string;
	isAlreadyAssigned: boolean;
	hasCreatedBranch: boolean;
	currentWorktreeNote: string | null;
}

export interface SlotCheckoutFailure {
	errorType: string;
	message: string;
}

export type SlotCheckoutResult =
	| { ok: true; target: SlotCheckoutTarget }
	| { ok: false; failure: SlotCheckoutFailure };

export interface SlotClientOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
	context?: SlotCliContext;
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
			return await mapCheckoutResult(ctx, result);
		},
		async checkoutBranch(branchOptions) {
			const ctx = await resolveSlotContext(options);
			const result = await checkoutBranch(ctx, branchOptions.branchName, {
				shouldCreateBranch: branchOptions.shouldCreateBranch ?? false,
				base: branchOptions.base ?? null,
			});
			return await mapCheckoutResult(ctx, result);
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

async function mapCheckoutResult(
	ctx: SlotCliContext,
	result: Awaited<ReturnType<typeof checkoutCurrent>>,
): Promise<SlotCheckoutResult> {
	const prepared = await prepareCheckoutNavigationResult(ctx, result, {
		shouldSkipClipboard: true,
	});
	if (prepared.type === "failure") {
		return {
			ok: false,
			failure: {
				errorType: prepared.failure.error_type,
				message: prepared.failure.message,
			},
		};
	}
	return {
		ok: true,
		target: {
			slotName: prepared.outcome.slot_name,
			branchName: prepared.outcome.branch_name,
			worktreePath: prepared.outcome.worktree_path,
			cdCommand: prepared.navigation.cd_command,
			isAlreadyAssigned: prepared.outcome.already_assigned,
			hasCreatedBranch: prepared.outcome.created_branch,
			currentWorktreeNote: prepared.outcome.current_wt_note,
		},
	};
}

export type { SlotCliContext } from "./context.ts";
