import { failure, type FailureOutcome } from "@nseng-ai/clinkr/app";
import type { BrmemCliContext } from "./context.ts";
import type { BrmemErrorInfo } from "./contracts.ts";
import { normalizeNamespaceOption } from "./ref-layout.ts";
import {
	firstFailure,
	validateBranchName,
	validateEntryKey,
	validateNamespaceName,
	validationMessage,
} from "./validation.ts";

export interface ResolvedEntryRequest {
	readonly namespace: string;
	readonly key: string;
	readonly branch: string;
}

export type ResolvedEntryRequestResult =
	| { readonly type: "failure"; readonly outcome: FailureOutcome }
	| { readonly type: "resolved"; readonly value: ResolvedEntryRequest };

export interface EntryOperationRequest {
	readonly key: string;
	readonly namespace?: string;
	readonly branch?: string;
}

export async function resolveOperationEntryRequest(
	ctx: BrmemCliContext,
	request: EntryOperationRequest,
): Promise<ResolvedEntryRequestResult> {
	const branch = request.branch ?? (await resolveCurrentBranch(ctx));
	if (typeof branch !== "string") return { type: "failure", outcome: branch };
	const namespace = normalizeNamespaceOption(request.namespace);
	const failureResult = firstFailure(
		[
			"invalid-namespace",
			validationMessage("namespace", namespace, validateNamespaceName(namespace)),
		],
		["invalid-key", validationMessage("key", request.key, validateEntryKey(request.key))],
		["invalid-branch-name", validationMessage("branch name", branch, validateBranchName(branch))],
	);
	if (failureResult !== undefined) {
		return { type: "failure", outcome: failure(failureResult[0], failureResult[1]) };
	}
	return { type: "resolved", value: { namespace, key: request.key, branch } };
}

export async function resolveCurrentBranch(ctx: BrmemCliContext): Promise<string | FailureOutcome> {
	const branch = await ctx.gateway.currentBranch();
	if (branch.type === "error") return failure(branch.error.code, branch.error.message);
	return branch.value;
}

export function gatewayFailure(error: BrmemErrorInfo): FailureOutcome {
	return failure(error.code, error.message);
}
