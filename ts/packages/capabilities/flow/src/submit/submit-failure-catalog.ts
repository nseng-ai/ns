import { optionalEntry } from "@sdl/core/primitives";
import { stripTerminalEscapes } from "@sdl/core/terminal-escapes";

import { defineFailureCatalog } from "../phase-stream/failure-catalog.ts";

export type SubmitFailureVerdict = "deterministic";

export type CurrentPrVerificationFailureCause = "startup_error" | "timeout" | "command_failed";

export type SubmitCurrentPrVerificationFailure = {
	kind: "no_current_pr" | CurrentPrVerificationFailureCause;
	output: SubmitFailureOutput;
};

export type SubmitSemanticFailureCause = {
	kind: "empty_branch_skipped";
	branchName?: string;
};

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

export interface SubmitFailureOutput {
	stdout: string;
	stderr: string;
	exitCode: number;
	startupError?: string;
	killed?: boolean;
}

interface SubmitPreflightFailureContext {
	output: SubmitFailureOutput;
}

const submitPreflightFailureCatalog = defineFailureCatalog<
	SubmitPreflightFailureCause,
	SubmitFailureVerdict,
	SubmitPreflightFailureContext
>()({
	empty_branch_skipped: {
		arm: "empty_branch_skipped",
		verdict: "deterministic",
		message: (failure) =>
			formatEmptyBranchFailure(
				expectSubmitPreflightFailureKind(failure, "empty_branch_skipped").branchName,
			),
	},
	trunk_out_of_date: {
		arm: "trunk_out_of_date",
		verdict: "deterministic",
		message: () =>
			[
				"Graphite could not update your local trunk before submitting. Nothing was submitted.",
				"",
				"Fix: update or repair your local trunk checkout (resolve any specific trunk problem Graphite reported), then rerun `sdl flow submit`.",
			].join("\n"),
	},
	merged_pr_not_in_trunk: {
		arm: "merged_pr_not_in_trunk",
		verdict: "deterministic",
		message: (_failure, context) => formatMergedPrNotInTrunk(context.output),
	},
	remote_updated_outside_graphite: {
		arm: "remote_updated_outside_graphite",
		verdict: "deterministic",
		message: (failure) => {
			const remoteFailure = expectSubmitPreflightFailureKind(
				failure,
				"remote_updated_outside_graphite",
			);
			return formatRemoteUpdatedOutsideGraphitePreflight({
				...optionalEntry("branchName", remoteFailure.branchName),
				...optionalEntry("remoteSync", remoteFailure.remoteSync),
			});
		},
	},
});

const submitSemanticFailureCatalog = defineFailureCatalog<
	SubmitSemanticFailureCause,
	SubmitFailureVerdict,
	undefined
>()({
	empty_branch_skipped: {
		arm: "empty_branch_skipped",
		verdict: "deterministic",
		message: (failure) => {
			const emptyBranch = expectSubmitSemanticFailureKind(failure, "empty_branch_skipped");
			return emptyBranch.branchName === undefined
				? "gt submit exited 0, but Graphite skipped submitting part of the submit scope because a branch is empty."
				: `gt submit exited 0, but Graphite skipped submitting part of the submit scope because branch ${emptyBranch.branchName} is empty.`;
		},
	},
});

const currentPrVerificationFailureCatalog = defineFailureCatalog<
	SubmitCurrentPrVerificationFailure,
	SubmitFailureVerdict,
	undefined
>()({
	no_current_pr: {
		arm: "no_current_pr",
		verdict: "deterministic",
		message: () => "gt submit exited 0, but the current branch still has no PR.",
	},
	startup_error: {
		arm: "startup_error",
		verdict: "deterministic",
		message: (failure) =>
			`gt submit exited 0, but current PR verification could not start: ${failure.output.startupError ?? "unknown startup error"}`,
	},
	timeout: {
		arm: "timeout",
		verdict: "deterministic",
		message: () => "gt submit exited 0, but current PR verification timed out after 60s.",
	},
	command_failed: {
		arm: "command_failed",
		verdict: "deterministic",
		message: (failure) =>
			`gt submit exited 0, but current PR verification failed with exit code ${failure.output.exitCode}.`,
	},
});

export function formatSubmitPreflightFailureCause(
	failure: SubmitPreflightFailureCause,
	output: SubmitFailureOutput,
): string {
	return submitPreflightFailureCatalog[failure.kind].message(failure, { output });
}

export function formatSubmitSemanticFailureCause(failure: SubmitSemanticFailureCause): string {
	return submitSemanticFailureCatalog[failure.kind].message(failure, undefined);
}

export function formatCurrentPrVerificationFailureCause(
	failure: SubmitCurrentPrVerificationFailure,
): string {
	return currentPrVerificationFailureCatalog[failure.kind].message(failure, undefined);
}

function expectSubmitPreflightFailureKind<K extends SubmitPreflightFailureCause["kind"]>(
	failure: SubmitPreflightFailureCause,
	kind: K,
): Extract<SubmitPreflightFailureCause, { kind: K }> {
	if (failure.kind !== kind) {
		throw new Error(`Submit failure catalog mismatch: expected ${kind}, got ${failure.kind}`);
	}
	return failure as Extract<SubmitPreflightFailureCause, { kind: K }>;
}

function expectSubmitSemanticFailureKind<K extends SubmitSemanticFailureCause["kind"]>(
	failure: SubmitSemanticFailureCause,
	kind: K,
): Extract<SubmitSemanticFailureCause, { kind: K }> {
	if (failure.kind !== kind) {
		throw new Error(
			`Submit semantic failure catalog mismatch: expected ${kind}, got ${failure.kind}`,
		);
	}
	return failure as Extract<SubmitSemanticFailureCause, { kind: K }>;
}

function formatEmptyBranchFailure(branchName: string | undefined): string {
	if (branchName === undefined) {
		return [
			"The submit stack contains an empty branch, so Graphite will not submit it (GitHub rejects empty PRs). Nothing was submitted.",
			"",
			"If the empty branch has no remaining work, delete it (switch to its parent/downstack branch first if it is checked out), then rerun `sdl flow submit`.",
			"Otherwise, commit real changes to it, then rerun `sdl flow submit`.",
		].join("\n");
	}
	return [
		`Branch ${branchName} is empty, so Graphite will not submit it (GitHub rejects empty PRs). Nothing was submitted.`,
		"",
		`If ${branchName} has no remaining work, delete it, then rerun \`sdl flow submit\`:`,
		`    gt delete ${branchName} -f -q`,
		"(switch to its parent/downstack branch first if Graphite cannot delete the checked-out branch)",
		`Otherwise, commit real changes to ${branchName}, then rerun \`sdl flow submit\`.`,
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
		"Fix:    run `gt sync` (or `gt get`), then rerun `sdl flow submit`.",
		"Bypass: `sdl flow submit --force` skips Graphite's remote-update check.",
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

function formatItemCount(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
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
		`Fix: ensure ${trunkName} contains the merged PR's commits, or reparent ${affectedBranch} onto a trunk that already contains them, then rerun \`sdl flow submit\`.`,
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
