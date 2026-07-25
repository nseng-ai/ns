import type { ExecResult } from "@nseng-ai/foundation/command";
import { stripTerminalEscapes } from "@nseng-ai/foundation/terminal-escapes";
import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";

import { isGitPorcelainUnmergedStatus, parseGitPorcelainStatusOutput } from "./git-porcelain.ts";
import {
	isGraphitePrInfoLookupFailureProse,
	isMergedPrNotInTrunkProse,
	isTrunkOutOfDateProse,
	matchRemoteUpdatedOutsideGraphite,
	matchSubmitEmptyBranch,
} from "./cli-prose-heuristics.ts";
import type {
	SubmitPreflightFailureCause,
	SubmitSemanticFailureCause,
} from "./submit-failure-catalog.ts";

const WHITESPACE_PATTERN = new RegExp("\\s+", "u");
const NON_NEGATIVE_INTEGER_PATTERN = new RegExp("^\\d+$", "u");

export type SubmitOutputLike = ExecResult;

export function joinOutput(output: Pick<SubmitOutputLike, "stdout" | "stderr">): string {
	return `${output.stdout}\n${output.stderr}`;
}

export function detectRemoteUpdatedOutsideGraphite(
	output: string,
): { kind: "remote_updated_outside_graphite"; branchName?: string } | undefined {
	const match = matchRemoteUpdatedOutsideGraphite(output);
	if (match === undefined) return undefined;
	return {
		kind: "remote_updated_outside_graphite",
		...match,
	};
}

export function parseConflictedFiles(output: string): string[] {
	return uniqueNonEmpty(stripTerminalEscapes(output).replaceAll("\r", "\n").split("\n"));
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
	const [aheadText, behindText] = firstNonEmptyLine(output)?.split(WHITESPACE_PATTERN) ?? [];
	if (aheadText === undefined || behindText === undefined) return undefined;

	const aheadCount = parseNonNegativeInteger(aheadText);
	const behindCount = parseNonNegativeInteger(behindText);
	if (aheadCount === undefined || behindCount === undefined) return undefined;

	return { aheadCount, behindCount };
}

function parseNonNegativeInteger(value: string): number | undefined {
	if (!NON_NEGATIVE_INTEGER_PATTERN.test(value)) return undefined;
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
	if (isTrunkOutOfDateProse(joinedOutput)) return { kind: "trunk_out_of_date" };
	if (isMergedPrNotInTrunkProse(joinedOutput)) return { kind: "merged_pr_not_in_trunk" };
	if (isGraphitePrInfoLookupFailureProse(joinedOutput)) {
		return { kind: "graphite_pr_info_lookup_failed" };
	}
	return undefined;
}

export function detectSubmitSemanticFailureCause(
	output: string,
): SubmitSemanticFailureCause | undefined {
	const emptyBranch = matchSubmitEmptyBranch(output);
	if (emptyBranch === undefined) return undefined;
	return {
		kind: "empty_branch_skipped",
		...emptyBranch,
	};
}
