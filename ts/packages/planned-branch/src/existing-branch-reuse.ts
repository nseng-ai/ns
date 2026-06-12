import type { CommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";
import { formatErrorMessage } from "@asdl/core/primitives";

import { selectAttachedPlanKey } from "./attached-plan.ts";
import { RealPlannedBranchBrmemGateway, type PlannedBranchBrmemGateway } from "./brmem-gateway.ts";
import { PLAN_BRANCH_NAMESPACE } from "./constants.ts";
import { extractPlannedBranchEvidenceFromSessionEntry } from "./session-artifact.ts";

export type ExistingPlannedBranchReuseSource = "explicit-branch" | "session-output" | "current-branch";

export interface ExistingPlannedBranchReuse {
	branch: string;
	key: string;
	source: ExistingPlannedBranchReuseSource;
}

export interface ExistingPlannedBranchCandidate {
	branch: string;
	source: ExistingPlannedBranchReuseSource;
	requestedKey?: string;
}

export interface ResolveExistingPlannedBranchReuseParams {
	explicitBranch?: string;
	sessionEntries?: readonly unknown[];
}

export interface ResolveExistingPlannedBranchReuseOptions {
	cwd: string;
	signal?: AbortSignal | undefined;
	git?: GitGateway | undefined;
	brmem?: PlannedBranchBrmemGateway | undefined;
}

type ReuseVerificationFailure =
	| { type: "candidate"; candidate: ExistingPlannedBranchCandidate; message: string }
	| { type: "current-branch-resolution"; message: string };

type CandidateVerification = { type: "verified"; reuse: ExistingPlannedBranchReuse } | { type: "failure"; message: string };

export async function resolveExistingPlannedBranchReuse(
	pi: CommandExecApi,
	params: ResolveExistingPlannedBranchReuseParams,
	options: ResolveExistingPlannedBranchReuseOptions,
): Promise<ExistingPlannedBranchReuse> {
	const brmem = options.brmem ?? new RealPlannedBranchBrmemGateway(pi);
	const failures: ReuseVerificationFailure[] = [];

	const explicitBranch = params.explicitBranch;
	if (explicitBranch !== undefined) {
		const candidate: ExistingPlannedBranchCandidate = { branch: explicitBranch, source: "explicit-branch" };
		const result = await verifyCandidate(brmem, options, candidate);
		if (result.type === "verified") {
			return result.reuse;
		}
		throw buildNoReusableBranchError([{ type: "candidate", candidate, message: result.message }]);
	}

	const sessionCandidates = collectSessionCandidates(params.sessionEntries ?? []);
	if (sessionCandidates.length > 1) {
		throw new Error(
			[
				"Multiple existing planned-branch candidates were found in this session.",
				"Rerun with `--branch <target-branch>` to choose explicitly.",
				"",
				"Candidates:",
				...sessionCandidates.map(formatCandidateListItem),
			].join("\n"),
		);
	}

	const sessionCandidate = sessionCandidates[0];
	if (sessionCandidate !== undefined) {
		const result = await verifyCandidate(brmem, options, sessionCandidate);
		if (result.type === "verified") {
			return result.reuse;
		}
		failures.push({ type: "candidate", candidate: sessionCandidate, message: result.message });
	}

	const git = options.git ?? new RealGitGateway(pi);
	const branch = await git.currentBranch({ cwd: options.cwd, signal: options.signal });
	if (branch.ok) {
		const candidate: ExistingPlannedBranchCandidate = { branch: branch.value, source: "current-branch" };
		const result = await verifyCandidate(brmem, options, candidate);
		if (result.type === "verified") {
			return result.reuse;
		}
		failures.push({ type: "candidate", candidate, message: result.message });
	} else {
		failures.push({ type: "current-branch-resolution", message: branch.error.message });
	}

	throw buildNoReusableBranchError(failures);
}

async function verifyCandidate(
	brmem: PlannedBranchBrmemGateway,
	options: ResolveExistingPlannedBranchReuseOptions,
	candidate: ExistingPlannedBranchCandidate,
): Promise<CandidateVerification> {
	const list = await brmem.listAttachedPlans({ cwd: options.cwd, branch: candidate.branch, signal: options.signal });
	if (!list.ok) {
		return { type: "failure", message: list.error.message };
	}

	try {
		const key =
			candidate.requestedKey === undefined
				? selectAttachedPlanKey({ branch: candidate.branch, entries: list.value })
				: selectAttachedPlanKey({ branch: candidate.branch, requestedKey: candidate.requestedKey, entries: list.value });
		return { type: "verified", reuse: { branch: candidate.branch, key, source: candidate.source } };
	} catch (error) {
		return { type: "failure", message: formatErrorMessage(error) };
	}
}

function collectSessionCandidates(entries: readonly unknown[]): ExistingPlannedBranchCandidate[] {
	const candidates: ExistingPlannedBranchCandidate[] = [];
	for (const entry of entries) {
		const evidence = extractPlannedBranchEvidenceFromSessionEntry(entry);
		if (evidence === undefined || evidence.namespace !== PLAN_BRANCH_NAMESPACE) {
			continue;
		}
		const candidate = { branch: evidence.branch, requestedKey: evidence.key, source: "session-output" } as const;
		if (!candidates.some((existing) => existing.branch === candidate.branch && existing.requestedKey === candidate.requestedKey)) {
			candidates.push(candidate);
		}
	}
	return candidates;
}

function buildNoReusableBranchError(failures: readonly ReuseVerificationFailure[]): Error {
	return new Error(
		[
			"No existing planned branch with an attached plan could be reused.",
			"",
			"Verification failures:",
			...failures.map(formatVerificationFailureListItem),
		].join("\n"),
	);
}

export function formatExistingPlannedBranchReuse(reuse: ExistingPlannedBranchReuse): string {
	return [
		"Existing planned branch with attached plan:",
		`Branch: ${reuse.branch}`,
		`Branch Memory namespace: ${PLAN_BRANCH_NAMESPACE}`,
		`Branch Memory key: ${reuse.key}`,
		`Reuse source: ${formatExistingReuseSource(reuse.source)}`,
	].join("\n");
}

function formatExistingReuseSource(source: ExistingPlannedBranchReuseSource): string {
	switch (source) {
		case "explicit-branch":
			return "explicit --branch";
		case "session-output":
			return "current session planned-branch output";
		case "current-branch":
			return "current branch";
	}
}

function formatCandidateListItem(candidate: ExistingPlannedBranchCandidate): string {
	const keyPart = candidate.requestedKey === undefined ? "attached key: auto-select" : `attached key: ${candidate.requestedKey}`;
	return `- ${candidate.branch} (${keyPart}; source: ${formatExistingReuseSource(candidate.source)})`;
}

function formatVerificationFailureListItem(failure: ReuseVerificationFailure): string {
	if (failure.type === "candidate") {
		return `${formatCandidateListItem(failure.candidate)}\n  ${failure.message}`;
	}
	return `- could not resolve current branch:\n  ${failure.message}`;
}
