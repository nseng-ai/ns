import type { ClinkrDynamicCompletionRequest } from "@nseng-ai/clinkr";

export interface CheckoutBranchCompletionContext {
	listLocalBranches(): Promise<readonly string[]>;
}

export async function completeCheckoutBranchesFromGit(
	git: CheckoutBranchCompletionContext,
	request: ClinkrDynamicCompletionRequest,
): Promise<{ candidates: { value: string; type: "positional-value" }[] }> {
	if (request.current.startsWith("-")) return { candidates: [] };
	if (request.positionalIndex !== 0 && request.positionalIndex !== 1) return { candidates: [] };
	const branches = await git.listLocalBranches();
	return {
		candidates: branches
			.filter((branch) => branch.startsWith(request.current))
			.map((branch) => ({ value: branch, type: "positional-value" })),
	};
}
