import type { SlotCliContext } from "./context.ts";
import type { SlotCheckoutOutcome, SlotCheckoutResult } from "./lifecycle/checkout.ts";
import { writeCdDirectiveIfActive } from "./shell/cd-directive.ts";

export interface NavigationResultFields {
	worktree_path: string;
	cd_command: string;
	clipboard_copied: boolean;
	clipboard_skipped: boolean;
	clipboard_failure_reason: "backend_missing" | "subprocess_error" | null;
	clipboard_failure_detail: string | null;
}

/**
 * Canonical side-effect contract for checkout navigation. The Peer API
 * (`api.ts`) re-exports this as `SlotCheckoutSideEffects`; both edges bind to
 * this single type so the two surfaces cannot drift.
 */
export interface CheckoutSideEffects {
	shouldCopyClipboard: boolean;
	shouldWriteCdDirective: boolean;
}

export async function writeNavigationCdDirective(
	ctx: SlotCliContext,
	worktreePath: string,
	shouldWrite: boolean,
): Promise<void> {
	await writeCdDirectiveIfActive(worktreePath, {
		env: ctx.env,
		isEnabled: shouldWrite,
	});
}

export type PreparedCheckoutNavigationResult =
	| { type: "failure"; failure: Extract<SlotCheckoutResult, { type: "failure" }>["failure"] }
	| { type: "success"; outcome: SlotCheckoutOutcome; navigation: NavigationResultFields };

export async function finalizeCheckoutNavigation(
	ctx: SlotCliContext,
	result: SlotCheckoutResult,
	sideEffects: CheckoutSideEffects,
): Promise<PreparedCheckoutNavigationResult> {
	if (result.type === "failure") return { type: "failure", failure: result.failure };
	await writeNavigationCdDirective(
		ctx,
		result.outcome.worktree_path,
		sideEffects.shouldWriteCdDirective,
	);
	return await prepareCheckoutNavigationResult(ctx, result, {
		shouldSkipClipboard: !sideEffects.shouldCopyClipboard,
	});
}

export async function prepareCheckoutNavigationResult(
	ctx: SlotCliContext,
	result: SlotCheckoutResult,
	options: { shouldSkipClipboard: boolean },
): Promise<PreparedCheckoutNavigationResult> {
	if (result.type === "failure") return { type: "failure", failure: result.failure };
	const navigation = await buildNavigationResultFields(ctx, {
		worktreePath: result.outcome.worktree_path,
		shouldSkipClipboard: options.shouldSkipClipboard,
	});
	return { type: "success", outcome: result.outcome, navigation };
}

export async function buildNavigationResultFields(
	ctx: SlotCliContext,
	options: { worktreePath: string; shouldSkipClipboard: boolean },
): Promise<NavigationResultFields> {
	const cdCommand = `cd ${options.worktreePath}`;
	if (options.shouldSkipClipboard) {
		return {
			worktree_path: options.worktreePath,
			cd_command: cdCommand,
			clipboard_copied: false,
			clipboard_skipped: true,
			clipboard_failure_reason: null,
			clipboard_failure_detail: null,
		};
	}
	const copyResult = await ctx.clipboard.copy(cdCommand);
	if (copyResult.type === "copied") {
		return {
			worktree_path: options.worktreePath,
			cd_command: cdCommand,
			clipboard_copied: true,
			clipboard_skipped: false,
			clipboard_failure_reason: null,
			clipboard_failure_detail: null,
		};
	}
	return {
		worktree_path: options.worktreePath,
		cd_command: cdCommand,
		clipboard_copied: false,
		clipboard_skipped: false,
		clipboard_failure_reason: copyResult.reason,
		clipboard_failure_detail: copyResult.detail,
	};
}

export function renderNavigationFooter(result: NavigationResultFields): string[] {
	const lines = [result.cd_command];
	if (!result.clipboard_skipped) {
		lines.push(
			result.clipboard_copied
				? "Copied cd command to clipboard."
				: `Clipboard unavailable (${result.clipboard_failure_detail ?? "pbcopy failed"})`,
		);
	}
	return lines;
}
