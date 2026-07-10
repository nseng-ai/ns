import { commandSucceeded } from "@nseng-ai/foundation/exec";
import { parseMachineEnvelopeData } from "@nseng-ai/foundation/machine-envelope";
import {
	parseObjectiveListData,
	type ObjectiveList,
	type ObjectiveListParseResult,
	type ObjectiveListRecord,
} from "@nseng-ai/objectives/api";

import { formatInlineCommandFailure } from "./command-runner.ts";
import { keyNameFromInput } from "./tabs/key-input.ts";
import { wrapIndex } from "./tabs/list-navigation.ts";
import type { TabIntent, TabKeyInput, TabModule, TabModuleDeps } from "./tabs/tab-module.ts";

const COMMAND_TIMEOUT_MS = 10_000;

export interface ObjectiveTabAction {
	readonly type: "move-selection";
	readonly delta: number;
}

export interface ObjectiveTabState {
	readonly selectedSlug: string | undefined;
}

export type ObjectiveTabModule = TabModule<
	ObjectiveList,
	ObjectiveTabState,
	ObjectiveTabAction,
	never
>;

export const objectiveTabModule: ObjectiveTabModule = {
	id: "objectives",
	label: "objectives",
	loadModel,
	createInitialState,
	reduce,
	render,
	interpretKey,
};

async function loadModel(deps: TabModuleDeps): Promise<ObjectiveList> {
	const args = ["objective", "list", "--format", "json"];
	const result = await deps.runCommand("ns", args, {
		cwd: deps.cwd,
		timeout: COMMAND_TIMEOUT_MS,
	});
	if (!commandSucceeded(result)) {
		throw new Error(formatInlineCommandFailure("ns objective list", result));
	}
	const parsed = parseObjectiveListStdout(result.stdout);
	if (parsed.type === "invalid") throw new Error(parsed.message);
	return parsed.list;
}

function parseObjectiveListStdout(stdout: string): ObjectiveListParseResult {
	const envelope = parseMachineEnvelopeData(stdout, { label: "objective list JSON" });
	if (envelope.type !== "valid") {
		return { type: "invalid", message: envelope.message };
	}
	return parseObjectiveListData(envelope.data);
}

function createInitialState(model: ObjectiveList): ObjectiveTabState {
	return { selectedSlug: model.records[0]?.slug };
}

function reduce(
	model: ObjectiveList,
	state: ObjectiveTabState,
	action: ObjectiveTabAction,
): ObjectiveTabState {
	const records = model.records;
	if (records.length === 0) return state;

	const currentIndex = records.findIndex((record) => record.slug === state.selectedSlug);
	const safeIndex = currentIndex === -1 ? 0 : currentIndex;
	const nextIndex = wrapIndex(safeIndex + action.delta, records.length);
	const nextRecord = records[nextIndex];
	if (nextRecord === undefined || nextRecord.slug === state.selectedSlug) return state;
	return { selectedSlug: nextRecord.slug };
}

function interpretKey(
	_state: ObjectiveTabState,
	key: TabKeyInput,
): TabIntent<ObjectiveTabAction, never> {
	switch (keyNameFromInput(key)) {
		case "up":
		case "k":
			return { type: "action", action: { type: "move-selection", delta: -1 } };
		case "down":
		case "j":
			return { type: "action", action: { type: "move-selection", delta: 1 } };
		case "q":
		case "escape":
			return { type: "quit" };
		default:
			return { type: "none" };
	}
}

function render(model: ObjectiveList, state: ObjectiveTabState): readonly string[] {
	const records = model.records;
	const lines: string[] = [`Objectives (status=${model.statusFilter})`, ""];

	if (records.length === 0) {
		lines.push("No Objective records in this checkout.");
		lines.push("");
		lines.push(renderFooter());
		return lines;
	}

	const widths = columnWidths(records);
	lines.push(`${"".padEnd(2)}${header(widths)}`);
	lines.push(`${"".padEnd(2)}${rule(widths)}`);
	for (const record of records) {
		const isSelected = record.slug === state.selectedSlug;
		lines.push(`${isSelected ? "› " : "  "}${row(record, widths)}`);
	}

	lines.push("");
	lines.push(renderSelectedDetail(records, state.selectedSlug));
	lines.push("");
	lines.push(renderFooter());
	return lines;
}

interface ObjectiveTableWidths {
	readonly slug: number;
	readonly status: number;
}

function columnWidths(records: readonly ObjectiveListRecord[]): ObjectiveTableWidths {
	return {
		slug: Math.max("SLUG".length, ...records.map((record) => record.slug.length)),
		status: Math.max("STATUS".length, ...records.map((record) => record.status.length)),
	};
}

function header(widths: ObjectiveTableWidths): string {
	return cells({ slug: "SLUG", status: "STATUS", latest: "LATEST UPDATE", widths });
}

function rule(widths: ObjectiveTableWidths): string {
	return [
		"─".repeat(widths.slug),
		"─".repeat(widths.status),
		"─".repeat("LATEST UPDATE".length),
	].join("─┼─");
}

function row(record: ObjectiveListRecord, widths: ObjectiveTableWidths): string {
	return cells({
		slug: record.slug,
		status: record.status,
		latest: formatLatestUpdate(record.latestUpdateIso),
		widths,
	});
}

function cells(options: {
	readonly slug: string;
	readonly status: string;
	readonly latest: string;
	readonly widths: ObjectiveTableWidths;
}): string {
	return `${options.slug.padEnd(options.widths.slug)} │ ${options.status.padEnd(options.widths.status)} │ ${options.latest}`;
}

function renderSelectedDetail(
	records: readonly ObjectiveListRecord[],
	selectedSlug: string | undefined,
): string {
	const selected = records.find((record) => record.slug === selectedSlug);
	if (selected === undefined) return "Selected: <none>";
	return `Selected: ${selected.slug} — status=${selected.status}; latest update=${formatLatestUpdate(selected.latestUpdateIso)}`;
}

function formatLatestUpdate(latestUpdateIso: string | null): string {
	return latestUpdateIso ?? "—";
}

function renderFooter(): string {
	return "↑/k ↓/j select   Tab switch   q quit";
}
