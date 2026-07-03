import { validateBranchName, type BrmemErrorInfo } from "@ns/brmem";
import {
	failure,
	confirmInteractiveOrUsageError,
	type ClinkrExit,
	type ClinkrFailureExit,
} from "@ns/clinkr";

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
				"invalid-branch-name",
				`Invalid branch name ${JSON.stringify(requestedBranch)}: ${validation.reason}`,
			);
		}
		return resolved(requestedBranch);
	}

	const current = await ctx.git.currentBranch({ cwd: ctx.cwd });
	if (current.type === "detached") return failure("detached-head", options.detachedMessage);
	if (current.type === "failure") return failure(current.error.code, current.error.message);
	const validation = validateBranchName(current.branch);
	if (validation.type === "invalid")
		return failure(
			"invalid-branch-name",
			`Invalid branch name ${JSON.stringify(current.branch)}: ${validation.reason}`,
		);
	return resolved(current.branch);
}

export type DestructiveConfirmationResult =
	| { type: "confirmed" }
	| { type: "declined" }
	| { type: "aborted" }
	| { type: "gateFailure"; exit: ClinkrExit<never> };

export async function confirmDestructiveAction(
	ctx: HandoffCliContext,
	options: {
		gateMessage: string;
		missingFlag: string;
		howToSupply: string;
		confirmMessage: string;
		beforePrompt?: () => void;
	},
): Promise<DestructiveConfirmationResult> {
	const confirmation = await confirmInteractiveOrUsageError(ctx.interaction, {
		nonInteractive: {
			message: options.gateMessage,
			missingFlag: options.missingFlag,
			howToSupply: options.howToSupply,
		},
		confirmation: {
			message: options.confirmMessage,
			defaultAnswer: "no",
		},
		...(options.beforePrompt === undefined ? {} : { beforePrompt: options.beforePrompt }),
	});
	return "errorType" in confirmation ? { type: "gateFailure", exit: confirmation } : confirmation;
}

export function gatewayFailure(error: BrmemErrorInfo, prefix: string): ClinkrFailureExit {
	return failure(error.code, `${prefix}: ${error.message}`);
}
