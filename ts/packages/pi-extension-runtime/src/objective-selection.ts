import { formatCommand, formatExecFailure, formatExecStartupFailure, type ExecResult } from "./command-runtime.ts";
import { parseObjectiveList, type ObjectiveList, type ObjectiveListRecord } from "./objective-list.ts";
import {
	VIEW_OTHER_OBJECTIVES_CHOICE,
	changedActiveObjectiveSelection,
	objectiveChoiceMap,
	objectiveDiffPickerTitle,
	objectiveRecordsWithChangedFirst,
	parseObjectiveDiffChangedSlugs,
	parseObjectiveStatusChangedSlugs,
	type ObjectiveDiffSelection,
} from "./objective-picker.ts";

const OBJECTIVE_COMMAND_TIMEOUT_MS = 30_000;

export type ObjectiveSelectionNotifyLevel = "info" | "warning" | "error";

export interface ObjectiveSelectionSpec {
	statusKey: string;
	selectionTitle: string;
	compactDiffSuggestion?: boolean;
}

export interface ObjectiveSelectionHost {
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
}

export interface ObjectiveSelectionContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: ObjectiveSelectionNotifyLevel): void;
		select(title: string, items: string[]): Promise<string | undefined>;
		setStatus?(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
}

interface ActiveObjectiveListLoaded {
	type: "loaded";
	list: ObjectiveList;
}

interface ActiveObjectiveListFailed {
	type: "failed";
	message: string;
}

type ActiveObjectiveListLoadResult = ActiveObjectiveListLoaded | ActiveObjectiveListFailed;

interface ChangedObjectiveSelectionOptions {
	host: ObjectiveSelectionHost;
	ctx: ObjectiveSelectionContext;
	objectiveList: ObjectiveList;
	spec: ObjectiveSelectionSpec;
}

interface ObjectiveDiffChangedSlugsOptions {
	host: ObjectiveSelectionHost;
	ctx: ObjectiveSelectionContext;
	spec: ObjectiveSelectionSpec;
	trunkBranch: string;
}

interface ObjectiveStatusChangedSlugsOptions {
	host: ObjectiveSelectionHost;
	ctx: ObjectiveSelectionContext;
	spec: ObjectiveSelectionSpec;
}

interface SelectObjectiveSlugOptions {
	ctx: ObjectiveSelectionContext;
	title: string;
	records: ObjectiveListRecord[];
	selection: ObjectiveDiffSelection | undefined;
}

interface SelectChangedObjectivesOrOtherOptions {
	ctx: ObjectiveSelectionContext;
	spec: ObjectiveSelectionSpec;
	objectiveList: ObjectiveList;
	selection: ObjectiveDiffSelection;
}

async function listActiveObjectives(
	host: ObjectiveSelectionHost,
	ctx: ObjectiveSelectionContext,
	spec: ObjectiveSelectionSpec,
): Promise<ActiveObjectiveListLoadResult> {
	if (ctx.hasUI) {
		ctx.ui.setStatus?.(spec.statusKey, "listing active Objectives…");
	}

	const args = ["list", "--format", "json"];
	try {
		const result = await host.exec("objective", args, {
			cwd: ctx.cwd,
			timeout: OBJECTIVE_COMMAND_TIMEOUT_MS,
		});
		if (result.code !== 0 || result.killed) {
			return { type: "failed", message: formatExecFailure(formatCommand("objective", args), result) };
		}

		const parsedList = parseObjectiveList(result.stdout);
		if (parsedList.type === "invalid") {
			return { type: "failed", message: parsedList.message };
		}
		return { type: "loaded", list: parsedList.list };
	} catch (error) {
		return { type: "failed", message: formatExecStartupFailure(formatCommand("objective", args), error) };
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus?.(spec.statusKey, undefined);
		}
	}
}

async function changedObjectiveSelection(options: ChangedObjectiveSelectionOptions): Promise<ObjectiveDiffSelection | undefined> {
	const { host, ctx, objectiveList, spec } = options;
	const trunkBranch = objectiveList.trunkBranch.trim();
	const committedChangedSlugs = trunkBranch ? await objectiveDiffChangedSlugs({ host, ctx, spec, trunkBranch }) : [];
	const dirtyChangedSlugs = await objectiveStatusChangedSlugs({ host, ctx, spec });
	const allChangedSlugs = sortedUniqueSlugs([...committedChangedSlugs, ...dirtyChangedSlugs]);
	const dirtyChangedSlugSet = new Set(dirtyChangedSlugs);
	const dirtyActiveSlugs = objectiveList.records.filter((record) => dirtyChangedSlugSet.has(record.slug));
	const changeBasisLabel = dirtyActiveSlugs.length > 0
		? trunkBranch
			? `changed in checkout or vs ${trunkBranch}`
			: "changed in checkout"
		: trunkBranch
			? `changed vs ${trunkBranch}`
			: "changed";

	return changedActiveObjectiveSelection(objectiveList, trunkBranch, allChangedSlugs, changeBasisLabel);
}

async function objectiveDiffChangedSlugs(options: ObjectiveDiffChangedSlugsOptions): Promise<string[]> {
	const { host, ctx, spec, trunkBranch } = options;
	const args = ["diff", "--name-status", "-M", `${trunkBranch}...HEAD`, "--", ".asdl/objectives"];
	if (ctx.hasUI) {
		ctx.ui.setStatus?.(spec.statusKey, `checking Objective diff vs ${trunkBranch}…`);
	}

	try {
		const result = await host.exec("git", args, {
			cwd: ctx.cwd,
			timeout: OBJECTIVE_COMMAND_TIMEOUT_MS,
		});
		if (result.code !== 0 || result.killed) {
			return [];
		}

		return parseObjectiveDiffChangedSlugs(result.stdout);
	} catch {
		// Diff evidence is advisory; command startup failures should fall back to the normal picker.
		return [];
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus?.(spec.statusKey, undefined);
		}
	}
}

async function objectiveStatusChangedSlugs(options: ObjectiveStatusChangedSlugsOptions): Promise<string[]> {
	const { host, ctx, spec } = options;
	const args = ["status", "--porcelain=v1", "-z", "--", ".asdl/objectives"];
	if (ctx.hasUI) {
		ctx.ui.setStatus?.(spec.statusKey, "checking checkout Objective changes…");
	}

	try {
		const result = await host.exec("git", args, {
			cwd: ctx.cwd,
			timeout: OBJECTIVE_COMMAND_TIMEOUT_MS,
		});
		if (result.code !== 0 || result.killed) {
			return [];
		}

		return parseObjectiveStatusChangedSlugs(result.stdout);
	} catch {
		// Dirty-check evidence is advisory; command startup failures should fall back to committed evidence.
		return [];
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus?.(spec.statusKey, undefined);
		}
	}
}

function sortedUniqueSlugs(slugs: string[]): string[] {
	return [...new Set(slugs)].sort((left, right) => left.localeCompare(right));
}

function changedSelectionNotificationBasis(selection: ObjectiveDiffSelection): string {
	const committedDiffLabel = selection.trunkBranch ? `changed vs ${selection.trunkBranch}` : "";
	if (selection.changeBasisLabel === committedDiffLabel) {
		return `from objective diff vs ${selection.trunkBranch}`;
	}

	return `with changes ${selection.changeBasisLabel.replace(/^changed\s+/, "")}`;
}

async function selectObjectiveSlug(options: SelectObjectiveSlugOptions): Promise<string | undefined> {
	const { ctx, title, records, selection } = options;
	const choices = objectiveChoiceMap(records, selection);
	const selected = await ctx.ui.select(title, [...choices.keys()]);
	if (!selected) {
		ctx.ui.notify("Objective selection cancelled.", "info");
		return undefined;
	}

	const slug = choices.get(selected);
	if (!slug) {
		ctx.ui.notify("Objective selection could not be resolved.", "error");
		return undefined;
	}

	return slug;
}

async function selectChangedObjectivesOrOther(options: SelectChangedObjectivesOrOtherOptions): Promise<string | undefined> {
	const { ctx, spec, objectiveList, selection } = options;
	const changedSet = new Set(selection.changedActiveSlugs);
	const changedRecords = objectiveList.records.filter((record) => changedSet.has(record.slug));
	const otherRecords = objectiveList.records.filter((record) => !changedSet.has(record.slug));
	if (changedRecords.length === 0) {
		return selectObjectiveSlug({ ctx, title: spec.selectionTitle, records: objectiveList.records, selection: undefined });
	}

	const choices = objectiveChoiceMap(changedRecords, selection);
	const items = [...choices.keys()];
	if (otherRecords.length > 0) {
		items.push(VIEW_OTHER_OBJECTIVES_CHOICE);
	}

	const selected = await ctx.ui.select(objectiveDiffPickerTitle(spec.selectionTitle, selection), items);
	if (!selected) {
		ctx.ui.notify("Objective selection cancelled.", "info");
		return undefined;
	}

	if (selected === VIEW_OTHER_OBJECTIVES_CHOICE) {
		return selectObjectiveSlug({
			ctx,
			title: `${spec.selectionTitle} (other active Objectives)`,
			records: otherRecords,
			selection: undefined,
		});
	}

	const slug = choices.get(selected);
	if (!slug) {
		ctx.ui.notify("Objective selection could not be resolved.", "error");
		return undefined;
	}

	return slug;
}

export async function chooseActiveObjectiveSlug(
	host: ObjectiveSelectionHost,
	ctx: ObjectiveSelectionContext,
	spec: ObjectiveSelectionSpec,
): Promise<string | undefined> {
	await ctx.waitForIdle();

	const objectiveListResult = await listActiveObjectives(host, ctx, spec);
	if (objectiveListResult.type === "failed") {
		if (ctx.hasUI) {
			ctx.ui.notify(objectiveListResult.message, "error");
		}
		return undefined;
	}

	const objectiveList = objectiveListResult.list;
	if (objectiveList.records.length === 0) {
		if (ctx.hasUI) {
			ctx.ui.notify("No active Objectives. Create one with /skill:objective-create.", "info");
		}
		return undefined;
	}

	if (!ctx.hasUI) {
		return undefined;
	}

	const changedSelection = await changedObjectiveSelection({ host, ctx, objectiveList, spec });
	if (changedSelection && spec.compactDiffSuggestion) {
		return selectChangedObjectivesOrOther({ ctx, spec, objectiveList, selection: changedSelection });
	}

	if (changedSelection) {
		const plural = changedSelection.changedActiveSlugs.length === 1 ? "" : "s";
		const basis = changedSelectionNotificationBasis(changedSelection);
		ctx.ui.notify(
			`Found changed Objective${plural} ${changedSelection.changedActiveSlugs.join(", ")} ${basis}.`,
			"info",
		);
	}
	return selectObjectiveSlug({
		ctx,
		title: spec.selectionTitle,
		records: objectiveRecordsWithChangedFirst(objectiveList.records, changedSelection),
		selection: changedSelection,
	});
}
