import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { stripTerminalEscapes } from "@nseng-ai/foundation/terminal-escapes";

import {
	defineFailureCatalog,
	formatFailureCatalogEntry,
} from "../phase-stream/failure-catalog.ts";
import type { SubmitCommandOutput } from "./submit.ts";
import { formatItemCount } from "./submit-format.ts";

export type CurrentPrVerificationFailureCause = "startup_error" | "timeout" | "command_failed";

export type SubmitCurrentPrVerificationFailure = {
	[K in "no_current_pr" | CurrentPrVerificationFailureCause]: {
		kind: K;
		output: SubmitFailureOutput;
	};
}["no_current_pr" | CurrentPrVerificationFailureCause];

export interface SubmitSemanticFailureCause {
	kind: "empty_branch_skipped";
	branchName?: string;
}

export interface RemoteSyncDiagnostics {
	upstream: string;
	aheadCount?: number;
	behindCount?: number;
	remoteOnlyCommits?: readonly string[];
}

export type SubmitPreflightFailureCause =
	| { kind: "trunk_out_of_date" }
	| { kind: "merged_pr_not_in_trunk" }
	| {
			kind: "remote_updated_outside_graphite";
			branchName?: string;
			remoteSync?: RemoteSyncDiagnostics;
	  }
	| SubmitSemanticFailureCause;

export type SubmitFailureOutput = SubmitCommandOutput;

interface SubmitPreflightFailureContext {
	output: SubmitFailureOutput;
}

const submitPreflightFailureCatalog = defineFailureCatalog<
	SubmitPreflightFailureCause,
	undefined,
	SubmitPreflightFailureContext
>()({
	empty_branch_skipped: {
		message: (failure) => formatEmptyBranchFailure(failure.branchName),
	},
	trunk_out_of_date: {
		message: () =>
			[
				"Graphite could not update your local trunk before submitting. Nothing was submitted.",
				"",
				"Fix: update or repair your local trunk checkout (resolve any specific trunk problem Graphite reported), then rerun `ns flow submit`.",
			].join("\n"),
	},
	merged_pr_not_in_trunk: {
		message: (_failure, context) => formatMergedPrNotInTrunk(context.output),
	},
	remote_updated_outside_graphite: {
		message: (failure) =>
			formatRemoteUpdatedOutsideGraphitePreflight({
				...optionalEntry("branchName", failure.branchName),
				...optionalEntry("remoteSync", failure.remoteSync),
			}),
	},
});

const submitSemanticFailureCatalog = defineFailureCatalog<
	SubmitSemanticFailureCause,
	undefined,
	undefined
>()({
	empty_branch_skipped: {
		message: (failure) =>
			failure.branchName === undefined
				? "gt submit exited 0, but Graphite skipped submitting part of the submit scope because a branch is empty."
				: `gt submit exited 0, but Graphite skipped submitting part of the submit scope because branch ${failure.branchName} is empty.`,
	},
});

const currentPrVerificationFailureCatalog = defineFailureCatalog<
	SubmitCurrentPrVerificationFailure,
	undefined,
	undefined
>()({
	no_current_pr: {
		message: () => "gt submit exited 0, but the current branch still has no PR.",
	},
	startup_error: {
		message: (failure) =>
			`gt submit exited 0, but current PR verification could not start: ${failure.output.startupError ?? "unknown startup error"}`,
	},
	timeout: {
		message: () => "gt submit exited 0, but current PR verification timed out after 60s.",
	},
	command_failed: {
		message: (failure) =>
			`gt submit exited 0, but current PR verification failed with exit code ${failure.output.exitCode}.`,
	},
});

export function formatSubmitPreflightFailureCause(
	failure: SubmitPreflightFailureCause,
	output: SubmitFailureOutput,
): string {
	return formatFailureCatalogEntry(submitPreflightFailureCatalog, failure, { output });
}

export function formatSubmitSemanticFailureCause(failure: SubmitSemanticFailureCause): string {
	return formatFailureCatalogEntry(submitSemanticFailureCatalog, failure, undefined);
}

export function formatCurrentPrVerificationFailureCause(
	failure: SubmitCurrentPrVerificationFailure,
): string {
	return formatFailureCatalogEntry(currentPrVerificationFailureCatalog, failure, undefined);
}

function formatEmptyBranchFailure(branchName: string | undefined): string {
	const isUnknownBranch = branchName === undefined;
	const branchLine = isUnknownBranch ? "▸ <unknown empty branch>" : `▸ ${branchName}`;
	const deleteGuidance = isUnknownBranch
		? "If the empty branch has no remaining work, delete it (switch to its parent/downstack branch first if it is checked out), then rerun `ns flow submit`."
		: `If ${branchName} has no remaining work, delete it, then rerun \`ns flow submit\`:`;
	return [
		"WARNING: This branch does not introduce any changes:",
		branchLine,
		"",
		"Graphite will not submit empty branches because GitHub rejects empty PRs. Nothing was submitted.",
		"",
		deleteGuidance,
		...(isUnknownBranch
			? []
			: [
					`    gt delete ${branchName} -f -q`,
					"(switch to its parent/downstack branch first if Graphite cannot delete the checked-out branch)",
				]),
		isUnknownBranch
			? "Otherwise, commit real changes to it, then rerun `ns flow submit`."
			: `Otherwise, commit real changes to ${branchName}, then rerun \`ns flow submit\`.`,
	].join("\n");
}

function formatRemoteUpdatedOutsideGraphitePreflight(input: {
	branchName?: string;
	remoteSync?: RemoteSyncDiagnostics;
}): string {
	const subject = input.branchName === undefined ? "This branch" : `Branch ${input.branchName}`;
	return [
		`${subject} is out of sync with its upstream PR branch, so Graphite blocked the submit. Nothing was submitted.`,
		formatRemoteSyncDetails(input.remoteSync),
		"Fix:    run `gt sync` (or `gt get`), then rerun `ns flow submit`.",
		"Bypass: `ns flow submit --force` skips Graphite's remote-update check.",
	].join("\n");
}

function formatRemoteSyncDetails(remoteSync: RemoteSyncDiagnostics | undefined): string {
	if (remoteSync === undefined) return "";

	const lines = [
		`Remote checked: ${remoteSync.upstream} (this is the PR branch, not trunk/master).`,
		`Why: ${formatRemoteDivergence(remoteSync)}`,
		"Possible cause: the PR branch was pushed/submitted from another checkout, or this local branch was rewritten after an earlier submit.",
	];
	if (remoteSync.remoteOnlyCommits !== undefined && remoteSync.remoteOnlyCommits.length > 0) {
		lines.push(`Remote-only commits on ${remoteSync.upstream} (not in local HEAD):`);
		for (const commit of remoteSync.remoteOnlyCommits) {
			lines.push(`  - ${commit}`);
		}
		if (
			remoteSync.behindCount !== undefined &&
			remoteSync.behindCount > remoteSync.remoteOnlyCommits.length
		) {
			lines.push(
				`  - … ${formatItemCount(remoteSync.behindCount - remoteSync.remoteOnlyCommits.length, "more commit", "more commits")}`,
			);
		}
	}
	return `${lines.join("\n")}\n`;
}

function formatRemoteDivergence(remoteSync: RemoteSyncDiagnostics): string {
	if (remoteSync.aheadCount === undefined || remoteSync.behindCount === undefined) {
		return `remote branch ${remoteSync.upstream} changed outside Graphite; local ahead/behind counts could not be computed.`;
	}
	if (remoteSync.aheadCount === 0 && remoteSync.behindCount === 0) {
		return `git reports local HEAD and ${remoteSync.upstream} are not divergent; Graphite metadata may be stale.`;
	}
	if (remoteSync.aheadCount === 0) {
		return `local HEAD is ${formatItemCount(remoteSync.behindCount, "commit", "commits")} behind ${remoteSync.upstream}.`;
	}
	if (remoteSync.behindCount === 0) {
		return `local HEAD is ${formatItemCount(remoteSync.aheadCount, "commit", "commits")} ahead of ${remoteSync.upstream}; Graphite metadata may be stale.`;
	}
	return `local HEAD is ${formatItemCount(remoteSync.aheadCount, "commit", "commits")} ahead of and ${formatItemCount(remoteSync.behindCount, "commit", "commits")} behind ${remoteSync.upstream}.`;
}

interface MergedPrNotInTrunkDetails {
	branch?: string;
	prNumber?: string;
	prState?: string;
	trunk?: string;
}

function formatMergedPrNotInTrunk(output: SubmitFailureOutput): string {
	const details = parseMergedPrNotInTrunkDetails(output);
	const affectedBranch = details.branch ?? "the affected branch";
	const trunkName = details.trunk ?? "trunk";
	const identityLine =
		details.branch === undefined
			? undefined
			: `Branch ${formatMergedPrBranchDetails(details)}${details.trunk === undefined ? "" : `; trunk ${details.trunk}`}.`;
	return [
		`A merged PR in this stack is not in ${details.trunk === undefined ? "the current trunk" : `trunk ${details.trunk}`}, so Graphite will not submit the stack. Nothing was submitted.`,
		identityLine,
		"",
		`Fix: ensure ${trunkName} contains the merged PR's commits, or reparent ${affectedBranch} onto a trunk that already contains them, then rerun \`ns flow submit\`.`,
	]
		.filter((line): line is string => line !== undefined)
		.join("\n");
}

function parseMergedPrNotInTrunkDetails(output: SubmitFailureOutput): MergedPrNotInTrunkDetails {
	const text = stripTerminalEscapes(`${output.stdout}\n${output.stderr}`).replace(/\r/g, "\n");
	const branchMatch = text.match(
		/^\s*▸\s*(?<branch>\S+)(?:\s+-\s+PR\s+#(?<prNumber>\d+)\s+\((?<prState>[^)]+)\))?/mu,
	);
	const trunkMatch = text.match(/latest trunk branch (?<trunk>[^\s.]+)\./iu);
	return {
		...(branchMatch?.groups?.branch === undefined ? {} : { branch: branchMatch.groups.branch }),
		...(branchMatch?.groups?.prNumber === undefined
			? {}
			: { prNumber: branchMatch.groups.prNumber }),
		...(branchMatch?.groups?.prState === undefined ? {} : { prState: branchMatch.groups.prState }),
		...(trunkMatch?.groups?.trunk === undefined ? {} : { trunk: trunkMatch.groups.trunk }),
	};
}

function formatMergedPrBranchDetails(details: MergedPrNotInTrunkDetails): string {
	const prSuffix =
		details.prNumber === undefined
			? ""
			: ` (PR #${details.prNumber}${formatPrState(details.prState)})`;
	return `${details.branch ?? "unknown"}${prSuffix}`;
}

function formatPrState(prState: string | undefined): string {
	return prState === undefined || prState.trim() === "" ? "" : `, ${prState.trim()}`;
}
