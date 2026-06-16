import type { SlotCliContext } from "../context.ts";
import type { CurrentWorktreeRedirect } from "../planning.ts";
import type { SlotLifecycleFailure } from "./common.ts";

export async function executeCurrentWorktreeRedirect(redirect: CurrentWorktreeRedirect, ctx: SlotCliContext): Promise<SlotLifecycleFailure | null> {
	const action = redirect.action;
	if (action.type === "checkout_branch") {
		const failure = await ctx.git.checkoutBranch(ctx.repo.type === "repo" ? ctx.repo.root : ctx.cwd, action.branch);
		if (failure !== null) {
			return {
				error_type: "slot_allocation_error",
				message: `Failed to check out ${redirectFailureSubject(action)} in ${ctx.repo.type === "repo" ? ctx.repo.root : ctx.cwd}: ${failure.message}`,
			};
		}
		return null;
	}
	const failure = await ctx.git.detachHead(ctx.repo.type === "repo" ? ctx.repo.root : ctx.cwd, action.ref);
	if (failure === null) return null;
	return { error_type: "slot_allocation_error", message: `Failed to detach current worktree at ${action.ref}: ${failure.message}` };
}

function redirectFailureSubject(action: { branch: string; role: "previous" | "trunk" }): string {
	if (action.role === "trunk") return `trunk branch '${action.branch}'`;
	return `'${action.branch}'`;
}
