import type { GitGateway } from "@nseng-ai/foundation/git";
import { truncateTextHead } from "@nseng-ai/foundation/text-truncation";
import type { CommandContext } from "@nseng-ai/extension-kit/pi-types";

export const LOCAL_TRUNK_CHOICE_LABEL = "Local trunk";
export const CURRENT_BRANCH_CHOICE_PREFIX = "Current branch";

const SELECT_TITLE = "Choose implementation branch basis";
const CONFIRM_TITLE = "Implement from local trunk?";
const MAX_GIT_FAILURE_MESSAGE_CHARS = 500;

export type ImplBranchBasisResult =
	| { type: "selected"; basis: "current"; currentBranch: string }
	| { type: "selected"; basis: "trunk" }
	| { type: "cancelled" }
	| { type: "failed"; message: string };

export interface ResolveImplBranchBasisOptions {
	cwd: string;
	git: Pick<GitGateway, "currentBranch">;
	interaction: Pick<CommandContext, "hasUI" | "ui">;
}

export async function resolveImplBranchBasis(
	options: ResolveImplBranchBasisOptions,
): Promise<ImplBranchBasisResult> {
	const current = await options.git.currentBranch({ cwd: options.cwd });
	if (current.type === "branch") {
		if (current.branch === "main" || current.branch === "master") {
			return { type: "selected", basis: "trunk" };
		}
		if (options.interaction.hasUI !== true || options.interaction.ui.select === undefined) {
			return interactionUnavailable("choose the current branch or local trunk");
		}
		const currentLabel = formatCurrentBranchChoice(current.branch);
		const selected = await options.interaction.ui.select(SELECT_TITLE, [
			currentLabel,
			LOCAL_TRUNK_CHOICE_LABEL,
		]);
		if (selected === undefined) return { type: "cancelled" };
		if (selected === currentLabel) {
			return { type: "selected", basis: "current", currentBranch: current.branch };
		}
		if (selected === LOCAL_TRUNK_CHOICE_LABEL) {
			return { type: "selected", basis: "trunk" };
		}
		return { type: "failed", message: "The branch-basis selector returned an unknown choice." };
	}

	const reason =
		current.type === "detached"
			? "The current Git HEAD is detached, so current-branch implementation is unavailable."
			: `The current Git branch could not be determined, so current-branch implementation is unavailable.\n${truncateTextHead(
					{
						value: current.error.message,
						maxChars: MAX_GIT_FAILURE_MESSAGE_CHARS,
						buildMarker: () => "…",
						shouldTrimInput: true,
					},
				)}`;
	if (options.interaction.hasUI !== true || options.interaction.ui.confirm === undefined) {
		return interactionUnavailable("confirm local-trunk fallback", reason);
	}
	const confirmed = await options.interaction.ui.confirm(
		CONFIRM_TITLE,
		`${reason}\n\nUse the existing local Graphite trunk and implement from it instead?`,
	);
	return confirmed ? { type: "selected", basis: "trunk" } : { type: "cancelled" };
}

export function formatCurrentBranchChoice(branch: string): string {
	return `${CURRENT_BRANCH_CHOICE_PREFIX} (${branch})`;
}

function interactionUnavailable(action: string, context?: string): ImplBranchBasisResult {
	return {
		type: "failed",
		message: [context, `Interactive UI is required to ${action}. Rerun this command interactively.`]
			.filter((line): line is string => line !== undefined)
			.join("\n"),
	};
}
