import { formatCommand } from "@sdl/core/command";
import { formatErrorMessage } from "@sdl/core/primitives";
import { validateOpenPrBasics, validateStrictMergeGate } from "../preflight.ts";
import type { LandOutcome } from "../types.ts";
import { exec, formatCommandDetails } from "./command-exec.ts";
import { GH_TIMEOUT_MS, PR_FIELDS } from "./constants.ts";
import { shortSha } from "./graphite-command-channel.ts";
import {
	completed,
	failure,
	landStackFailure,
	success,
	type LandStackOutcome,
	type LandStackResult,
} from "./errors.ts";
import { toLandStackFailure } from "./plan-mapping.ts";
import type { LandStackExtensionAPI, PrSubmitRequirement, PullRequestSnapshot } from "./types.ts";

type LandOutcomeFailure = Extract<LandOutcome, { readonly type: "failure" }>["failure"];

export async function loadPr(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	branchOrNumber: string,
): Promise<LandStackResult<PullRequestSnapshot>> {
	const args = ["pr", "view", branchOrNumber, "--json", PR_FIELDS];
	const result = await exec({ pi, command: "gh", args, cwd: repoRoot, timeoutMs: GH_TIMEOUT_MS });
	if (result.code !== 0) {
		return failure(
			landStackFailure(
				`Could not load GitHub PR for ${branchOrNumber}.\n${formatCommandDetails(result, formatCommand("gh", args))}`,
			),
		);
	}

	let raw: unknown;
	try {
		raw = JSON.parse(result.stdout);
	} catch (error) {
		return failure(
			landStackFailure(
				`Failed to parse gh pr view output for ${branchOrNumber}: ${formatErrorMessage(error)}.`,
			),
		);
	}

	const pr = parsePullRequestSnapshot(raw);
	if (pr === undefined) {
		return failure(
			landStackFailure(`gh pr view for ${branchOrNumber} did not return required PR fields.`),
		);
	}
	return success(pr);
}

function parsePullRequestSnapshot(value: unknown): PullRequestSnapshot | undefined {
	if (!isRecord(value)) return undefined;

	const body = value.body;
	if (
		typeof value.number !== "number" ||
		!Number.isFinite(value.number) ||
		typeof value.title !== "string" ||
		(typeof body !== "string" && body !== null) ||
		typeof value.state !== "string" ||
		typeof value.isDraft !== "boolean" ||
		typeof value.headRefName !== "string" ||
		typeof value.baseRefName !== "string" ||
		typeof value.headRefOid !== "string"
	) {
		return undefined;
	}

	return {
		number: value.number,
		title: value.title,
		body,
		state: value.state,
		isDraft: value.isDraft,
		headRefName: value.headRefName,
		baseRefName: value.baseRefName,
		headRefOid: value.headRefOid,
		...(typeof value.mergeStateStatus === "string"
			? { mergeStateStatus: value.mergeStateStatus }
			: {}),
		...(typeof value.url === "string" ? { url: value.url } : {}),
		...(typeof value.mergedAt === "string" || value.mergedAt === null
			? { mergedAt: value.mergedAt }
			: {}),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateStrictMergeGateForLandStack(input: {
	branch: string;
	localSha: string;
	pr: PullRequestSnapshot;
	trunk: string;
}): LandStackOutcome {
	const basics = validateOpenPrBasicsForLandStack(input);
	if (basics.type === "failure") return basics;
	return toLandStackOutcome(validateStrictMergeGate(input));
}

export function validateOpenPrBasicsForLandStack(input: {
	branch: string;
	localSha: string;
	pr: PullRequestSnapshot;
	allowHeadShaMismatch?: boolean;
}): LandStackOutcome {
	const outcome = validateOpenPrBasics(input);
	if (outcome.type === "completed") return completed();
	return failure(landStackFailure(openPrBasicsMessageForLandStack(input, outcome.failure)));
}

function openPrBasicsMessageForLandStack(
	input: {
		branch: string;
		localSha: string;
		pr: PullRequestSnapshot;
		allowHeadShaMismatch?: boolean;
	},
	failureValue: LandOutcomeFailure,
): string {
	if (
		failureValue.type === "domain" &&
		failureValue.reason === "pull-request-head-mismatch" &&
		input.pr.headRefOid !== input.localSha &&
		!input.allowHeadShaMismatch
	) {
		return `PR #${input.pr.number} head SHA does not match local branch SHA; run gt submit/update first.\nPR head: ${shortSha(input.pr.headRefOid)}\nLocal ${input.branch}: ${shortSha(input.localSha)}`;
	}
	return failureValue.message;
}

function toLandStackOutcome(outcome: LandOutcome): LandStackOutcome {
	if (outcome.type === "completed") return completed();
	return failure(toLandStackFailure(outcome.failure));
}

export function formatPrSubmitRequirement(requirement: PrSubmitRequirement): string {
	return `- #${requirement.prNumber} ${requirement.branch}: ${requirement.reasons.join("; ")}`;
}
