import { describe, expect, test } from "vitest";

import { extractRunnerSubagentToolCallPayloadsFromSessionJsonl } from "../src/runner-subagent/session-tool-payloads.ts";
import { jsonLine } from "./runner-subagent-fakes.ts";

const TARGET_TOOL = "submit_thermo_council_review";

describe("runner subagent session tool payload extraction", () => {
	test("extracts matching tool-call arguments from ordinary JSONL", () => {
		const jsonl = [
			jsonLine({ type: "session", id: "session-1" }),
			jsonLine({ type: "toolCall", name: TARGET_TOOL, arguments: { findings: [] } }),
		].join("");

		expect(extractRunnerSubagentToolCallPayloadsFromSessionJsonl(jsonl, TARGET_TOOL)).toEqual([
			{ findings: [] },
		]);
	});

	test("preserves payload order so callers can prefer newest captures", () => {
		const jsonl = [
			jsonLine({ type: "toolCall", name: TARGET_TOOL, arguments: { id: "old" } }),
			jsonLine({ type: "toolCall", name: TARGET_TOOL, arguments: { id: "new" } }),
		].join("");

		expect(extractRunnerSubagentToolCallPayloadsFromSessionJsonl(jsonl, TARGET_TOOL)).toEqual([
			{ id: "old" },
			{ id: "new" },
		]);
	});

	test("ignores malformed partial lines while preserving later valid payloads", () => {
		const jsonl = [
			'{"type":"toolCall",',
			jsonLine({ type: "toolCall", name: TARGET_TOOL, arguments: { ok: true } }),
		].join("\n");

		expect(extractRunnerSubagentToolCallPayloadsFromSessionJsonl(jsonl, TARGET_TOOL)).toEqual([
			{ ok: true },
		]);
	});

	test("ignores unrelated tools and non-tool false positives", () => {
		const jsonl = [
			jsonLine({ type: "toolCall", name: "other_tool", arguments: { wrong: true } }),
			jsonLine({ type: "message", name: TARGET_TOOL, arguments: { notAToolCall: true } }),
			jsonLine({ type: "toolCall", name: TARGET_TOOL }),
		].join("");

		expect(extractRunnerSubagentToolCallPayloadsFromSessionJsonl(jsonl, TARGET_TOOL)).toEqual([]);
	});

	test("recursively extracts matching payloads from nested arrays and objects", () => {
		const jsonl = jsonLine({
			type: "message",
			content: [
				{
					block: {
						type: "toolCall",
						name: TARGET_TOOL,
						arguments: { nested: "object" },
					},
				},
				[
					{
						type: "toolCall",
						name: TARGET_TOOL,
						arguments: { nested: "array" },
					},
				],
			],
		});

		expect(extractRunnerSubagentToolCallPayloadsFromSessionJsonl(jsonl, TARGET_TOOL)).toEqual([
			{ nested: "object" },
			{ nested: "array" },
		]);
	});
});
