import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";

import { readRunnerSubagentUsageFromSessionFile } from "../runner-subagents/extension-usage.ts";
import type {
	RunnerSubagentResult,
	RunnerSubagentUsageMetadata,
} from "../runner-subagents/extension-api.ts";
import {
	createRunnerSubagentJsonEventParser,
	type RunnerSubagentJsonEventParserSnapshot,
} from "../runner-subagents/json-events.ts";
import { extractRunnerSubagentTimelineFromSessionJsonl } from "../runner-subagents/timeline.ts";
import type {
	RunnerSubagentCurrentAction,
	RunnerSubagentTimeline,
} from "../runner-subagents/timeline.ts";
import type { GitHeadSnapshot } from "./git-head.ts";
import type { ReadTextFile } from "./read-text-dependencies.ts";
import type { SubagentFleetRetryEvidence, SubagentFleetTaskSnapshot } from "./registry.ts";
import type { ReadWorktreeState, WorktreeStateSnapshot } from "./worktree-state.ts";

export const SUBAGENT_FLEET_PARENT_ENTRY_ID = "parent-session";

export interface ParentFleetNavigatorEntry {
	kind: "parent";
	id: typeof SUBAGENT_FLEET_PARENT_ENTRY_ID;
	title: string;
	sessionFile: string;
}

export interface TaskFleetNavigatorEntry {
	kind: "task";
	task: SubagentFleetTaskSnapshot;
}

export type FleetNavigatorEntry = ParentFleetNavigatorEntry | TaskFleetNavigatorEntry;

export interface SubagentFleetTaskLiveActivity {
	currentAction: RunnerSubagentCurrentAction;
	quietMs?: number;
}

export interface SubagentFleetPostRunSummary {
	status: string;
	lastDiagnostic?: string;
	retry?: SubagentFleetRetryEvidence;
	commit: SubagentFleetPostRunCommitSummary;
	worktreeState?: WorktreeStateSnapshot;
}

export type SubagentFleetPostRunCommitSummary =
	| { status: "changed"; from: string; to: string }
	| { status: "unchanged"; head: string }
	| { status: "unavailable"; reason: string };

export interface SubagentFleetTaskDetail {
	title: string;
	prompt?: string;
	sessionFile?: string;
	modelText: string;
	turnCount: number;
	toolCount: number;
	elapsedMs: number;
	state: string;
	status: string;
	timeline: RunnerSubagentTimeline;
	usage?: RunnerSubagentUsageMetadata;
	liveActivity?: SubagentFleetTaskLiveActivity;
	worktreeState?: WorktreeStateSnapshot;
	postRunSummary?: SubagentFleetPostRunSummary;
	message?: string;
}

export interface FleetEntrySessionParseCache {
	signature: string;
	snapshot: RunnerSubagentJsonEventParserSnapshot;
	timeline: RunnerSubagentTimeline;
	usage: RunnerSubagentUsageMetadata;
}

export interface LoadedFleetEntryDetail {
	detail: SubagentFleetTaskDetail;
	sessionContentSignature?: string;
	sessionParseCache?: FleetEntrySessionParseCache;
}

export interface FleetDetailContext {
	readTextFile: ReadTextFile;
	readWorktreeState: ReadWorktreeState;
	cwd: string;
}

export async function loadFleetTaskDetail(input: {
	task: SubagentFleetTaskSnapshot;
	context: FleetDetailContext;
}): Promise<SubagentFleetTaskDetail> {
	const loaded = await loadFleetEntryDetail({
		entry: { kind: "task", task: input.task },
		context: input.context,
	});
	return loaded.detail;
}

export async function loadFleetEntryDetail(input: {
	entry: FleetNavigatorEntry;
	context: FleetDetailContext;
	previous?: FleetEntrySessionParseCache;
}): Promise<LoadedFleetEntryDetail> {
	const worktreeState = await loadEntryWorktreeState(input.entry, input.context);
	const sessionFile = entrySessionFile(input.entry);
	if (sessionFile === undefined)
		return { detail: placeholderDetail(input.entry, "no session file yet", worktreeState) };
	let jsonl: string;
	try {
		jsonl = await input.context.readTextFile(sessionFile);
	} catch (error) {
		return {
			detail: placeholderDetail(
				input.entry,
				`Could not read session file: ${formatErrorMessage(error)}`,
				worktreeState,
			),
		};
	}
	const signature = sessionContentSignature(jsonl);
	const parsed =
		input.previous?.signature === signature
			? input.previous
			: await parseFleetEntrySession({
					sessionFile,
					title: entryTitle(input.entry),
					jsonl,
					signature,
				});
	return {
		detail: detailFromSnapshot({
			entry: input.entry,
			sessionFile,
			snapshot: parsed.snapshot,
			timeline: parsed.timeline,
			usage: parsed.usage,
			...optionalEntry("worktreeState", worktreeState),
		}),
		sessionContentSignature: signature,
		sessionParseCache: parsed,
	};
}

async function parseFleetEntrySession(input: {
	sessionFile: string;
	title: string;
	jsonl: string;
	signature: string;
}): Promise<FleetEntrySessionParseCache> {
	const parser = createRunnerSubagentJsonEventParser({
		title: input.title,
		sessionFile: input.sessionFile,
	});
	parser.pushChunk(input.jsonl);
	parser.finish();
	return {
		signature: input.signature,
		snapshot: parser.getSnapshot(),
		timeline: extractRunnerSubagentTimelineFromSessionJsonl(input.jsonl),
		usage: await readRunnerSubagentUsageFromSessionFile(input.sessionFile, () => input.jsonl),
	};
}

export function detailFromSnapshot(input: {
	entry: FleetNavigatorEntry;
	sessionFile: string;
	snapshot: RunnerSubagentJsonEventParserSnapshot;
	timeline: RunnerSubagentTimeline;
	usage: RunnerSubagentUsageMetadata;
	worktreeState?: WorktreeStateSnapshot;
}): SubagentFleetTaskDetail {
	const task = entryTask(input.entry);
	const status =
		task?.finalStatus ?? input.snapshot.stopReason ?? task?.state ?? input.snapshot.progress.state;
	const postRunSummary =
		task?.state === "done" && task.finalStatus !== undefined
			? buildPostRunSummary({
					task,
					snapshot: input.snapshot,
					status: task.finalStatus,
					...optionalEntry("worktreeState", input.worktreeState),
				})
			: undefined;
	return {
		title: entryTitle(input.entry),
		...(task?.prompt === undefined ? {} : { prompt: task.prompt }),
		sessionFile: input.sessionFile,
		modelText: modelText(input.snapshot),
		turnCount: input.snapshot.progress.turnCount,
		toolCount: input.snapshot.progress.toolCount,
		elapsedMs: input.snapshot.progress.elapsedMs,
		state: input.snapshot.progress.state,
		status,
		timeline: input.timeline,
		usage: input.usage,
		...optionalEntry("worktreeState", input.worktreeState),
		...optionalEntry("postRunSummary", postRunSummary),
	};
}

export function placeholderDetail(
	entry: FleetNavigatorEntry,
	message: string,
	worktreeState?: WorktreeStateSnapshot,
): SubagentFleetTaskDetail {
	const task = entryTask(entry);
	const sessionFile = entrySessionFile(entry);
	return {
		title: entryTitle(entry),
		...(task?.prompt === undefined ? {} : { prompt: task.prompt }),
		...(sessionFile === undefined ? {} : { sessionFile }),
		modelText: "model unknown",
		turnCount: 0,
		toolCount: 0,
		elapsedMs: 0,
		state: task?.state ?? "session",
		status: task?.finalStatus ?? task?.state ?? "session",
		timeline: { entries: [], droppedEntryCount: 0, currentAction: { kind: "idle" } },
		...optionalEntry("worktreeState", worktreeState),
		message,
	};
}

export async function loadEntryWorktreeState(
	entry: FleetNavigatorEntry,
	context: FleetDetailContext,
): Promise<WorktreeStateSnapshot | undefined> {
	if (entry.kind !== "task") return undefined;
	try {
		return await context.readWorktreeState({ cwd: context.cwd });
	} catch (error) {
		return { status: "unavailable", reason: formatErrorMessage(error) };
	}
}

export function readWorktreeStateUnavailable(): Promise<WorktreeStateSnapshot> {
	return Promise.resolve({ status: "unavailable", reason: "git reader unavailable" });
}

export function entryId(entry: FleetNavigatorEntry | undefined): string | undefined {
	if (entry === undefined) return undefined;
	return entry.kind === "parent" ? entry.id : entry.task.id;
}

export function entryTitle(entry: FleetNavigatorEntry): string {
	return entry.kind === "parent" ? entry.title : entry.task.title;
}

export function entryTask(entry: FleetNavigatorEntry): SubagentFleetTaskSnapshot | undefined {
	return entry.kind === "task" ? entry.task : undefined;
}

export function entrySessionFile(entry: FleetNavigatorEntry): string | undefined {
	return entry.kind === "parent" ? entry.sessionFile : entry.task.sessionFile;
}

export function isRunningTaskDetailEntry(
	entry: FleetNavigatorEntry | undefined,
): entry is TaskFleetNavigatorEntry {
	return (
		entry?.kind === "task" && entry.task.state === "running" && entry.task.sessionFile !== undefined
	);
}

export function assumeThinkingWhileRunning(
	currentAction: RunnerSubagentCurrentAction,
): RunnerSubagentCurrentAction {
	return currentAction.kind === "idle" ? { kind: "thinking" } : currentAction;
}

export function sessionContentSignature(jsonl: string): string {
	const suffix = jsonl.slice(Math.max(0, jsonl.length - 512));
	return `${jsonl.length}:${suffix}`;
}

export function buildPostRunSummary(input: {
	task: SubagentFleetTaskSnapshot;
	snapshot: RunnerSubagentJsonEventParserSnapshot;
	status: RunnerSubagentResult["status"];
	worktreeState?: WorktreeStateSnapshot;
}): SubagentFleetPostRunSummary {
	const lastDiagnostic = postRunDiagnostic(input.snapshot, input.status);
	return {
		status: input.status,
		...optionalEntry("lastDiagnostic", lastDiagnostic),
		...optionalEntry("retry", input.task.retry),
		commit: summarizeHeadChange(input.task.headBaseline, input.task.finalHead),
		...optionalEntry("worktreeState", input.worktreeState),
	};
}

export function postRunDiagnostic(
	snapshot: RunnerSubagentJsonEventParserSnapshot,
	status: RunnerSubagentResult["status"],
): string | undefined {
	if (snapshot.terminalExecutionError !== undefined) return snapshot.terminalExecutionError.message;
	if (snapshot.protocolError !== undefined) return snapshot.protocolError.message;
	if (snapshot.errorMessage !== undefined) return snapshot.errorMessage;
	if (snapshot.error !== undefined) return snapshot.error.message;
	if (!isSuccessfulPostRunStatus(status)) return `unavailable; final status ${status}`;
	return undefined;
}

function isSuccessfulPostRunStatus(status: RunnerSubagentResult["status"]): boolean {
	switch (status) {
		case "completed":
		case "final-text":
			return true;
		case "blocked":
		case "stopped-without-terminal":
		case "stopped-without-useful-text":
		case "cancelled":
		case "error":
		case "protocol-error":
			return false;
		default: {
			const exhaustive: never = status;
			return exhaustive;
		}
	}
}

export function summarizeHeadChange(
	baseline: GitHeadSnapshot | undefined,
	finalHead: GitHeadSnapshot | undefined,
): SubagentFleetPostRunCommitSummary {
	if (baseline === undefined) return { status: "unavailable", reason: "missing baseline HEAD" };
	if (baseline.status === "unavailable") {
		return { status: "unavailable", reason: `baseline HEAD unavailable: ${baseline.reason}` };
	}
	if (finalHead === undefined) return { status: "unavailable", reason: "missing final HEAD" };
	if (finalHead.status === "unavailable") {
		return { status: "unavailable", reason: `final HEAD unavailable: ${finalHead.reason}` };
	}
	if (baseline.oid === finalHead.oid) return { status: "unchanged", head: baseline.oid };
	return { status: "changed", from: baseline.oid, to: finalHead.oid };
}

function modelText(snapshot: RunnerSubagentJsonEventParserSnapshot): string {
	const model = snapshot.progress.launch?.model;
	return model === undefined ? "model unknown" : `${model.provider}/${model.id}`;
}
