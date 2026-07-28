import {
	createTrackedBranchForPrompt,
	createTrackedBranchFromLocalTrunkForPrompt,
	type TrackedBranchEvidence,
} from "@nseng-ai/extension-kit/tracked-branch-payload";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
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

type SelectedImplBranchBasis = Extract<ImplBranchBasisResult, { type: "selected" }>;

export async function createTrackedBranchForBasis(
	deps: {
		readonly pi: CommandExecApi;
		readonly trunkBranch: string;
		readonly git: Pick<
			GitGateway,
			"createBranchAtStartPoint" | "currentBranch" | "headCommit" | "repoRoot"
		>;
	},
	options: {
		readonly cwd: string;
		readonly prompt: string;
		readonly selection: SelectedImplBranchBasis;
		readonly notifyProgress: (message: string) => void;
	},
): Promise<TrackedBranchEvidence | { error: string }> {
	if (options.selection.basis === "current") {
		const revalidated = await deps.git.currentBranch({ cwd: options.cwd });
		if (revalidated.type !== "branch" || revalidated.branch !== options.selection.currentBranch) {
			return {
				error: `Current branch changed after selection; expected ${options.selection.currentBranch}. No branch was created.`,
			};
		}
		options.notifyProgress("Generating branch name…");
		return createTrackedBranchForPrompt(
			{ pi: deps.pi, git: deps.git },
			{ cwd: options.cwd, prompt: options.prompt },
		);
	}
	return createTrackedBranchFromLocalTrunkForPrompt(
		{ pi: deps.pi, trunkBranch: deps.trunkBranch, git: deps.git },
		{ cwd: options.cwd, prompt: options.prompt, notify: options.notifyProgress },
	);
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
