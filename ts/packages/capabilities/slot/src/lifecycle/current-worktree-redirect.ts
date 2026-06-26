import type { RepoSlotContext } from "../context.ts";
import type { CurrentWorktreeRedirect } from "../planning.ts";
import type { SlotLifecycleFailure } from "./common.ts";

export async function executeCurrentWorktreeRedirect(
	redirect: CurrentWorktreeRedirect,
	ctx: RepoSlotContext,
): Promise<SlotLifecycleFailure | null> {
	const action = redirect.action;
	if (action.type === "checkout_branch") {
		const failure = await ctx.git.checkoutBranch(ctx.repo.root, action.branch);
		if (failure !== null) {
			return {
				error_type: "slot_allocation_error",
				message: `Failed to check out ${redirectFailureSubject(action)} in ${ctx.repo.root}: ${failure.message}`,
			};
		}
		return null;
	}
	const failure = await ctx.git.detachHead(ctx.repo.root, action.ref);
	if (failure === null) return null;
	return {
		error_type: "slot_allocation_error",
		message: `Failed to detach current worktree at ${ctx.repo.root} to ${action.ref}: ${failure.message}`,
	};
}

function redirectFailureSubject(action: { branch: string; role: "previous" | "trunk" }): string {
	if (action.role === "trunk") return `trunk branch '${action.branch}'`;
	return `'${action.branch}'`;
}
