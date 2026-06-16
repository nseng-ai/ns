import { parseObjectiveList, type ObjectiveList, type ObjectiveListRecord } from "@asdl/pi-extension-runtime/objective-list";

import type { TabIntent, TabKeyInput, TabModule, TabModuleDeps } from "./tabs/tab-module.ts";

const COMMAND_TIMEOUT_MS = 10_000;

export type ObjectiveTabAction = { readonly type: "move-selection"; readonly delta: number };

export interface ObjectiveTabState {
	readonly selectedSlug: string | undefined;
}

export type ObjectiveTabModule = TabModule<ObjectiveList, ObjectiveTabState, ObjectiveTabAction, never>;

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
	const result = await deps.runCommand("objective", ["list", "--minimal", "--format", "json"], { cwd: deps.cwd, timeoutMs: COMMAND_TIMEOUT_MS });
	if (result.code !== 0) {
		throw new Error(`objective list failed with exit code ${result.code}. ${result.stderr.trim() || result.stdout.trim() || "(no output)"}`);
	}
	const parsed = parseObjectiveList(result.stdout);
	if (parsed.type === "invalid") throw new Error(parsed.message);
	return parsed.list;
}

function createInitialState(model: ObjectiveList): ObjectiveTabState {
	return { selectedSlug: model.records[0]?.slug };
}

function reduce(model: ObjectiveList, state: ObjectiveTabState, action: ObjectiveTabAction): ObjectiveTabState {
	const records = model.records;
	if (records.length === 0) return state;

	const currentIndex = records.findIndex((record) => record.slug === state.selectedSlug);
	const safeIndex = currentIndex === -1 ? 0 : currentIndex;
	const nextIndex = wrapIndex(safeIndex + action.delta, records.length);
	const nextRecord = records[nextIndex];
	if (nextRecord === undefined || nextRecord.slug === state.selectedSlug) return state;
	return { selectedSlug: nextRecord.slug };
}

function interpretKey(_state: ObjectiveTabState, key: TabKeyInput): TabIntent<ObjectiveTabAction, never> {
	if (key.ctrl || key.meta) return { type: "none" };
	switch (key.name) {
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
	return ["─".repeat(widths.slug), "─".repeat(widths.status), "─".repeat("LATEST UPDATE".length)].join("─┼─");
}

function row(record: ObjectiveListRecord, widths: ObjectiveTableWidths): string {
	return cells({ slug: record.slug, status: record.status, latest: formatLatestUpdate(record.latestUpdateIso), widths });
}

function cells(options: { readonly slug: string; readonly status: string; readonly latest: string; readonly widths: ObjectiveTableWidths }): string {
	return `${options.slug.padEnd(options.widths.slug)} │ ${options.status.padEnd(options.widths.status)} │ ${options.latest}`;
}

function renderSelectedDetail(records: readonly ObjectiveListRecord[], selectedSlug: string | undefined): string {
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

function wrapIndex(index: number, length: number): number {
	return ((index % length) + length) % length;
}
