import type { SlotCliContext } from "./context.ts";
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

export async function prepareNavigation(
	ctx: SlotCliContext,
	worktreePath: string,
	sideEffects: CheckoutSideEffects,
): Promise<NavigationResultFields> {
	await writeCdDirectiveIfActive(worktreePath, {
		env: ctx.env,
		isEnabled: sideEffects.shouldWriteCdDirective,
	});
	return await buildNavigationResultFields(ctx, worktreePath, sideEffects.shouldCopyClipboard);
}

async function buildNavigationResultFields(
	ctx: SlotCliContext,
	worktreePath: string,
	shouldCopyClipboard: boolean,
): Promise<NavigationResultFields> {
	const cdCommand = `cd ${worktreePath}`;
	if (!shouldCopyClipboard) {
		return {
			worktree_path: worktreePath,
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
			worktree_path: worktreePath,
			cd_command: cdCommand,
			clipboard_copied: true,
			clipboard_skipped: false,
			clipboard_failure_reason: null,
			clipboard_failure_detail: null,
		};
	}
	return {
		worktree_path: worktreePath,
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
