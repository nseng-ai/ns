import type { CommandExecApi } from "@asdl/core/exec";
import type { BranchContextBrmemGateway } from "./brmem-gateway.ts";
import { selectAttachedPlanKey } from "./attached-plan.ts";
import type { BranchContextContext } from "./context.ts";
import { BRANCH_CONTEXT_NAMESPACE } from "./constants.ts";
import { extractBranchContextEvidenceFromSessionEntry } from "./session-artifact.ts";

export type ExistingBranchContextReuseSource =
	| "explicit-branch"
	| "session-output"
	| "current-branch";

export interface ExistingBranchContextReuse {
	branch: string;
	key: string;
	source: ExistingBranchContextReuseSource;
}

export interface ExistingBranchContextCandidate {
	branch: string;
	source: ExistingBranchContextReuseSource;
	requestedKey?: string;
}

export interface ResolveExistingBranchContextReuseParams {
	explicitBranch?: string;
	sessionEntries?: readonly unknown[];
}

export interface ResolveExistingBranchContextReuseOptions {
	cwd: string;
	context: BranchContextContext;
	signal?: AbortSignal | undefined;
}

type ReuseVerificationFailure =
	| { type: "candidate"; candidate: ExistingBranchContextCandidate; message: string }
	| { type: "current-branch-resolution"; message: string };

type CandidateVerification =
	| { type: "verified"; reuse: ExistingBranchContextReuse }
	| { type: "failure"; message: string };

export async function resolveExistingBranchContextReuse(
	_pi: CommandExecApi,
	params: ResolveExistingBranchContextReuseParams,
	options: ResolveExistingBranchContextReuseOptions,
): Promise<ExistingBranchContextReuse> {
	const brmem = options.context.brmem;
	const failures: ReuseVerificationFailure[] = [];

	const explicitBranch = params.explicitBranch;
	if (explicitBranch !== undefined) {
		const candidate: ExistingBranchContextCandidate = {
			branch: explicitBranch,
			source: "explicit-branch",
		};
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
				"Multiple existing branch-context candidates were found in this session.",
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

	const branch = await options.context.git.currentBranch({
		cwd: options.cwd,
		signal: options.signal,
	});
	if (branch.type === "branch") {
		const candidate: ExistingBranchContextCandidate = {
			branch: branch.branch,
			source: "current-branch",
		};
		const result = await verifyCandidate(brmem, options, candidate);
		if (result.type === "verified") {
			return result.reuse;
		}
		failures.push({ type: "candidate", candidate, message: result.message });
	} else if (branch.type === "detached") {
		failures.push({ type: "current-branch-resolution", message: "Current HEAD is detached." });
	} else {
		failures.push({ type: "current-branch-resolution", message: branch.error.message });
	}

	throw buildNoReusableBranchError(failures);
}

async function verifyCandidate(
	brmem: BranchContextBrmemGateway,
	options: ResolveExistingBranchContextReuseOptions,
	candidate: ExistingBranchContextCandidate,
): Promise<CandidateVerification> {
	if (candidate.requestedKey !== undefined) {
		const key = candidate.requestedKey;
		const presence = await brmem.attachmentPresence({
			cwd: options.cwd,
			branch: candidate.branch,
			key,
			signal: options.signal,
		});
		if (presence.type === "present") {
			return {
				type: "verified",
				reuse: { branch: candidate.branch, key, source: candidate.source },
			};
		}
		if (presence.type === "absent") {
			return { type: "failure", message: `Branch-context key \`${key}\` is absent.` };
		}
		return { type: "failure", message: presence.error.message };
	}

	const list = await brmem.listAttachedPlans({
		cwd: options.cwd,
		branch: candidate.branch,
		signal: options.signal,
	});
	if (!list.ok) {
		return { type: "failure", message: list.error.message };
	}
	try {
		const key = selectAttachedPlanKey({ branch: candidate.branch, entries: list.value });
		return { type: "verified", reuse: { branch: candidate.branch, key, source: candidate.source } };
	} catch (error) {
		return { type: "failure", message: error instanceof Error ? error.message : String(error) };
	}
}

function collectSessionCandidates(entries: readonly unknown[]): ExistingBranchContextCandidate[] {
	const candidates: ExistingBranchContextCandidate[] = [];
	for (const entry of entries) {
		const evidence = extractBranchContextEvidenceFromSessionEntry(entry);
		if (evidence === undefined || evidence.namespace !== BRANCH_CONTEXT_NAMESPACE) {
			continue;
		}
		const candidate = {
			branch: evidence.branch,
			requestedKey: evidence.key,
			source: "session-output",
		} as const;
		if (
			!candidates.some(
				(existing) =>
					existing.branch === candidate.branch && existing.requestedKey === candidate.requestedKey,
			)
		) {
			candidates.push(candidate);
		}
	}
	return candidates;
}

function buildNoReusableBranchError(failures: readonly ReuseVerificationFailure[]): Error {
	return new Error(
		[
			"No existing branch context with an attached plan could be reused.",
			"",
			"Verification failures:",
			...failures.map(formatVerificationFailureListItem),
		].join("\n"),
	);
}

export function formatExistingBranchContextReuse(reuse: ExistingBranchContextReuse): string {
	return [
		"Existing branch context with attached plan:",
		`Branch: ${reuse.branch}`,
		`Branch Memory namespace: ${BRANCH_CONTEXT_NAMESPACE}`,
		`Branch Memory key: ${reuse.key}`,
		`Reuse source: ${formatExistingReuseSource(reuse.source)}`,
	].join("\n");
}

function formatExistingReuseSource(source: ExistingBranchContextReuseSource): string {
	switch (source) {
		case "explicit-branch":
			return "explicit --branch";
		case "session-output":
			return "current session branch-context output";
		case "current-branch":
			return "current branch";
	}
}

function formatCandidateListItem(candidate: ExistingBranchContextCandidate): string {
	const keyPart =
		candidate.requestedKey === undefined
			? "attached key: auto-select"
			: `attached key: ${candidate.requestedKey}`;
	return `- ${candidate.branch} (${keyPart}; source: ${formatExistingReuseSource(candidate.source)})`;
}

function formatVerificationFailureListItem(failure: ReuseVerificationFailure): string {
	if (failure.type === "candidate") {
		return `${formatCandidateListItem(failure.candidate)}\n  ${failure.message}`;
	}
	return `- could not resolve current branch:\n  ${failure.message}`;
}
