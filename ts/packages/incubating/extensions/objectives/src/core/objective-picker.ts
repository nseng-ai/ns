import { isValidObjectiveOwner, isValidObjectiveSlug } from "./identity.ts";
import type { ObjectiveListRecord, ObjectiveListResult } from "./operations/list-objectives.ts";
import { relativeTime } from "./relative-time.ts";

export type ObjectiveList = ObjectiveListResult;

export const VIEW_OTHER_OBJECTIVES_CHOICE = "View other active Objectives…";

/** Changed-Objective picker facts; all values are full Objective Locators. */
export interface ObjectiveDiffSelection {
	trunkBranch: string;
	changeBasisLabel: string;
	allChangedSlugs: string[];
	changedActiveSlugs: string[];
}

export interface ChangedActiveObjectiveSelectionOptions {
	objectiveList: ObjectiveList;
	trunkBranch: string;
	allChangedSlugs: readonly string[];
	changeBasisLabel?: string;
}

/**
 * Owner-nested locator candidates from changed paths. Path shape alone cannot
 * attribute a legacy flat record's owner, so flat paths yield no candidate;
 * callers intersect these locators with the active list, whose open records
 * are always owner-nested.
 */
export function objectiveChangedSlugsFromPaths(paths: readonly string[]): string[] {
	const locators = new Set<string>();
	for (const path of paths) {
		const locator = objectiveLocatorFromPath(path);
		if (locator) {
			locators.add(locator);
		}
	}

	return [...locators].sort((left, right) => left.localeCompare(right));
}

export function changedActiveObjectiveSelection(
	options: ChangedActiveObjectiveSelectionOptions,
): ObjectiveDiffSelection | undefined {
	const { objectiveList, trunkBranch, allChangedSlugs } = options;
	const changeBasisLabel = options.changeBasisLabel ?? defaultChangeBasisLabel(trunkBranch);
	const uniqueChangedSlugs = [...new Set(allChangedSlugs)].sort((left, right) =>
		left.localeCompare(right),
	);
	if (uniqueChangedSlugs.length === 0) {
		return undefined;
	}

	const label = changeBasisLabel.trim();
	if (!label) {
		return undefined;
	}

	const allChangedSlugSet = new Set(uniqueChangedSlugs);
	const changedActiveSlugs = objectiveList.records
		.filter((record) => allChangedSlugSet.has(record.locator))
		.map((record) => record.locator);
	if (changedActiveSlugs.length === 0) {
		return undefined;
	}

	return {
		trunkBranch: trunkBranch.trim(),
		changeBasisLabel: label,
		allChangedSlugs: uniqueChangedSlugs,
		changedActiveSlugs,
	};
}

export function formatObjectiveChoice(
	record: ObjectiveListRecord,
	nowMs: number,
	selection: ObjectiveDiffSelection | undefined = undefined,
): string {
	let diffLabel = "";
	if (selection && isOnlyChangedActiveObjective(selection, record)) {
		diffLabel = `suggested: only Objective ${selection.changeBasisLabel} — `;
	} else if (selection && isChangedActiveObjective(record, selection)) {
		diffLabel = `${selection.changeBasisLabel} — `;
	}

	const latestUpdate =
		record.latestUpdateIso === null ? "—" : relativeTime(record.latestUpdateIso, nowMs);
	return `${record.locator} — ${diffLabel}${record.status} — latest update ${latestUpdate}`;
}

export function objectiveRecordsWithChangedFirst(
	records: ObjectiveListRecord[],
	selection: ObjectiveDiffSelection | undefined = undefined,
): ObjectiveListRecord[] {
	if (!selection) {
		return records;
	}

	const changedSet = new Set(selection.changedActiveSlugs);
	const changedRecords = records.filter((record) => changedSet.has(record.locator));
	const otherRecords = records.filter((record) => !changedSet.has(record.locator));
	return [...changedRecords, ...otherRecords];
}

export function objectiveChoiceMap(
	records: ObjectiveListRecord[],
	nowMs: number,
	selection: ObjectiveDiffSelection | undefined = undefined,
): Map<string, string> {
	const choices = new Map<string, string>();
	for (const record of records) {
		choices.set(formatObjectiveChoice(record, nowMs, selection), record.locator);
	}
	return choices;
}

export function objectiveDiffPickerTitle(title: string, selection: ObjectiveDiffSelection): string {
	const suffix =
		selection.allChangedSlugs.length === 1 && selection.changedActiveSlugs.length === 1
			? `only Objective ${selection.changeBasisLabel}`
			: changedObjectivesLabel(selection.changeBasisLabel);
	return `${title} (${suffix})`;
}

function objectiveLocatorFromPath(path: string): string | undefined {
	const parts = path.split("/");
	if (parts.length < 5 || parts[0] !== ".ns" || parts[1] !== "objectives") {
		return undefined;
	}

	const owner = parts[2];
	const slug = parts[3];
	if (!owner || !slug || !isValidObjectiveOwner(owner) || !isValidObjectiveSlug(slug)) {
		return undefined;
	}
	return `${owner}/${slug}`;
}

function defaultChangeBasisLabel(trunkBranch: string): string {
	const trunk = trunkBranch.trim();
	return trunk ? `changed vs ${trunk}` : "changed";
}

function changedObjectivesLabel(changeBasisLabel: string): string {
	return changeBasisLabel.startsWith("changed ")
		? `changed Objectives ${changeBasisLabel.slice("changed ".length)}`
		: `changed Objectives ${changeBasisLabel}`;
}

function isChangedActiveObjective(
	record: ObjectiveListRecord,
	selection: ObjectiveDiffSelection | undefined,
): boolean {
	return selection?.changedActiveSlugs.includes(record.locator) ?? false;
}

function isOnlyChangedActiveObjective(
	selection: ObjectiveDiffSelection | undefined,
	record: ObjectiveListRecord,
): boolean {
	return Boolean(
		selection &&
		selection.allChangedSlugs.length === 1 &&
		selection.changedActiveSlugs.length === 1 &&
		selection.changedActiveSlugs[0] === record.locator,
	);
}
