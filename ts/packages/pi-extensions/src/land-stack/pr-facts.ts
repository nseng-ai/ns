import { formatCommand } from "../command-runtime.ts";
import { exec, formatCommandDetails, shortSha } from "./command-exec.ts";
import { GH_TIMEOUT_MS, PR_FIELDS } from "./constants.ts";
import { errorMessage, fail } from "./errors.ts";
import type { BranchPlan, ExtensionAPI, PrSubmitRequirement, PullRequestSnapshot } from "./types.ts";

export async function loadPr(pi: ExtensionAPI, repoRoot: string, branchOrNumber: string): Promise<PullRequestSnapshot> {
	const args = ["pr", "view", branchOrNumber, "--json", PR_FIELDS];
	const result = await exec(pi, "gh", args, repoRoot, GH_TIMEOUT_MS);
	if (result.code !== 0) {
		fail(`Could not load GitHub PR for ${branchOrNumber}.\n${formatCommandDetails(result, formatCommand("gh", args))}`);
	}

	let raw: Partial<PullRequestSnapshot>;
	try {
		raw = JSON.parse(result.stdout) as Partial<PullRequestSnapshot>;
	} catch (error) {
		fail(`Failed to parse gh pr view output for ${branchOrNumber}: ${errorMessage(error)}.`);
	}

	if (
		typeof raw.number !== "number" ||
		typeof raw.title !== "string" ||
		typeof raw.state !== "string" ||
		typeof raw.headRefName !== "string" ||
		typeof raw.baseRefName !== "string" ||
		typeof raw.headRefOid !== "string"
	) {
		fail(`gh pr view for ${branchOrNumber} did not return required PR fields.`);
	}

	return {
		number: raw.number,
		title: raw.title,
		state: raw.state,
		isDraft: Boolean(raw.isDraft),
		headRefName: raw.headRefName,
		baseRefName: raw.baseRefName,
		headRefOid: raw.headRefOid,
		mergeStateStatus: typeof raw.mergeStateStatus === "string" ? raw.mergeStateStatus : undefined,
		url: typeof raw.url === "string" ? raw.url : undefined,
		mergedAt: typeof raw.mergedAt === "string" || raw.mergedAt === null ? raw.mergedAt : undefined,
	};
}

export function validateInitialPrPreflight(
	branchPlans: BranchPlan[],
	trunk: string,
	options: { allowSubmitRequiredState?: boolean } = {},
): void {
	for (let index = 0; index < branchPlans.length; index += 1) {
		const branchPlan = branchPlans[index];
		if (!branchPlan) continue;
		const { branch, localSha, pr } = branchPlan;
		validateOpenPrBasics({ branch, localSha, pr, allowHeadShaMismatch: Boolean(options.allowSubmitRequiredState) });
		if (index === 0 && pr.baseRefName !== trunk && !options.allowSubmitRequiredState) {
			fail(`Bottom PR #${pr.number} targets ${pr.baseRefName}, expected ${trunk}; restack/submit it first.`);
		}
	}
}

export function validateStrictMergeGate(input: { branch: string; localSha: string; pr: PullRequestSnapshot; trunk: string }): void {
	validateOpenPrBasics(input);
	if (input.pr.baseRefName !== input.trunk) {
		fail(`PR #${input.pr.number} targets ${input.pr.baseRefName}, expected ${input.trunk}; restack/submit it first.`, {
			failedBranch: input.branch,
			failedPr: input.pr.number,
			suggestedAction: `Run gt restack/submit for ${input.branch}, then rerun /land-stack.`,
		});
	}
}

export function validateOpenPrBasics(input: {
	branch: string;
	localSha: string;
	pr: PullRequestSnapshot;
	allowHeadShaMismatch?: boolean;
}): void {
	const { branch, localSha, pr } = input;
	if (pr.state !== "OPEN") {
		fail(`PR #${pr.number} for ${branch} is ${pr.state}, expected OPEN.`);
	}
	if (pr.isDraft) {
		fail(`PR #${pr.number} for ${branch} is a draft; mark it ready before landing.`);
	}
	if (pr.headRefName !== branch) {
		fail(`PR #${pr.number} head branch is ${pr.headRefName}, expected ${branch}.`);
	}
	if (pr.headRefOid !== localSha && !input.allowHeadShaMismatch) {
		fail(
			`PR #${pr.number} head SHA does not match local branch SHA; run gt submit/update first.\nPR head: ${shortSha(pr.headRefOid)}\nLocal ${branch}: ${shortSha(localSha)}`,
		);
	}
}

export function collectPrSubmitRequirements(branchPlans: BranchPlan[], trunk: string): PrSubmitRequirement[] {
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
