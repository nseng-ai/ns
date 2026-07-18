import { buildEntryLocator, buildSnapshotRef, validateEntryKey } from "@nseng-ai/brmem";

import {
	buildDispatchInstructionKey,
	DISPATCH_CONTEXT_NAMESPACE,
} from "../dispatch/dispatch-context.ts";

export interface PreparedDispatchInstruction {
	readonly dispatchId: string;
	readonly content: string;
	readonly entry: {
		readonly namespace: typeof DISPATCH_CONTEXT_NAMESPACE;
		readonly key: string;
		readonly sourceBranch: string;
		readonly snapshotRef: string;
		readonly entryLocator: string;
	};
}

export type PrepareDispatchInstructionResult =
	| { readonly status: "ready"; readonly instruction: PreparedDispatchInstruction }
	| {
			readonly status: "invalid-dispatch-context";
			readonly dispatchId: string;
			readonly message: string;
	  };

/** Internal seam for prompt/plan producers; this is not an arbitrary Entry command. */
export function prepareDispatchInstruction(options: {
	readonly dispatchId: string;
	readonly anchorBranch: string;
	readonly content: string;
}): PrepareDispatchInstructionResult {
	const key = buildDispatchInstructionKey(options.dispatchId);
	const keyValidation = validateEntryKey(key);
	if (keyValidation.type === "invalid") {
		return invalidContext(
			options.dispatchId,
			`Invalid dispatch instruction Entry Key: ${keyValidation.reason}`,
		);
	}

	const snapshotRef = buildSnapshotRef(DISPATCH_CONTEXT_NAMESPACE, options.anchorBranch);
	if (snapshotRef.type === "error") {
		return invalidContext(options.dispatchId, snapshotRef.error.message);
	}
	const entryLocator = buildEntryLocator(DISPATCH_CONTEXT_NAMESPACE, key, options.anchorBranch);
	if (entryLocator.type === "error") {
		return invalidContext(options.dispatchId, entryLocator.error.message);
	}

	return {
		status: "ready",
		instruction: {
			dispatchId: options.dispatchId,
			content: options.content,
			entry: {
				namespace: DISPATCH_CONTEXT_NAMESPACE,
				key,
				sourceBranch: options.anchorBranch,
				snapshotRef: snapshotRef.value,
				entryLocator: entryLocator.value,
			},
		},
	};
}

function invalidContext(dispatchId: string, message: string): PrepareDispatchInstructionResult {
	return { status: "invalid-dispatch-context", dispatchId, message };
}
