// Capability API (`@sdl/objective/api`): the curated, in-process surface that
// sibling consumers such as `ccc` and `sdlcc` depend on. It wraps the
// gateway-injected Domain Core (`ObjectiveCliContext`, which carries the git and
// storage gateways) and never exposes command-face (`ClinkrExit`) types.
//
// Row 1 of the `objective-capability-extension` Objective establishes this
// facade over the existing read/list operations. The objectives selection and
// skill-prompt surface currently stranded in Pi's objectives modules is
// relocated onto this same client in a later row.

import type { ExecResult } from "@sdl/core/exec";
import type { ObjectiveCliContext } from "./context.ts";
import { createRealObjectiveContext } from "./context.ts";
import {
	buildObjectiveListResult,
	matchesStatusFilter,
	type ListObjectivesRequest,
	type ObjectiveListResult,
	type ObjectiveListRecord,
} from "./operations/list-objectives.ts";
import { readObjectiveRecord, type ReadObjectiveResult } from "./operations/read-objective.ts";
import type { ObjectiveRecordStatus } from "./storage.ts";
import { parseObjectiveListData, type ObjectiveListParseResult } from "./objective-list-json.ts";
import {
	VIEW_OTHER_OBJECTIVES_CHOICE,
	changedActiveObjectiveSelection,
	formatObjectiveChoice,
	objectiveChoiceMap,
	objectiveDiffPickerTitle,
	objectiveRecordsWithChangedFirst,
	parseObjectiveDiffChangedSlugs,
	parseObjectiveStatusChangedSlugs,
	type ChangedActiveObjectiveSelectionOptions,
	type ObjectiveDiffSelection,
} from "./objective-picker.ts";
import {
	buildObjectiveSkillPrompt,
	changedSelectionNotificationBasis,
	type BuildObjectiveSkillPromptOptions,
	type ObjectiveSelectionSpec,
	type ObjectiveSkillPromptSpec,
} from "./objective-selection.ts";
import {
	completeObjectiveListArgs,
	parseObjectiveListArgs,
	type ObjectiveListArgsParseResult,
	type ObjectiveListParsedArgs,
} from "./objective-cli-args.ts";
import {
	objectiveCompletionItem,
	parseObjectiveCandidatesData,
	type ObjectiveCandidatesParseResult,
	type ObjectiveCliCompletionItem,
} from "./objective-candidates.ts";
import {
	objectiveCommandSpecs,
	objectiveCreateCommandSpec,
	type ObjectiveCommandSpec,
	type ObjectiveCreateCommandSpec,
} from "./objective-command-specs.ts";

export interface ObjectiveApiFailure {
	errorType: string;
	message: string;
}

export type ObjectiveListing =
	| { ok: true; result: ObjectiveListResult }
	| { ok: false; failure: ObjectiveApiFailure };

export type ObjectiveRead =
	| { ok: true; result: ReadObjectiveResult }
	| { ok: false; failure: ObjectiveApiFailure };

export interface ObjectiveCandidate {
	slug: string;
	status: ObjectiveRecordStatus;
}

export type ObjectiveCandidates =
	| { ok: true; candidates: readonly ObjectiveCandidate[] }
	| { ok: false; failure: ObjectiveApiFailure };

export interface ObjectiveClientOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
	/** Inject a prebuilt Domain Core context (gateways) instead of constructing a real one. */
	context?: ObjectiveCliContext;
}

/**
 * In-process facade over the objective Domain Core. Mirrors the `@sdl/slot/api`
 * client shape: a single factory returning a typed client whose methods resolve
 * the gateway-injected context lazily and return clean ok/failure results.
 */
export interface ObjectiveClient {
	/** List checkout-local Objective records (defaults to active status). */
	listObjectives(request?: Partial<ListObjectivesRequest>): Promise<ObjectiveListing>;
	/** Read one Objective record by slug. */
	readObjective(slug: string): Promise<ObjectiveRead>;
	/** List active (open) Objective slugs for selection menus. */
	listActiveCandidates(): Promise<ObjectiveCandidates>;
}

const DEFAULT_LIST_REQUEST: ListObjectivesRequest = {
	names: false,
	status: "active",
	minimal: false,
};

export function createObjectiveClient(options: ObjectiveClientOptions): ObjectiveClient {
	return {
		async listObjectives(request) {
			const ctx = await resolveContext(options);
			const result = await buildObjectiveListResult(ctx, {
				...DEFAULT_LIST_REQUEST,
				...request,
			});
			if (result.type === "ok") return { ok: true, result: result.value };
			return { ok: false, failure: toFailure(result.error) };
		},
		async readObjective(slug) {
			const ctx = await resolveContext(options);
			const result = await readObjectiveRecord(ctx.storage, slug);
			if (result.type === "ok") return { ok: true, result: result.value };
			return { ok: false, failure: toFailure(result.error) };
		},
		async listActiveCandidates() {
			const ctx = await resolveContext(options);
			const inventory = await ctx.storage.checkoutInventory();
			if (!inventory.ok) return { ok: false, failure: toFailure(inventory.error) };
			return {
				ok: true,
				candidates: inventory.value.records
					.filter((record) => matchesStatusFilter(record.status, "active"))
					.map((record) => ({ slug: record.slug, status: record.status })),
			};
		},
	};
}

async function resolveContext(options: ObjectiveClientOptions): Promise<ObjectiveCliContext> {
	if (options.context !== undefined) return options.context;
	return await createRealObjectiveContext({
		cwd: options.cwd,
		...(options.env === undefined ? {} : { env: options.env as NodeJS.ProcessEnv }),
	});
}

function toFailure(error: { code: string; message: string }): ObjectiveApiFailure {
	return { errorType: error.code, message: error.message };
}

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

export {
	parseObjectiveListData,
	VIEW_OTHER_OBJECTIVES_CHOICE,
	changedActiveObjectiveSelection,
	formatObjectiveChoice,
	objectiveChoiceMap,
	objectiveDiffPickerTitle,
	objectiveRecordsWithChangedFirst,
	parseObjectiveDiffChangedSlugs,
	parseObjectiveStatusChangedSlugs,
	buildObjectiveSkillPrompt,
	changedSelectionNotificationBasis,
	completeObjectiveListArgs,
	parseObjectiveListArgs,
	objectiveCompletionItem,
	parseObjectiveCandidatesData,
	objectiveCommandSpecs,
	objectiveCreateCommandSpec,
};

export type {
	ObjectiveCliContext,
	ObjectiveListResult,
	ObjectiveListRecord,
	ReadObjectiveResult,
	ObjectiveListParseResult,
	ChangedActiveObjectiveSelectionOptions,
	ObjectiveDiffSelection,
	ObjectiveSelectionSpec,
	ObjectiveSkillPromptSpec,
	BuildObjectiveSkillPromptOptions,
	ObjectiveListParsedArgs,
	ObjectiveListArgsParseResult,
	ObjectiveCliCompletionItem,
	ObjectiveCandidatesParseResult,
	ObjectiveCommandSpec,
	ObjectiveCreateCommandSpec,
};

export type ObjectiveList = ObjectiveListResult;
