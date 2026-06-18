import type { GitErrorInfo, GitGateway, GitLocalBranchTip } from "@asdl/core/git";

import { activeRootRelativePath, objectiveSlugFromActivePath } from "../storage.ts";

export const MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS = 50;

export interface ObjectiveBranchAttribution {
	updatedBranchesBySlug: ReadonlyMap<string, readonly string[]>;
	isTruncated: boolean;
}

export interface BuildObjectiveBranchAttributionParams {
	repoRoot: string;
	trunkBranch: string;
	slugs: ReadonlySet<string>;
	maxBranchWalks?: number | undefined;
}

export async function buildObjectiveBranchAttribution(
	git: GitGateway,
	params: BuildObjectiveBranchAttributionParams,
): Promise<{ type: "ok"; value: ObjectiveBranchAttribution } | { type: "git-error"; error: GitErrorInfo }> {
	if (params.slugs.size === 0) return { type: "ok", value: emptyAttribution(params.slugs) };

	const tips = await git.listLocalBranchTips({ cwd: params.repoRoot });
	if (!tips.ok) return { type: "git-error", error: tips.error };

	const branches = tips.value.filter((tip) => tip.name !== params.trunkBranch).sort(compareBranchTips).map((tip) => tip.name);
	if (branches.length === 0) return { type: "ok", value: emptyAttribution(params.slugs) };

	const objectiveRoot = activeRootRelativePath();
	const treeOids = await git.treeOidsAtRefs({ cwd: params.repoRoot, refs: [params.trunkBranch, ...branches], relativePath: objectiveRoot });
	if (!treeOids.ok) return { type: "git-error", error: treeOids.error };

	const trunkTreeOid = treeOids.value[params.trunkBranch] ?? null;
	const changedBranches = branches.filter((branch) => (treeOids.value[branch] ?? null) !== trunkTreeOid);
	const maxBranchWalks = params.maxBranchWalks ?? MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS;
	const walkedBranches = changedBranches.slice(0, maxBranchWalks);
	const bySlug = new Map<string, string[]>([...params.slugs].map((slug) => [slug, []]));

	for (const branch of walkedBranches) {
		const changedPaths = await git.changedPathsUnder({ cwd: params.repoRoot, revisionRange: `${params.trunkBranch}...${branch}`, relativePath: objectiveRoot });
		if (!changedPaths.ok) return { type: "git-error", error: changedPaths.error };

		for (const slug of objectiveSlugsFromPaths(changedPaths.value, params.slugs)) {
			bySlug.get(slug)?.push(branch);
		}
	}

	return {
		type: "ok",
		value: {
			updatedBranchesBySlug: freezeAttributionMap(bySlug),
			isTruncated: changedBranches.length > maxBranchWalks,
		},
	};
}

function emptyAttribution(slugs: ReadonlySet<string>): ObjectiveBranchAttribution {
	return { updatedBranchesBySlug: new Map([...slugs].map((slug) => [slug, []])), isTruncated: false };
}

function objectiveSlugsFromPaths(paths: readonly string[], slugs: ReadonlySet<string>): string[] {
	const touchedSlugs = new Set<string>();
	for (const path of paths) {
		const slug = objectiveSlugFromActivePath(path);
		if (slug !== null && slugs.has(slug)) touchedSlugs.add(slug);
	}
	return [...touchedSlugs].sort((left, right) => left.localeCompare(right));
}

function compareBranchTips(left: GitLocalBranchTip, right: GitLocalBranchTip): number {
	const leftTime = parsedTime(left.headIso);
	const rightTime = parsedTime(right.headIso);
	if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return rightTime - leftTime;
	if (leftTime !== null && rightTime === null) return -1;
	if (leftTime === null && rightTime !== null) return 1;
	return left.name.localeCompare(right.name);
}

function parsedTime(iso: string | null): number | null {
	if (iso === null) return null;
	const parsed = Date.parse(iso);
	return Number.isFinite(parsed) ? parsed : null;
}

function freezeAttributionMap(bySlug: ReadonlyMap<string, readonly string[]>): ReadonlyMap<string, readonly string[]> {
	return new Map([...bySlug.entries()].map(([slug, branches]) => [slug, [...branches]]));
}
