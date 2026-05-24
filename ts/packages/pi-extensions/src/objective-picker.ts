import type { ObjectiveBranchEntry, ObjectiveList, ObjectiveListGroup } from "./objective-list.ts";

export const VIEW_OTHER_OBJECTIVES_CHOICE = "View other active Objectives…";

export type ObjectiveDiffSelection = {
	trunkBranch: string;
	allChangedSlugs: string[];
	changedActiveSlugs: string[];
};

export function parseObjectiveDiffChangedSlugs(stdout: string): string[] {
	const slugs = new Set<string>();
	for (const line of stdout.split(/\r?\n/)) {
		const trimmedLine = line.trimEnd();
		if (!trimmedLine) {
			continue;
		}

		for (const path of changedObjectivePathsFromNameStatusLine(trimmedLine)) {
			const slug = objectiveSlugFromPath(path);
			if (slug) {
				slugs.add(slug);
			}
		}
	}

	return [...slugs].sort((left, right) => left.localeCompare(right));
}

export function changedActiveObjectiveSelection(
	objectiveList: ObjectiveList,
	trunkBranch: string,
	allChangedSlugs: string[],
): ObjectiveDiffSelection | undefined {
	if (allChangedSlugs.length === 0 || !trunkBranch.trim()) {
		return undefined;
	}

	const allChangedSlugSet = new Set(allChangedSlugs);
	const changedActiveSlugs = objectiveList.groups
		.filter((group) => allChangedSlugSet.has(group.slug))
		.map((group) => group.slug);
	if (changedActiveSlugs.length === 0) {
		return undefined;
	}

	return { trunkBranch, allChangedSlugs, changedActiveSlugs };
}

export function formatObjectiveChoice(
	group: ObjectiveListGroup,
	selection: ObjectiveDiffSelection | undefined = undefined,
): string {
	const branchCount = group.branches.length;
	const branchLabel = branchCount === 1 ? "1 branch" : `${branchCount} branches`;
	const latestBranch = group.latestWorkBranch ?? latestObjectiveBranch(group)?.branch ?? "(none)";
	let diffLabel = "";
	if (selection && isOnlyChangedActiveObjective(selection, group)) {
		diffLabel = `suggested: only Objective changed vs ${selection.trunkBranch} — `;
	} else if (selection && isChangedActiveObjective(group, selection)) {
		diffLabel = `changed vs ${selection.trunkBranch} — `;
	}
	return `${group.slug} — ${diffLabel}${branchLabel} — latest work ${latestBranch} — max +${maxSliceCommits(group)} slice commits`;
}

export function objectiveGroupsWithChangedFirst(
	groups: ObjectiveListGroup[],
	selection: ObjectiveDiffSelection | undefined = undefined,
): ObjectiveListGroup[] {
	if (!selection) {
		return groups;
	}

	const changedSet = new Set(selection.changedActiveSlugs);
	const changedGroups = groups.filter((group) => changedSet.has(group.slug));
	const otherGroups = groups.filter((group) => !changedSet.has(group.slug));
	return [...changedGroups, ...otherGroups];
}

export function objectiveChoiceMap(
	groups: ObjectiveListGroup[],
	selection: ObjectiveDiffSelection | undefined = undefined,
): Map<string, string> {
	const choices = new Map<string, string>();
	for (const group of groups) {
		choices.set(formatObjectiveChoice(group, selection), group.slug);
	}
	return choices;
}

export function objectiveDiffPickerTitle(title: string, selection: ObjectiveDiffSelection): string {
	const suffix = selection.allChangedSlugs.length === 1 && selection.changedActiveSlugs.length === 1
		? `only Objective changed vs ${selection.trunkBranch}`
		: `changed Objectives vs ${selection.trunkBranch}`;
	return `${title} (${suffix})`;
}

function changedObjectivePathsFromNameStatusLine(line: string): string[] {
	const fields = line.split("\t");
	const status = fields[0] ?? "";
	if (!status) {
		return [];
	}

	if (status.startsWith("R") || status.startsWith("C")) {
		return fields.slice(1).filter(Boolean);
	}

	const path = fields[1];
	return path ? [path] : [];
}

function objectiveSlugFromPath(path: string): string | undefined {
	const parts = path.split("/");
	if (parts.length < 4 || parts[0] !== ".asdl" || parts[1] !== "objectives") {
		return undefined;
	}

	const slug = parts[2];
	return slug ? slug : undefined;
}

function latestObjectiveBranch(group: ObjectiveListGroup): ObjectiveBranchEntry | undefined {
	let latest: ObjectiveBranchEntry | undefined;
	for (const branch of group.branches) {
		if (objectiveBranchTimestamp(branch) === undefined) {
			continue;
		}
		if (!latest || compareObjectiveBranchesByLatest(branch, latest) > 0) {
			latest = branch;
		}
	}
	return latest;
}

function objectiveBranchTimestamp(branch: ObjectiveBranchEntry): number | undefined {
	if (branch.updatedIso === null) {
		return undefined;
	}

	const timestamp = Date.parse(branch.updatedIso);
	return Number.isNaN(timestamp) ? undefined : timestamp;
}

function compareObjectiveBranchesByLatest(left: ObjectiveBranchEntry, right: ObjectiveBranchEntry): number {
	const leftTimestamp = objectiveBranchTimestamp(left) ?? Number.NEGATIVE_INFINITY;
	const rightTimestamp = objectiveBranchTimestamp(right) ?? Number.NEGATIVE_INFINITY;
	if (leftTimestamp !== rightTimestamp) {
		return leftTimestamp - rightTimestamp;
	}

	return right.branch.localeCompare(left.branch);
}

function maxSliceCommits(group: ObjectiveListGroup): number {
	let maxSliceCommits = 0;
	for (const branch of group.branches) {
		if (branch.sliceCommits > maxSliceCommits) {
			maxSliceCommits = branch.sliceCommits;
		}
	}
	return maxSliceCommits;
}

function isChangedActiveObjective(
	group: ObjectiveListGroup,
	selection: ObjectiveDiffSelection | undefined,
): boolean {
	return selection?.changedActiveSlugs.includes(group.slug) ?? false;
}

function isOnlyChangedActiveObjective(
	selection: ObjectiveDiffSelection | undefined,
	group: ObjectiveListGroup,
): boolean {
	return Boolean(
		selection &&
			selection.allChangedSlugs.length === 1 &&
			selection.changedActiveSlugs.length === 1 &&
			selection.changedActiveSlugs[0] === group.slug,
	);
}
