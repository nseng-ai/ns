import { formatCommand } from "@asdl/core/exec";
import { formatErrorMessage } from "@asdl/core/primitives";
import { exec, formatCommandDetails, shortSha } from "./command-exec.ts";
import { GH_TIMEOUT_MS, PR_FIELDS } from "./constants.ts";
import {
	completed,
	failure,
	landStackFailure,
	success,
	type LandStackOutcome,
	type LandStackResult,
} from "./errors.ts";
import type {
	BranchPlan,
	LandStackExtensionAPI,
	PrSubmitRequirement,
	PullRequestSnapshot,
} from "./types.ts";

export async function loadPr(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	branchOrNumber: string,
): Promise<LandStackResult<PullRequestSnapshot>> {
	const args = ["pr", "view", branchOrNumber, "--json", PR_FIELDS];
	const result = await exec(pi, "gh", args, repoRoot, GH_TIMEOUT_MS);
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
		mergeStateStatus:
			typeof value.mergeStateStatus === "string" ? value.mergeStateStatus : undefined,
		url: typeof value.url === "string" ? value.url : undefined,
		mergedAt:
			typeof value.mergedAt === "string" || value.mergedAt === null ? value.mergedAt : undefined,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateInitialPrPreflight(
	branchPlans: BranchPlan[],
	trunk: string,
	options: { allowSubmitRequiredState?: boolean } = {},
): LandStackOutcome {
	for (let index = 0; index < branchPlans.length; index += 1) {
		const branchPlan = branchPlans[index];
		if (!branchPlan) continue;
		const { branch, localSha, pr } = branchPlan;
		const basics = validateOpenPrBasics({
			branch,
			localSha,
			pr,
			allowHeadShaMismatch: Boolean(options.allowSubmitRequiredState),
		});
		if (basics.type === "failure") return basics;
		if (index === 0 && pr.baseRefName !== trunk && !options.allowSubmitRequiredState) {
			return failure(
				landStackFailure(
					`Bottom PR #${pr.number} targets ${pr.baseRefName}, expected ${trunk}; restack/submit it first.`,
				),
			);
		}
	}
	return completed();
}

export function validateStrictMergeGate(input: {
	branch: string;
	localSha: string;
	pr: PullRequestSnapshot;
	trunk: string;
}): LandStackOutcome {
	const basics = validateOpenPrBasics(input);
	if (basics.type === "failure") return basics;
	if (input.pr.baseRefName !== input.trunk) {
		return failure(
			landStackFailure(
				`PR #${input.pr.number} targets ${input.pr.baseRefName}, expected ${input.trunk}; restack/submit it first.`,
				{
					failedBranch: input.branch,
					failedPr: input.pr.number,
					suggestedAction: `Run gt restack/submit for ${input.branch}, then rerun /sdl:code:land.`,
				},
			),
		);
	}
	return completed();
}

export function validateOpenPrBasics(input: {
	branch: string;
	localSha: string;
	pr: PullRequestSnapshot;
	allowHeadShaMismatch?: boolean;
}): LandStackOutcome {
	const { branch, localSha, pr } = input;
	if (pr.state !== "OPEN") {
		return failure(
			landStackFailure(`PR #${pr.number} for ${branch} is ${pr.state}, expected OPEN.`),
		);
	}
	if (pr.isDraft) {
		return failure(
			landStackFailure(`PR #${pr.number} for ${branch} is a draft; mark it ready before landing.`),
		);
	}
	if (pr.headRefName !== branch) {
		return failure(
			landStackFailure(`PR #${pr.number} head branch is ${pr.headRefName}, expected ${branch}.`),
		);
	}
	if (pr.headRefOid !== localSha && !input.allowHeadShaMismatch) {
		return failure(
			landStackFailure(
				`PR #${pr.number} head SHA does not match local branch SHA; run gt submit/update first.\nPR head: ${shortSha(pr.headRefOid)}\nLocal ${branch}: ${shortSha(localSha)}`,
			),
		);
	}
	return completed();
}

export function collectPrSubmitRequirements(
	branchPlans: BranchPlan[],
	trunk: string,
): PrSubmitRequirement[] {
	const requirements: PrSubmitRequirement[] = [];
	for (let index = 0; index < branchPlans.length; index += 1) {
		const branchPlan = branchPlans[index];
		if (!branchPlan) continue;
		const { branch, localSha, pr } = branchPlan;
		const expectedBaseRefName = index === 0 ? trunk : undefined;
		const reasons: string[] = [];
		if (pr.headRefOid !== localSha) {
			reasons.push(`head ${shortSha(pr.headRefOid)} != local ${shortSha(localSha)}`);
		}
		if (expectedBaseRefName && pr.baseRefName !== expectedBaseRefName) {
			reasons.push(`base ${pr.baseRefName} != ${expectedBaseRefName}`);
		}
		if (reasons.length > 0) {
			requirements.push({
				branch,
				prNumber: pr.number,
				localSha,
				prHeadSha: pr.headRefOid,
				baseRefName: pr.baseRefName,
				expectedBaseRefName,
				reasons,
			});
		}
	}
	return requirements;
}

export function formatPrSubmitRequirement(requirement: PrSubmitRequirement): string {
	return `- #${requirement.prNumber} ${requirement.branch}: ${requirement.reasons.join("; ")}`;
}
