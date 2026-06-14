import { failure, type ClinkrExit } from "@asdl/clinkr";

import type { BrmemCliContext } from "../context.ts";
import type { BrmemErrorInfo } from "../contracts.ts";
import { normalizeNamespaceOption } from "../ref-layout.ts";
import { firstFailure, validateBranchName, validateEntryKey, validateNamespaceName, validationMessage } from "../validation.ts";

export interface ResolvedEntryRequest {
	namespace: string;
	key: string;
	branch: string;
}

export async function resolveEntryRequest(
	ctx: BrmemCliContext,
	request: { namespace?: string | undefined; key: string; branch?: string | undefined },
): Promise<ClinkrExit<never> | { type: "resolved"; value: ResolvedEntryRequest }> {
	const branch = request.branch ?? (await resolveCurrentBranch(ctx));
	if (typeof branch !== "string") return branch;
	const namespace = normalizeNamespaceOption(request.namespace);
	const failureResult = firstFailure(
		["invalid_namespace", validationMessage("namespace", namespace, validateNamespaceName(namespace))],
		["invalid_key", validationMessage("key", request.key, validateEntryKey(request.key))],
		["invalid_branch_name", validationMessage("branch name", branch, validateBranchName(branch))],
	);
	if (failureResult !== undefined) return failure(failureResult[0], failureResult[1]);
	return { type: "resolved", value: { namespace, key: request.key, branch } };
}

export async function resolveCurrentBranch(ctx: BrmemCliContext): Promise<string | ClinkrExit<never>> {
	const branch = await ctx.gateway.currentBranch();
	if (branch.type === "error") return failure(branch.error.code, branch.error.message);
	return branch.value;
}

export function gatewayFailure<T>(error: BrmemErrorInfo): ClinkrExit<T> {
	return failure(error.code, error.message);
}
