import type { ExecResult } from "@sdl/exec";

import type { ObjectiveListRecord, ObjectiveListResult } from "./operations/list-objectives.ts";
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
import {
	changedSelectionNotificationBasis,
	type ObjectiveSelectionSpec,
} from "./objective-selection.ts";
import { createObjectiveClient } from "./objective-api-client.ts";

const OBJECTIVE_COMMAND_TIMEOUT_MS = 30_000;

export type ObjectiveSelectionNotifyLevel = "info" | "warning" | "error";

export interface ObjectiveSelectionHost {
	exec(
		command: string,
		args: readonly string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
	loadObjectiveList?: (
		ctx: ObjectiveSelectionContext,
		spec: ObjectiveSelectionSpec,
	) => Promise<ObjectiveSelectionListLoadResult>;
}

export interface ObjectiveSelectionUi {
	notify(message: string, level: ObjectiveSelectionNotifyLevel): void;
	select?: (title: string, options: readonly string[]) => Promise<string | undefined>;
	setStatus?: (key: string, value: string | undefined) => void;
}

export interface ObjectiveSelectionContext {
	cwd: string;
	waitForIdle(): Promise<void>;
	hasUI: boolean;
	ui: ObjectiveSelectionUi;
}

export interface ObjectiveSelectionCommandUi {
	notify(message: string, level?: ObjectiveSelectionNotifyLevel): void;
	select?(title: string, options: string[]): Promise<string | undefined>;
	setStatus?(key: string, value: string | undefined): void;
}

export interface ObjectiveSelectionCommandContext {
	cwd: string;
	waitForIdle(): Promise<void>;
	hasUI?: boolean;
	ui: ObjectiveSelectionCommandUi;
}

export function objectiveSelectionContextFromCommandContext(
	ctx: ObjectiveSelectionCommandContext,
): ObjectiveSelectionContext {
	const selectSource = ctx.ui.select;
	const select: ObjectiveSelectionContext["ui"]["select"] | undefined =
		selectSource === undefined
			? undefined
			: (title, options) => selectSource.call(ctx.ui, title, [...options]);
	const setStatus: ObjectiveSelectionContext["ui"]["setStatus"] | undefined =
		ctx.ui.setStatus?.bind(ctx.ui);
	return {
		cwd: ctx.cwd,
		hasUI: ctx.hasUI === true,
		ui: {
			notify: ctx.ui.notify.bind(ctx.ui),
			...(select === undefined ? {} : { select }),
			...(setStatus === undefined ? {} : { setStatus }),
		},
		waitForIdle: ctx.waitForIdle.bind(ctx),
	};
}

interface ObjectivePickerUi extends ObjectiveSelectionUi {
	select: NonNullable<ObjectiveSelectionUi["select"]>;
}

interface ObjectivePickerContext extends ObjectiveSelectionContext {
	ui: ObjectivePickerUi;
}

interface ActiveObjectiveListLoaded {
	type: "loaded";
	list: ObjectiveListResult;
}

interface ActiveObjectiveListFailed {
	type: "failed";
	message: string;
}

export type ObjectiveSelectionListLoadResult =
	| ActiveObjectiveListLoaded
	| ActiveObjectiveListFailed;

interface ChangedObjectiveSelectionOptions {
	host: ObjectiveSelectionHost;
	ctx: ObjectiveSelectionContext;
	objectiveList: ObjectiveListResult;
	spec: ObjectiveSelectionSpec;
}

interface ObjectiveDiffChangedSlugsOptions {
	host: ObjectiveSelectionHost;
	ctx: ObjectiveSelectionContext;
	trunkBranch: string;
}

interface ObjectiveStatusChangedSlugsOptions {
	host: ObjectiveSelectionHost;
	ctx: ObjectiveSelectionContext;
}

interface SelectObjectiveSlugOptions {
	ctx: ObjectivePickerContext;
	title: string;
	records: ObjectiveListRecord[];
	selection: ObjectiveDiffSelection | undefined;
}

interface SelectChangedObjectivesOrOtherOptions {
	ctx: ObjectivePickerContext;
	spec: ObjectiveSelectionSpec;
	objectiveList: ObjectiveListResult;
	selection: ObjectiveDiffSelection;
}

async function listActiveObjectives(
	ctx: ObjectiveSelectionContext,
	spec: ObjectiveSelectionSpec,
): Promise<ObjectiveSelectionListLoadResult> {
	if (ctx.hasUI) {
		ctx.ui.setStatus?.(spec.statusKey, "listing active Objectives…");
	}

	try {
		const client = createObjectiveClient({ cwd: ctx.cwd });
		const listing = await client.listObjectives({ status: "active", minimal: true });
		if (listing.ok) {
			return { type: "loaded", list: listing.result };
		}

		return { type: "failed", message: formatObjectiveListFailure(listing.failure.message) };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { type: "failed", message: formatObjectiveListFailure(message) };
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus?.(spec.statusKey, undefined);
		}
	}
}

function formatObjectiveListFailure(message: string): string {
	return `objective list failed: ${message}`;
}

async function changedObjectiveSelection(
	options: ChangedObjectiveSelectionOptions,
): Promise<ObjectiveDiffSelection | undefined> {
	const { host, ctx, objectiveList, spec } = options;
	const trunkBranch = objectiveList.trunkBranch.trim();
	if (ctx.hasUI) {
		ctx.ui.setStatus?.(spec.statusKey, "checking Objective changes…");
	}

	let committedChangedSlugs: string[];
	let dirtyChangedSlugs: string[];
	try {
		[committedChangedSlugs, dirtyChangedSlugs] = await Promise.all([
			trunkBranch
				? objectiveDiffChangedSlugs({ host, ctx, trunkBranch })
				: Promise.resolve<string[]>([]),
			objectiveStatusChangedSlugs({ host, ctx }),
		]);
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus?.(spec.statusKey, undefined);
		}
	}
	const allChangedSlugs = [...committedChangedSlugs, ...dirtyChangedSlugs];
	const dirtyChangedSlugSet = new Set(dirtyChangedSlugs);
	const dirtyActiveSlugs = objectiveList.records.filter((record) =>
		dirtyChangedSlugSet.has(record.slug),
	);
	const changeBasisLabel =
		dirtyActiveSlugs.length > 0
			? trunkBranch
				? `changed in checkout or vs ${trunkBranch}`
				: "changed in checkout"
			: trunkBranch
				? `changed vs ${trunkBranch}`
				: "changed";

	return changedActiveObjectiveSelection({
		objectiveList,
		trunkBranch,
		allChangedSlugs,
		changeBasisLabel,
	});
}

async function objectiveDiffChangedSlugs(
	options: ObjectiveDiffChangedSlugsOptions,
): Promise<string[]> {
	const { host, ctx, trunkBranch } = options;
	const args = ["diff", "--name-status", "-M", `${trunkBranch}...HEAD`, "--", ".sdl/objectives"];
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
	}
}

async function objectiveStatusChangedSlugs(
	options: ObjectiveStatusChangedSlugsOptions,
): Promise<string[]> {
	const { host, ctx } = options;
	const args = ["status", "--porcelain=v1", "-z", "--", ".sdl/objectives"];
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
	}
}

function hasObjectivePicker(ctx: ObjectiveSelectionContext): ctx is ObjectivePickerContext {
	return ctx.hasUI && ctx.ui.select !== undefined;
}

async function selectObjectiveSlug(
	options: SelectObjectiveSlugOptions,
): Promise<string | undefined> {
	const { ctx, title, records, selection } = options;
	const select = ctx.ui.select;
	const choices = objectiveChoiceMap(records, selection);
	const selected = await select(title, [...choices.keys()]);
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
	options: SelectChangedObjectivesOrOtherOptions,
): Promise<string | undefined> {
	const { ctx, spec, objectiveList, selection } = options;
	const changedSet = new Set(selection.changedActiveSlugs);
	const changedRecords = objectiveList.records.filter((record) => changedSet.has(record.slug));
	const otherRecords = objectiveList.records.filter((record) => !changedSet.has(record.slug));
	if (changedRecords.length === 0) {
		return selectObjectiveSlug({
			ctx,
			title: spec.selectionTitle,
			records: objectiveList.records,
			selection: undefined,
		});
	}

	const choices = objectiveChoiceMap(changedRecords, selection);
	const items = [...choices.keys()];
	if (otherRecords.length > 0) {
		items.push(VIEW_OTHER_OBJECTIVES_CHOICE);
	}

	const select = ctx.ui.select;
	const selected = await select(objectiveDiffPickerTitle(spec.selectionTitle, selection), items);
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

	const objectiveListResult =
		host.loadObjectiveList !== undefined
			? await host.loadObjectiveList(ctx, spec)
			: await listActiveObjectives(ctx, spec);
	const hasPicker = hasObjectivePicker(ctx);
	if (objectiveListResult.type === "failed") {
		if (hasPicker) {
			ctx.ui.notify(objectiveListResult.message, "error");
		}
		return undefined;
	}

	const objectiveList = objectiveListResult.list;
	if (objectiveList.records.length === 0) {
		if (hasPicker) {
			ctx.ui.notify("No active Objectives. Create one with /objective:create.", "info");
		}
		return undefined;
	}

	if (!hasPicker) {
		return undefined;
	}

	const changedSelection = await changedObjectiveSelection({ host, ctx, objectiveList, spec });
	if (changedSelection && spec.shouldCompactDiffSuggestion) {
		return selectChangedObjectivesOrOther({
			ctx,
			spec,
			objectiveList,
			selection: changedSelection,
		});
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
