import type { ClinkrDynamicCompletionRequest } from "@nseng-ai/clinkr";

import {
	unwrapIncumbentRepositoryResult,
	type LocalBranchesResult,
} from "../core/gateways/repository.ts";

export interface CheckoutBranchCompletionContext {
	listLocalBranches(): Promise<LocalBranchesResult>;
}

export type CheckoutBranchesCompletionProvider<TContext> = (
	ctx: TContext,
	request: ClinkrDynamicCompletionRequest,
) => Promise<{ candidates: { value: string; type: "positional-value" }[] }>;

export function checkoutBranchesCompletionProviderFor<TContext>(options: {
	completionKind: "checkout-branches" | undefined;
	gitFromContext: (
		ctx: TContext,
	) => CheckoutBranchCompletionContext | Promise<CheckoutBranchCompletionContext>;
}): CheckoutBranchesCompletionProvider<TContext> | undefined {
	if (options.completionKind !== "checkout-branches") return undefined;
	return async (ctx, request) =>
		await completeCheckoutBranchesFromGit(await options.gitFromContext(ctx), request);
}

export async function completeCheckoutBranchesFromGit(
	git: CheckoutBranchCompletionContext,
	request: ClinkrDynamicCompletionRequest,
): Promise<{ candidates: { value: string; type: "positional-value" }[] }> {
	if (request.current.startsWith("-")) return { candidates: [] };
	if (request.positionalIndex !== 0 && request.positionalIndex !== 1) return { candidates: [] };
	const branches = unwrapIncumbentRepositoryResult(await git.listLocalBranches());
	return {
		candidates: branches
			.filter((branch) => branch.startsWith(request.current))
			.map((branch) => ({ value: branch, type: "positional-value" })),
	};
}
