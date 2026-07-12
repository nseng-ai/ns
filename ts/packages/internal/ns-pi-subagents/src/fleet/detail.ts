import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";

import { readRunnerSubagentUsageFromSessionFile } from "../runner-subagents/extension-usage.ts";
import {
	isSuccessfulRunnerSubagentStatus,
	type RunnerSubagentResult,
	type RunnerSubagentUsageMetadata,
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
import type { SubagentFleetTaskSnapshot } from "./registry.ts";

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
	commit: SubagentFleetPostRunCommitSummary;
}

export type SubagentFleetPostRunCommitSummary =
	| { status: "changed"; from: string; to: string }
	| { status: "unchanged"; head: string }
	| { status: "unavailable"; reason: string };

export type SubagentFleetRunDuration =
	| { kind: "completed"; elapsedMs: number }
	| { kind: "running"; startedAtMs: number }
	| { kind: "unknown" };

export interface SubagentFleetTaskDetail {
	title: string;
	prompt?: string;
	sessionFile?: string;
	sessionCwd?: string;
	modelText: string;
	turnCount: number;
	toolCount: number;
	duration: SubagentFleetRunDuration;
	state: string;
	status: string;
	timeline: RunnerSubagentTimeline;
	usage?: RunnerSubagentUsageMetadata;
	liveActivity?: SubagentFleetTaskLiveActivity;
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
	const sessionFile = entrySessionFile(input.entry);
	if (sessionFile === undefined)
		return { detail: placeholderDetail(input.entry, "no session file yet") };
	let jsonl: string;
	try {
		jsonl = await input.context.readTextFile(sessionFile);
	} catch (error) {
		return {
			detail: placeholderDetail(
				input.entry,
				`Could not read session file: ${formatErrorMessage(error)}`,
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
				})
			: undefined;
	return {
		title: entryTitle(input.entry),
		...(task?.prompt === undefined ? {} : { prompt: task.prompt }),
		sessionFile: input.sessionFile,
		...optionalEntry("sessionCwd", sessionCwdFromSnapshot(input.snapshot)),
		modelText: modelText(input.snapshot),
		turnCount: input.snapshot.progress.turnCount,
		toolCount: input.snapshot.progress.toolCount,
		duration: runDuration(task),
		state: input.snapshot.progress.state,
		status,
		timeline: input.timeline,
		usage: input.usage,
		...optionalEntry("postRunSummary", postRunSummary),
	};
}

function runDuration(task: SubagentFleetTaskSnapshot | undefined): SubagentFleetRunDuration {
	if (task === undefined) return { kind: "unknown" };
	switch (task.state) {
		case "queued":
			return { kind: "unknown" };
		case "running":
			return task.startedAtMs === undefined
				? { kind: "unknown" }
				: { kind: "running", startedAtMs: task.startedAtMs };
		case "done":
			return task.finalElapsedMs === undefined
				? { kind: "unknown" }
				: { kind: "completed", elapsedMs: task.finalElapsedMs };
		default: {
			const exhaustive: never = task.state;
			return exhaustive;
		}
	}
}

function sessionCwdFromSnapshot(
	snapshot: RunnerSubagentJsonEventParserSnapshot,
): string | undefined {
	const cwd = snapshot.sessionHeader?.cwd;
	return typeof cwd === "string" && cwd.length > 0 ? cwd : undefined;
}

export function placeholderDetail(
	entry: FleetNavigatorEntry,
	message: string,
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
		duration: { kind: "unknown" },
		state: task?.state ?? "session",
		status: task?.finalStatus ?? task?.state ?? "session",
		timeline: { entries: [], droppedEntryCount: 0, currentAction: { kind: "idle" } },
		message,
	};
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
}): SubagentFleetPostRunSummary {
	const lastDiagnostic = postRunDiagnostic(input.snapshot, input.status);
	return {
		status: input.status,
		...optionalEntry("lastDiagnostic", lastDiagnostic),
		commit: summarizeHeadChange(input.task.headBaseline, input.task.finalHead),
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
	if (!isSuccessfulRunnerSubagentStatus(status)) return `unavailable; final status ${status}`;
	return undefined;
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
