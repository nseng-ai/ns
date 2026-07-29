import type { GitErrorInfo, GitGateway, GitLocalBranchTip } from "@nseng-ai/foundation/git";

import type { ObjectiveCliContext } from "../context.ts";
import {
	activeRootRelativePath,
	objectiveLocatorsFromChangedPaths,
	type ObjectiveRecordLocation,
} from "../storage.ts";

export const MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS = 50;

export interface ObjectiveBranchAttribution {
	updatedBranchesByLocator: ReadonlyMap<string, readonly string[]>;
	isTruncated: boolean;
}

export interface BuildObjectiveBranchAttributionParams {
	repoRoot: string;
	trunkBranch: string;
	/** Discovered record locations whose locators attribution is requested for. */
	locations: readonly ObjectiveRecordLocation[];
	maxBranchWalks?: number;
}

export async function buildObjectiveBranchAttributionForContext(
	ctx: ObjectiveCliContext,
	locations: readonly ObjectiveRecordLocation[],
): Promise<
	{ type: "ok"; value: ObjectiveBranchAttribution } | { type: "git-error"; error: GitErrorInfo }
> {
	return await buildObjectiveBranchAttribution(ctx.git, {
		repoRoot: ctx.repoRoot,
		trunkBranch: ctx.trunkBranch,
		locations,
	});
}

export async function buildObjectiveBranchAttribution(
	git: GitGateway,
	params: BuildObjectiveBranchAttributionParams,
): Promise<
	{ type: "ok"; value: ObjectiveBranchAttribution } | { type: "git-error"; error: GitErrorInfo }
> {
	const locators = params.locations.map((location) => location.locator);
	if (locators.length === 0) return { type: "ok", value: emptyAttribution(locators) };

	const tips = await git.listLocalBranchTips({ cwd: params.repoRoot });
	if (!tips.ok) return { type: "git-error", error: tips.error };

	const branches = tips.value
		.filter((tip) => tip.name !== params.trunkBranch)
		.sort(compareBranchTips)
		.map((tip) => tip.name);
	if (branches.length === 0) return { type: "ok", value: emptyAttribution(locators) };

	const objectiveRoot = activeRootRelativePath();
	const treeOids = await git.treeOidsAtRefs({
		cwd: params.repoRoot,
		refs: [params.trunkBranch, ...branches],
		relativePath: objectiveRoot,
	});
	if (!treeOids.ok) return { type: "git-error", error: treeOids.error };

	const trunkTreeOid = treeOids.value[params.trunkBranch] ?? null;
	const changedBranches = branches.filter(
		(branch) => (treeOids.value[branch] ?? null) !== trunkTreeOid,
	);
	const maxBranchWalks = params.maxBranchWalks ?? MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS;
	const walkedBranches = changedBranches.slice(0, maxBranchWalks);
	const requested = new Set(locators);
	const byLocator = new Map<string, string[]>(locators.map((locator) => [locator, []]));

	for (const branch of walkedBranches) {
		const changedPaths = await git.changedPathsUnder({
			cwd: params.repoRoot,
			revisionRange: `${params.trunkBranch}...${branch}`,
			relativePath: objectiveRoot,
		});
		if (!changedPaths.ok) return { type: "git-error", error: changedPaths.error };

		for (const locator of objectiveLocatorsFromChangedPaths(changedPaths.value, params.locations)) {
			if (requested.has(locator)) byLocator.get(locator)?.push(branch);
		}
	}

	return {
		type: "ok",
		value: {
			updatedBranchesByLocator: freezeAttributionMap(byLocator),
			isTruncated: changedBranches.length > maxBranchWalks,
		},
	};
}

function emptyAttribution(locators: readonly string[]): ObjectiveBranchAttribution {
	return {
		updatedBranchesByLocator: new Map(locators.map((locator) => [locator, []])),
		isTruncated: false,
	};
}

function compareBranchTips(left: GitLocalBranchTip, right: GitLocalBranchTip): number {
	const leftTime = parsedTime(left.headIso);
	const rightTime = parsedTime(right.headIso);
	if (leftTime !== null && rightTime !== null && leftTime !== rightTime)
		return rightTime - leftTime;
	if (leftTime !== null && rightTime === null) return -1;
	if (leftTime === null && rightTime !== null) return 1;
	return left.name.localeCompare(right.name);
}

function parsedTime(iso: string | null): number | null {
	if (iso === null) return null;
	const parsed = Date.parse(iso);
	return Number.isFinite(parsed) ? parsed : null;
}

function freezeAttributionMap(
	byLocator: ReadonlyMap<string, readonly string[]>,
): ReadonlyMap<string, readonly string[]> {
	return new Map([...byLocator.entries()].map(([locator, branches]) => [locator, [...branches]]));
}
