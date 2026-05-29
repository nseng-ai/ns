import type { ObjectiveList, ObjectiveListRecord } from "./objective-list.ts";

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
	const changedActiveSlugs = objectiveList.records
		.filter((record) => allChangedSlugSet.has(record.slug))
		.map((record) => record.slug);
	if (changedActiveSlugs.length === 0) {
		return undefined;
	}

	return { trunkBranch, allChangedSlugs, changedActiveSlugs };
}

export function formatObjectiveChoice(
	record: ObjectiveListRecord,
	selection: ObjectiveDiffSelection | undefined = undefined,
): string {
	let diffLabel = "";
	if (selection && isOnlyChangedActiveObjective(selection, record)) {
		diffLabel = `suggested: only Objective changed vs ${selection.trunkBranch} — `;
	} else if (selection && isChangedActiveObjective(record, selection)) {
		diffLabel = `changed vs ${selection.trunkBranch} — `;
	}

	return `${record.slug} — ${diffLabel}${record.status} — latest update ${record.latestUpdateIso ?? "—"}`;
}

export function objectiveRecordsWithChangedFirst(
	records: ObjectiveListRecord[],
	selection: ObjectiveDiffSelection | undefined = undefined,
): ObjectiveListRecord[] {
	if (!selection) {
		return records;
	}

	const changedSet = new Set(selection.changedActiveSlugs);
	const changedRecords = records.filter((record) => changedSet.has(record.slug));
	const otherRecords = records.filter((record) => !changedSet.has(record.slug));
	return [...changedRecords, ...otherRecords];
}

export function objectiveChoiceMap(
	records: ObjectiveListRecord[],
	selection: ObjectiveDiffSelection | undefined = undefined,
): Map<string, string> {
	const choices = new Map<string, string>();
	for (const record of records) {
		choices.set(formatObjectiveChoice(record, selection), record.slug);
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

function isChangedActiveObjective(
	record: ObjectiveListRecord,
	selection: ObjectiveDiffSelection | undefined,
): boolean {
	return selection?.changedActiveSlugs.includes(record.slug) ?? false;
}

function isOnlyChangedActiveObjective(
	selection: ObjectiveDiffSelection | undefined,
	record: ObjectiveListRecord,
): boolean {
	return Boolean(
		selection &&
			selection.allChangedSlugs.length === 1 &&
			selection.changedActiveSlugs.length === 1 &&
			selection.changedActiveSlugs[0] === record.slug,
	);
}
