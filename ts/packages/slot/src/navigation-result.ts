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

export async function buildNavigationResultFields(ctx: SlotCliContext, options: { worktreePath: string; shouldSkipClipboard: boolean }): Promise<NavigationResultFields> {
	await writeCdDirectiveIfActive(options.worktreePath, { env: ctx.env, isEnabled: !ctx.isMachineMode });
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
