import type { UiLike } from "@nseng-ai/capability-kit/pi-types";

import type { BranchContextEvidence } from "./branch-context-creation.ts";
import { findLatestBranchContextEvidence } from "./session-artifact.ts";

export type InferredBranchContextResolution =
	| { type: "resolved"; branchName: string; evidence: BranchContextEvidence }
	| { type: "none" };

/**
 * Resolve the branch to open from the latest [branch-context-output] evidence
 * in the current session branch. Hosts own the usage/error text for the
 * `none` case.
 */
export function resolveInferredBranchContext(ctx: {
	sessionManager?: { getBranch?: () => unknown[] };
}): InferredBranchContextResolution {
	const entries = ctx.sessionManager?.getBranch?.() ?? [];
	const evidence = findLatestBranchContextEvidence(entries);
	if (!evidence) {
		return { type: "none" };
	}
	return { type: "resolved", branchName: evidence.branch, evidence };
}

export interface InferredBranchConfirmationContext {
	hasUI?: boolean;
	ui: Pick<UiLike, "confirm" | "notify">;
}

/**
 * Confirm an inferred branch-context branch with the user before opening it.
 * `destinationDescription` names the host destination, for example
 * "open it in a new cmux workspace".
 */
export async function confirmInferredBranchContext(
	ctx: InferredBranchConfirmationContext,
	options: {
		commandName: string;
		evidence: BranchContextEvidence;
		destinationDescription: string;
	},
): Promise<boolean> {
	if (!ctx.hasUI || ctx.ui.confirm === undefined) {
		ctx.ui.notify(
			`Cannot infer /${options.commandName} branch without an interactive confirmation UI.`,
			"error",
		);
		return false;
	}

	const { evidence } = options;
	return ctx.ui.confirm(
		"Use branch context?",
		[
			`Use branch "${evidence.branch}" from the latest [branch-context-output] and ${options.destinationDescription}?`,
			"",
			`Key: ${evidence.key}`,
			`Branch creation: ${evidence.branchCreation}`,
			`Start point: ${evidence.startPoint}`,
			`Commit: ${evidence.commit}`,
			`Source file: ${evidence.sourceFile}`,
		].join("\n"),
	);
}
