import type { SlotCliContext } from "./context.ts";
import { writeCdDirectiveIfActive } from "./shell/cd-directive.ts";

interface ClipboardNavigationResultFields {
	worktreePath: string;
	cdCommand: string;
	clipboardCopied: boolean;
	clipboardSkipped: boolean;
	clipboardFailureReason: "backend-missing" | "subprocess-error" | null;
	clipboardFailureDetail: string | null;
}

export interface NavigationResultFields extends ClipboardNavigationResultFields {
	cdDirectiveStatus: "inactive" | "written" | "failed";
	cdDirectivePath: string | null;
	cdDirectiveFailureDetail: string | null;
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
	const cdDirectiveResult = await writeCdDirectiveIfActive(worktreePath, {
		env: ctx.env,
		isEnabled: sideEffects.shouldWriteCdDirective,
	});
	const navigation = await buildClipboardNavigationResultFields(
		ctx,
		worktreePath,
		sideEffects.shouldCopyClipboard,
	);
	return {
		...navigation,
		cdDirectiveStatus: cdDirectiveResult.status,
		cdDirectivePath: cdDirectiveResult.path,
		cdDirectiveFailureDetail:
			cdDirectiveResult.status === "failed" ? cdDirectiveResult.error : null,
	};
}

async function buildClipboardNavigationResultFields(
	ctx: SlotCliContext,
	worktreePath: string,
	shouldCopyClipboard: boolean,
): Promise<ClipboardNavigationResultFields> {
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
