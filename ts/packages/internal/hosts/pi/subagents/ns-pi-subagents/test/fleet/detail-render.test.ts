import { describe, expect, test } from "vitest";

import { placeholderDetail } from "../../src/fleet/detail.ts";
import type {
	FleetNavigatorEntry,
	SubagentFleetTaskDetail,
	TaskFleetNavigatorEntry,
} from "../../src/fleet/detail.ts";
import {
	renderFleetDetailHeaderLines,
	renderFleetDetailMetadataLines,
	renderFleetEntrySummaryLines,
} from "../../src/fleet/detail-render.ts";

const NOW_MS = Date.parse("2026-07-11T09:12:31.000Z");

function taskEntry(overrides: Partial<TaskFleetNavigatorEntry["task"]> = {}): FleetNavigatorEntry {
	return {
		kind: "task",
		task: {
			id: "task-1",
			runId: "run-1",
			index: 0,
			title: "Scout one",
			state: "running",
			sessionFile: "/tmp/one.jsonl",
			...overrides,
		},
	};
}

function loadedDetail(overrides: Partial<SubagentFleetTaskDetail> = {}): SubagentFleetTaskDetail {
	return {
		title: "Scout one",
		sessionFile: "/tmp/one.jsonl",
		modelText: "openai-codex/gpt-5.4",
		turnCount: 2,
		toolCount: 3,
		duration: { kind: "completed", elapsedMs: 65_000 },
		state: "stopped",
		status: "running",
		timeline: { entries: [], droppedEntryCount: 0, currentAction: { kind: "idle" } },
		...overrides,
	};
}

describe("renderFleetEntrySummaryLines", () => {
	test("loading summary has status and session lines with no title and no blank line", () => {
		const lines = renderFleetEntrySummaryLines({
			entry: taskEntry(),
			detail: undefined,
			nowMs: NOW_MS,
		});
		expect(lines).toEqual(["loading session…", "session: /tmp/one.jsonl"]);
		expect(lines).not.toContain("Scout one");
		expect(lines).not.toContain("");
	});

	test("loading summary falls back to a dash when the entry has no session file", () => {
		const entry: FleetNavigatorEntry = {
			kind: "task",
			task: { id: "task-2", runId: "run-1", index: 1, title: "No session", state: "queued" },
		};
		expect(renderFleetEntrySummaryLines({ entry, detail: undefined, nowMs: NOW_MS })).toEqual([
			"loading session…",
			"session: —",
		]);
	});

	test("placeholder failure summary ends with the placeholder message", () => {
		const entry = taskEntry();
		const detail = placeholderDetail(entry, "Could not load detail: boom");
		const lines = renderFleetEntrySummaryLines({ entry, detail, nowMs: NOW_MS });
		expect(lines.at(-1)).toBe("Could not load detail: boom");
		expect(lines).toContain("session: /tmp/one.jsonl");
		expect(lines).not.toContain("Scout one");
		expect(lines.join("\n")).not.toContain("latest:");
	});

	test("empty loaded timeline omits the latest line rather than adding filler", () => {
		const lines = renderFleetEntrySummaryLines({
			entry: taskEntry(),
			detail: loadedDetail(),
			nowMs: NOW_MS,
		});
		expect(lines).toEqual([
			"stopped · running · openai-codex/gpt-5.4 · 2 turns / 3 tools · 1m 05s",
			"tokens: unavailable",
			"session: /tmp/one.jsonl",
		]);
	});

	test("loaded summary appends the latest timeline entry", () => {
		const lines = renderFleetEntrySummaryLines({
			entry: taskEntry(),
			detail: loadedDetail({
				timeline: {
					entries: [
						{ kind: "assistant", text: "First message" },
						{ kind: "assistant", text: "Found details" },
					],
					droppedEntryCount: 0,
					currentAction: { kind: "idle" },
				},
			}),
			nowMs: NOW_MS,
		});
		expect(lines.at(-1)).toBe("latest: ● assistant: Found details");
		expect(lines.join("\n")).not.toContain("First message");
	});

	test("post-run summary contributes the status/commit slot line", () => {
		const lines = renderFleetEntrySummaryLines({
			entry: taskEntry({ state: "done", finalStatus: "final-text" }),
			detail: loadedDetail({
				status: "final-text",
				postRunSummary: {
					status: "final-text",
					commit: { status: "changed", from: "abcdef123456", to: "fedcba654321" },
				},
			}),
			nowMs: NOW_MS,
		});
		expect(lines).toContain("final-text · commit: HEAD changed abcdef1 → fedcba6");
	});

	test("live activity contributes the current-action slot without a quiet-time claim", () => {
		const lines = renderFleetEntrySummaryLines({
			entry: taskEntry(),
			detail: loadedDetail({
				liveActivity: {
					currentAction: { kind: "tool", toolName: "bash", inputPreview: "just test" },
				},
			}),
			nowMs: NOW_MS,
		});
		expect(lines).toContain("▶ bash · just test");
		expect(lines.join("\n")).not.toContain("quiet");
	});
});

describe("renderFleetDetailHeaderLines", () => {
	test("loading header begins with the title and keeps its spacer line", () => {
		expect(
			renderFleetDetailHeaderLines({ entry: taskEntry(), detail: undefined, nowMs: NOW_MS }),
		).toEqual(["Scout one", "loading session…", "", "session: /tmp/one.jsonl"]);
	});

	test("loaded header is the title followed by the semantic metadata lines", () => {
		const detail = loadedDetail({
			postRunSummary: {
				status: "final-text",
				commit: { status: "unchanged", head: "abcdef123456" },
			},
		});
		expect(renderFleetDetailHeaderLines({ entry: taskEntry(), detail, nowMs: NOW_MS })).toEqual([
			"Scout one",
			...renderFleetDetailMetadataLines({ detail, nowMs: NOW_MS }),
		]);
	});

	test("loaded header retains its intended line ordering", () => {
		expect(
			renderFleetDetailHeaderLines({ entry: taskEntry(), detail: loadedDetail(), nowMs: NOW_MS }),
		).toEqual([
			"Scout one",
			"stopped · running · openai-codex/gpt-5.4 · 2 turns / 3 tools · 1m 05s",
			"tokens: unavailable",
			"session: /tmp/one.jsonl",
		]);
	});

	test("missing entry renders the no-selection line", () => {
		expect(
			renderFleetDetailHeaderLines({ entry: undefined, detail: undefined, nowMs: NOW_MS }),
		).toEqual(["No selected subagent task."]);
	});
});
