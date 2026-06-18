import {
	formatCommand,
	formatCommandFailure,
	formatCommandStartupFailure,
	type ExecResult,
} from "@asdl/core/exec";
import type { CommandContext } from "./cmux/types.ts";
import {
	parseObjectiveList,
	type ObjectiveList,
	type ObjectiveListRecord,
} from "./objective-list.ts";
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

export interface ObjectiveSkillPromptSpec {
	fallbackPrompt: string;
	actionPrompt: string;
}

export interface BuildObjectiveSkillPromptOptions {
	spec: ObjectiveSkillPromptSpec;
	skillBlock: string | undefined;
	objective: string;
	postSelectionReminder?: string;
}

export interface ObjectiveSelectionHost {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
}

interface ObjectiveSelectionUi {
	notify: CommandContext["ui"]["notify"];
	setStatus: CommandContext["ui"]["setStatus"];
	select?: CommandContext["ui"]["select"];
}

interface ObjectivePickerUi extends ObjectiveSelectionUi {
	select: NonNullable<CommandContext["ui"]["select"]>;
}

interface ObjectivePickerContext extends ObjectiveSelectionContext {
	ui: ObjectivePickerUi;
}

export interface ObjectiveSelectionContext extends Pick<CommandContext, "cwd" | "waitForIdle"> {
	hasUI: boolean;
	ui: ObjectiveSelectionUi;
}

export function objectiveSelectionContextFromCommandContext(
	ctx: CommandContext,
): ObjectiveSelectionContext {
	const select = ctx.ui.select?.bind(ctx.ui);
	const setStatus = ctx.ui.setStatus?.bind(ctx.ui);
	return {
		cwd: ctx.cwd,
		hasUI: ctx.hasUI === true,
		ui: {
			notify: ctx.ui.notify.bind(ctx.ui),
			select,
			setStatus,
		},
		waitForIdle: ctx.waitForIdle.bind(ctx),
	};
}

export function buildObjectiveSkillPrompt(options: BuildObjectiveSkillPromptOptions): string {
	const { spec, skillBlock, objective, postSelectionReminder = "" } = options;
	return `${skillBlock ?? spec.fallbackPrompt}

${spec.actionPrompt}

\`\`\`text
${objective}
\`\`\`

Treat this as an explicit user selection. Do not auto-select a different Objective.${postSelectionReminder}`;
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

	const args = ["list", "--minimal", "--format", "json"];
	try {
		const result = await host.exec("objective", args, {
			cwd: ctx.cwd,
			timeout: OBJECTIVE_COMMAND_TIMEOUT_MS,
		});
		if (result.code !== 0 || result.killed) {
			return {
				type: "failed",
				message: formatCommandFailure(
					"objective command failed",
					formatCommand("objective", args),
					result,
				),
			};
		}

		const parsedList = parseObjectiveList(result.stdout);
		if (parsedList.type === "invalid") {
			return { type: "failed", message: parsedList.message };
		}
		return { type: "loaded", list: parsedList.list };
	} catch (error) {
		return {
			type: "failed",
			message: formatCommandStartupFailure(
				"objective command failed",
				formatCommand("objective", args),
				error,
			),
		};
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus?.(spec.statusKey, undefined);
		}
	}
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
	const allChangedSlugs = sortedUniqueSlugs([...committedChangedSlugs, ...dirtyChangedSlugs]);
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

	return changedActiveObjectiveSelection(
		objectiveList,
		trunkBranch,
		allChangedSlugs,
		changeBasisLabel,
	);
}

async function objectiveDiffChangedSlugs(
	options: ObjectiveDiffChangedSlugsOptions,
): Promise<string[]> {
	const { host, ctx, trunkBranch } = options;
	const args = ["diff", "--name-status", "-M", `${trunkBranch}...HEAD`, "--", ".asdl/objectives"];
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
	const args = ["status", "--porcelain=v1", "-z", "--", ".asdl/objectives"];
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

function sortedUniqueSlugs(slugs: string[]): string[] {
	return [...new Set(slugs)].sort((left, right) => left.localeCompare(right));
}

function hasObjectivePicker(ctx: ObjectiveSelectionContext): ctx is ObjectivePickerContext {
	return ctx.hasUI && ctx.ui.select !== undefined;
}

function changedSelectionNotificationBasis(selection: ObjectiveDiffSelection): string {
	const committedDiffLabel = selection.trunkBranch ? `changed vs ${selection.trunkBranch}` : "";
	if (selection.changeBasisLabel === committedDiffLabel) {
		return `from objective diff vs ${selection.trunkBranch}`;
	}

	return `with changes ${selection.changeBasisLabel.replace(/^changed\s+/, "")}`;
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

	const objectiveListResult = await listActiveObjectives(host, ctx, spec);
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
	if (changedSelection && spec.compactDiffSuggestion) {
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
