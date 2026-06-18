import { validateBranchName, type BrmemErrorInfo } from "@asdl/brmem";
import { failure, type ClinkrExit, type ClinkrFailureExit } from "@asdl/clinkr";

import type { HandoffCliContext } from "../context.ts";

export type Resolved<T> = { type: "resolved"; value: T } | ClinkrExit<never>;
export function resolved<T>(value: T): Resolved<T> {
	return { type: "resolved", value };
}

export async function resolveBranch(
	ctx: HandoffCliContext,
	requestedBranch: string | undefined,
	options: { detachedMessage: string },
): Promise<Resolved<string>> {
	if (requestedBranch !== undefined) {
		const validation = validateBranchName(requestedBranch);
		if (validation.type === "invalid") {
			return failure(
				"invalid_branch_name",
				`Invalid branch name ${JSON.stringify(requestedBranch)}: ${validation.reason}`,
			);
		}
		return resolved(requestedBranch);
	}

	const current = await ctx.git.currentBranch({ cwd: ctx.cwd });
	if (!current.ok) {
		if (current.error.code === "detached_head")
			return failure("detached_head", options.detachedMessage);
		return failure(current.error.code, current.error.message);
	}
	const validation = validateBranchName(current.value);
	if (validation.type === "invalid")
		return failure(
			"invalid_branch_name",
			`Invalid branch name ${JSON.stringify(current.value)}: ${validation.reason}`,
		);
	return resolved(current.value);
}

export function gatewayFailure(error: BrmemErrorInfo, prefix: string): ClinkrFailureExit {
	return failure(error.code, `${prefix}: ${error.message}`);
}
