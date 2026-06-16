import type { ObjectiveGitErrorInfo, ObjectiveGitFactsGateway, ObjectiveLocalBranchTip, ObjectivePathChangeTouch } from "../git-facts.ts";
import { activeRootRelativePath, objectiveSlugFromActivePath } from "../storage.ts";

export const MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS = 50;

export interface ObjectiveBranchAttribution {
	updatedBranchesBySlug: ReadonlyMap<string, readonly string[]>;
	isTruncated: boolean;
}

export async function buildObjectiveBranchAttribution(
	gitFacts: ObjectiveGitFactsGateway,
	params: { repoRoot: string; trunkBranch: string; slugs: ReadonlySet<string>; maxBranchWalks?: number | undefined },
): Promise<{ type: "ok"; value: ObjectiveBranchAttribution } | { type: "git-error"; error: ObjectiveGitErrorInfo }> {
	if (params.slugs.size === 0) return { type: "ok", value: emptyAttribution(params.slugs) };

	const tips = await gitFacts.listLocalBranchTips({ repoRoot: params.repoRoot });
	if (!tips.ok) return { type: "git-error", error: tips.error };

	const branches = tips.value.filter((tip) => tip.name !== params.trunkBranch).sort(compareBranchTips).map((tip) => tip.name);
	if (branches.length === 0) return { type: "ok", value: emptyAttribution(params.slugs) };

	const objectiveRoot = activeRootRelativePath();
	const treeOids = await gitFacts.treeOidsAtRefs({ repoRoot: params.repoRoot, refs: [params.trunkBranch, ...branches], relativePath: objectiveRoot });
	if (!treeOids.ok) return { type: "git-error", error: treeOids.error };

	const trunkTreeOid = treeOids.value[params.trunkBranch] ?? null;
	const changedBranches = branches.filter((branch) => (treeOids.value[branch] ?? null) !== trunkTreeOid);
	const maxBranchWalks = params.maxBranchWalks ?? MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS;
	const walkedBranches = changedBranches.slice(0, maxBranchWalks);
	const bySlug = new Map<string, string[]>([...params.slugs].map((slug) => [slug, []]));

	for (const branch of walkedBranches) {
		const touches = await gitFacts.pathTouchesUnder({ repoRoot: params.repoRoot, revisionRange: `${params.trunkBranch}..${branch}`, relativePath: objectiveRoot });
		if (!touches.ok) return { type: "git-error", error: touches.error };

		for (const slug of objectiveSlugsFromTouches(touches.value, params.slugs)) {
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

function objectiveSlugsFromTouches(touches: readonly ObjectivePathChangeTouch[], slugs: ReadonlySet<string>): string[] {
	const touchedSlugs = new Set<string>();
	for (const touch of touches) {
		for (const path of touch.paths) {
			const slug = objectiveSlugFromActivePath(path);
			if (slug !== null && slugs.has(slug)) touchedSlugs.add(slug);
		}
	}
	return [...touchedSlugs].sort((left, right) => left.localeCompare(right));
}

function compareBranchTips(left: ObjectiveLocalBranchTip, right: ObjectiveLocalBranchTip): number {
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
