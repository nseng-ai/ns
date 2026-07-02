import type { SlotCliContext } from "./context.ts";
import { writeCdDirectiveIfActive } from "../shell/cd-directive.ts";

export interface NavigationResultFields {
	worktreePath: string;
	cdCommand: string;
	clipboardCopied: boolean;
	clipboardSkipped: boolean;
	clipboardFailureReason: "backend-missing" | "subprocess-error" | null;
	clipboardFailureDetail: string | null;
}

/**
 * Canonical side-effect contract for checkout navigation. The Capability API
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
			worktreePath: worktreePath,
			cdCommand: cdCommand,
			clipboardCopied: false,
			clipboardSkipped: true,
			clipboardFailureReason: null,
			clipboardFailureDetail: null,
		};
	}
	const copyResult = await ctx.clipboard.copy(cdCommand);
	if (copyResult.type === "copied") {
		return {
			worktreePath: worktreePath,
			cdCommand: cdCommand,
			clipboardCopied: true,
			clipboardSkipped: false,
			clipboardFailureReason: null,
			clipboardFailureDetail: null,
		};
	}
	return {
		worktreePath: worktreePath,
		cdCommand: cdCommand,
		clipboardCopied: false,
		clipboardSkipped: false,
		clipboardFailureReason: copyResult.reason,
		clipboardFailureDetail: copyResult.detail,
	};
}
