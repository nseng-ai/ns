import { formatCommand, tailText, type ExecResult } from "./command-runtime.ts";
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
const MAX_ERROR_CHARS = 4_000;

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

function truncateTail(text: string, maxChars: number): string {
	const tail = tailText(text, { maxChars });
	if (tail === text) {
		return text;
	}

	return `[Output truncated to the last ${maxChars} characters.]\n\n${tail.slice(1)}`;
}

function formatExecFailure(commandDisplay: string, result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const stdout = result.stdout.trimEnd() || "(empty)";
	const stderr = result.stderr.trimEnd() || "(empty)";
	return truncateTail(
		`objective command failed (${status}).\n\n$ ${commandDisplay}\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`,
		MAX_ERROR_CHARS,
	);
}

function formatExecStartupFailure(commandDisplay: string, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return truncateTail(`objective command failed before completion.\n\n$ ${commandDisplay}\n\nerror:\n${message}`, MAX_ERROR_CHARS);
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

async function changedObjectiveSelection(
	host: ObjectiveSelectionHost,
	ctx: ObjectiveSelectionContext,
	objectiveList: ObjectiveList,
	spec: ObjectiveSelectionSpec,
): Promise<ObjectiveDiffSelection | undefined> {
	const trunkBranch = objectiveList.trunkBranch.trim();
	const committedChangedSlugs = trunkBranch ? await objectiveDiffChangedSlugs(host, ctx, spec, trunkBranch) : [];
	const dirtyChangedSlugs = await objectiveStatusChangedSlugs(host, ctx, spec);
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

async function objectiveDiffChangedSlugs(
	host: ObjectiveSelectionHost,
	ctx: ObjectiveSelectionContext,
	spec: ObjectiveSelectionSpec,
	trunkBranch: string,
): Promise<string[]> {
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
		return [];
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus?.(spec.statusKey, undefined);
		}
	}
}

async function objectiveStatusChangedSlugs(
	host: ObjectiveSelectionHost,
	ctx: ObjectiveSelectionContext,
	spec: ObjectiveSelectionSpec,
): Promise<string[]> {
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

async function selectObjectiveSlug(
	ctx: ObjectiveSelectionContext,
	title: string,
	records: ObjectiveListRecord[],
	selection: ObjectiveDiffSelection | undefined,
): Promise<string | undefined> {
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

async function selectChangedObjectivesOrOther(
	ctx: ObjectiveSelectionContext,
	spec: ObjectiveSelectionSpec,
	objectiveList: ObjectiveList,
	selection: ObjectiveDiffSelection,
): Promise<string | undefined> {
	const changedSet = new Set(selection.changedActiveSlugs);
	const changedRecords = objectiveList.records.filter((record) => changedSet.has(record.slug));
	const otherRecords = objectiveList.records.filter((record) => !changedSet.has(record.slug));
	if (changedRecords.length === 0) {
		return selectObjectiveSlug(ctx, spec.selectionTitle, objectiveList.records, undefined);
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
		return selectObjectiveSlug(ctx, `${spec.selectionTitle} (other active Objectives)`, otherRecords, undefined);
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

	const changedSelection = await changedObjectiveSelection(host, ctx, objectiveList, spec);
	if (changedSelection && spec.compactDiffSuggestion) {
		return selectChangedObjectivesOrOther(ctx, spec, objectiveList, changedSelection);
	}

	if (changedSelection) {
		const plural = changedSelection.changedActiveSlugs.length === 1 ? "" : "s";
		const basis = changedSelectionNotificationBasis(changedSelection);
		ctx.ui.notify(
			`Found changed Objective${plural} ${changedSelection.changedActiveSlugs.join(", ")} ${basis}.`,
			"info",
		);
	}
	return selectObjectiveSlug(
		ctx,
		spec.selectionTitle,
		objectiveRecordsWithChangedFirst(objectiveList.records, changedSelection),
		changedSelection,
	);
}
