import type { ObjectiveList, ObjectiveListRecord } from "./objective-list.ts";

export const VIEW_OTHER_OBJECTIVES_CHOICE = "View other active Objectives…";

export interface ObjectiveDiffSelection {
	trunkBranch: string;
	changeBasisLabel: string;
	allChangedSlugs: string[];
	changedActiveSlugs: string[];
}

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

export function parseObjectiveStatusChangedSlugs(stdout: string): string[] {
	const slugs = new Set<string>();
	const entries = stdout.split("\0");
	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index] ?? "";
		if (!entry) {
			continue;
		}

		const status = entry.slice(0, 2);
		const path = entry.slice(3);
		if (!status.trim() || status === "!!" || !path) {
			continue;
		}

		addObjectiveSlugFromPath(slugs, path);
		if (isRenameOrCopyStatus(status)) {
			const secondPath = entries[index + 1] ?? "";
			addObjectiveSlugFromPath(slugs, secondPath);
			index += 1;
		}
	}

	return [...slugs].sort((left, right) => left.localeCompare(right));
}

export function changedActiveObjectiveSelection(
	objectiveList: ObjectiveList,
	trunkBranch: string,
	allChangedSlugs: string[],
	changeBasisLabel: string = defaultChangeBasisLabel(trunkBranch),
): ObjectiveDiffSelection | undefined {
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
		.filter((record) => allChangedSlugSet.has(record.slug))
		.map((record) => record.slug);
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
	selection: ObjectiveDiffSelection | undefined = undefined,
): string {
	let diffLabel = "";
	if (selection && isOnlyChangedActiveObjective(selection, record)) {
		diffLabel = `suggested: only Objective ${selection.changeBasisLabel} — `;
	} else if (selection && isChangedActiveObjective(record, selection)) {
		diffLabel = `${selection.changeBasisLabel} — `;
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
	const suffix =
		selection.allChangedSlugs.length === 1 && selection.changedActiveSlugs.length === 1
			? `only Objective ${selection.changeBasisLabel}`
			: changedObjectivesLabel(selection.changeBasisLabel);
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

function addObjectiveSlugFromPath(slugs: Set<string>, path: string): void {
	const slug = objectiveSlugFromPath(path);
	if (slug) {
		slugs.add(slug);
	}
}

function objectiveSlugFromPath(path: string): string | undefined {
	const parts = path.split("/");
	if (parts.length < 4 || parts[0] !== ".asdl" || parts[1] !== "objectives") {
		return undefined;
	}

	const slug = parts[2];
	return slug ? slug : undefined;
}

function isRenameOrCopyStatus(status: string): boolean {
	return status.includes("R") || status.includes("C");
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
