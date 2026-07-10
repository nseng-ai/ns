import type { ExecResult } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { stripTerminalEscapes } from "@nseng-ai/foundation/terminal-escapes";
import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";

import {
	isGitPorcelainUnmergedStatus,
	parseGitPorcelainStatusOutput,
} from "../changes/git-porcelain.ts";
import type {
	SubmitPreflightFailureCause,
	SubmitSemanticFailureCause,
} from "./submit-failure-catalog.ts";

export type SubmitOutputLike = ExecResult;

export function joinOutput(output: Pick<SubmitOutputLike, "stdout" | "stderr">): string {
	return `${output.stdout}\n${output.stderr}`;
}

export function detectRestackNeeded(output: string): boolean {
	const strippedOutput = stripTerminalEscapes(output).replace(/\r/g, "\n");
	const mentionsRestack = /\brestack(?:ed|ing)?\b/i.test(strippedOutput);
	const requiresRestackBeforeSubmit =
		/before submit(?:ting|sion)?/i.test(strippedOutput) ||
		/need(?:s|ed)? to be restacked/i.test(strippedOutput) ||
		/must be restacked/i.test(strippedOutput) ||
		/requires? (?:a )?restack/i.test(strippedOutput) ||
		/restack (?:is )?required/i.test(strippedOutput);

	return mentionsRestack && requiresRestackBeforeSubmit;
}

export function detectTrunkOutOfDate(output: string): boolean {
	return /trunk branch is out of date and could not be updated/i.test(stripTerminalEscapes(output));
}

export function detectMergedPrNotInTrunk(output: string): boolean {
	return /already been merged but the merged commits are not contained in the latest trunk branch/i.test(
		stripTerminalEscapes(output),
	);
}

export function detectGraphitePrInfoLookupFailed(output: string): boolean {
	const strippedOutput = stripTerminalEscapes(output).replace(/\r/g, "\n");
	return /Failed to get pull request info\. Please try again\./i.test(strippedOutput);
}

export function detectRemoteUpdatedOutsideGraphite(
	output: string,
): { kind: "remote_updated_outside_graphite"; branchName?: string } | undefined {
	const match = stripTerminalEscapes(output).match(
		/Branch\s+(?<branch>\S+)\s+has been updated remotely outside of Graphite/iu,
	);
	if (match === null) return undefined;
	return {
		kind: "remote_updated_outside_graphite",
		...optionalEntry("branchName", match.groups?.branch),
	};
}

export function parseConflictedFiles(output: string): string[] {
	return uniqueNonEmpty(stripTerminalEscapes(output).replace(/\r/g, "\n").split("\n"));
}

export function parsePorcelainConflictedFiles(output: string): string[] {
	const files: string[] = [];

	for (const parsed of parseGitPorcelainStatusOutput(stripTerminalEscapes(output))) {
		if (!isGitPorcelainUnmergedStatus(parsed.status)) continue;

		files.push(parsed.path);
	}

	return uniqueNonEmpty(files);
}

export function parseAheadBehindCounts(
	output: string,
): { aheadCount: number; behindCount: number } | undefined {
	const [aheadText, behindText] = firstNonEmptyLine(output)?.split(/\s+/u) ?? [];
	if (aheadText === undefined || behindText === undefined) return undefined;

	const aheadCount = parseNonNegativeInteger(aheadText);
	const behindCount = parseNonNegativeInteger(behindText);
	if (aheadCount === undefined || behindCount === undefined) return undefined;

	return { aheadCount, behindCount };
}

function parseNonNegativeInteger(value: string): number | undefined {
	if (!/^\d+$/u.test(value)) return undefined;
	const parsed = Number.parseInt(value, 10);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function uniqueNonEmpty(values: readonly string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];

	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed || seen.has(trimmed)) continue;

		seen.add(trimmed);
		unique.push(trimmed);
	}

	return unique;
}

export function isUsableOutput(output: SubmitOutputLike): boolean {
	return output.type === "exited" && output.signal === null;
}

export function detectKnownPreflightFailureCause(
	output: SubmitOutputLike,
	joinedOutput: string,
): SubmitPreflightFailureCause | undefined {
	if (!isUsableOutput(output)) return undefined;
	const semanticFailureCause = detectSubmitSemanticFailureCause(joinedOutput);
	if (semanticFailureCause !== undefined) return semanticFailureCause;
	const remoteUpdatedCause = detectRemoteUpdatedOutsideGraphite(joinedOutput);
	if (remoteUpdatedCause !== undefined) return remoteUpdatedCause;
	if (detectTrunkOutOfDate(joinedOutput)) return { kind: "trunk_out_of_date" };
	if (detectMergedPrNotInTrunk(joinedOutput)) return { kind: "merged_pr_not_in_trunk" };
	if (detectGraphitePrInfoLookupFailed(joinedOutput)) {
		return { kind: "graphite_pr_info_lookup_failed" };
	}
	return undefined;
}

export function detectSubmitSemanticFailureCause(
	output: string,
): SubmitSemanticFailureCause | undefined {
	const strippedOutput = stripTerminalEscapes(output).replace(/\r/g, "\n");
	const emptyBranchWarning = /This branch does not introduce any changes:/i.test(strippedOutput);
	const skippedSubmissionWarning =
		/will not be submitted/i.test(strippedOutput) ||
		/GitHub does not allow empty PRs/i.test(strippedOutput);

	if (emptyBranchWarning && skippedSubmissionWarning) {
		const branchName =
			parseSubmitEmptyBranchWarningBranchName(strippedOutput) ??
			parseSubmitValidationBranchName(strippedOutput);
		return {
			kind: "empty_branch_skipped",
			...optionalEntry("branchName", branchName),
		};
	}

	return undefined;
}

export function parseSubmitEmptyBranchWarningBranchName(output: string): string | undefined {
	return output.match(
		/This branch does not introduce any changes:\s*\n\s*▸\s*(?<branch>\S+)\s*(?:\n|$)/iu,
	)?.groups?.branch;
}

export function parseSubmitValidationBranchName(output: string): string | undefined {
	const validationBlock = output.match(
		/Validating that this Graphite stack is ready to submit\.\.\.(?<block>[\s\S]*?)(?:\n\s*📝|\n\s*WARNING:|$)/u,
	)?.groups?.block;
	if (validationBlock === undefined) return undefined;

	for (const line of validationBlock.split("\n")) {
		const match = line.match(/^\s*▸\s*(?<branch>\S+)\s*$/u);
		const branch = match?.groups?.branch;
		if (branch !== undefined) return branch;
	}
	return undefined;
}
