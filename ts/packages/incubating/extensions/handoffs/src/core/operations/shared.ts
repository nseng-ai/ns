import { validateBranchName, type BrmemErrorInfo } from "@nseng-ai/brmem";
import { confirmInteractiveOrUsageError, type ConfirmationResult } from "@nseng-ai/clinkr";
import { failure, type ClinkrExit, type ClinkrFailureExit } from "@nseng-ai/clinkr/legacy";
import {
	MODEL_OPERATION_IDS,
	resolveEffectiveModelOperation,
} from "@nseng-ai/extension-kit/model-policy";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

import type { HandoffCliContext } from "../context.ts";

export type Resolved<T> = { type: "resolved"; value: T } | ClinkrExit<never>;
export function resolved<T>(value: T): Resolved<T> {
	return { type: "resolved", value };
}

export async function resolveHandoffSlugModel(
	ctx: HandoffCliContext,
): Promise<Resolved<ModelSelection>> {
	const model = await resolveEffectiveModelOperation(ctx.projectConfig, MODEL_OPERATION_IDS.slug);
	if (!model.ok) {
		if (model.error.type === "project-config") {
			const error = model.error.error;
			if (error.code === "project-not-found") {
				return failure(
					"handoff-slug-derivation-failed",
					"Could not determine the repository root for ns.toml.",
				);
			}
			if (error.code === "project-discovery-failed") {
				return failure(
					"handoff-slug-derivation-failed",
					`Could not determine the repository root for ns.toml: ${error.message}`,
				);
			}
			const message =
				error.code === "invalid-source"
					? (error.diagnostics[0]?.message ?? `${error.path}: invalid ns.toml`)
					: error.message;
			return failure(
				"handoff-slug-derivation-failed",
				`Invalid model policy in ns.toml: ${message}`,
			);
		}
		return failure(
			"handoff-slug-derivation-failed",
			`Invalid model policy in ns.toml: ${model.error.error.message}`,
		);
	}
	return resolved(model.value.selection);
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
	| ConfirmationResult
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
