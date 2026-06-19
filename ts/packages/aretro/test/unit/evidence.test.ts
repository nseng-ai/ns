import { describe, expect, it } from "vitest";

import { collectSessionEvidence } from "../../src/sessions/evidence.ts";
import type { ParsedSession } from "../../src/sessions/types.ts";

describe("collectSessionEvidence", () => {
	it("returns empty array for no sessions", () => {
		const items = collectSessionEvidence([]);
		expect(items).toEqual([]);
	});

	it("collects tool_usage_count evidence", () => {
		const sessions: ParsedSession[] = [
			session({
				tool_calls: [
					{ call_id: "1", tool_name: "read", argument_keys: [], source_ref: null },
					{ call_id: "2", tool_name: "read", argument_keys: [], source_ref: null },
					{ call_id: "3", tool_name: "bash", argument_keys: [], source_ref: null },
				],
			}),
		];

		const items = collectSessionEvidence(sessions);
		const toolUsageItems = items.filter((item) => item.kind === "tool_usage_count");
		expect(toolUsageItems).toHaveLength(2);
		const readItem = toolUsageItems.find((item) => item.subject === "read");
		expect(readItem).toBeDefined();
		if (readItem === undefined) throw new Error("readItem is undefined");
		expect(readItem).toMatchObject({
			kind: "tool_usage_count",
			subject: "read",
			count: 2,
			session_count: 1,
		});
	});

	it("collects failed_tool_result evidence without exposing error messages", () => {
		const sessions: ParsedSession[] = [
			session({
				tool_results: [
					{
						tool_call_id: "1",
						tool_name: "read",
						is_error: true,
						error_message: "PRIVATE_ERROR_TEXT",
						text_length: null,
						line_count: null,
						truncated: null,
						source_ref: null,
					},
				],
			}),
		];

		const items = collectSessionEvidence(sessions);
		const failedItems = items.filter((item) => item.kind === "failed_tool_result");
		expect(failedItems).toHaveLength(1);
		expect(failedItems[0]).toMatchObject({
			kind: "failed_tool_result",
			subject: "read",
			count: 1,
			session_count: 1,
			metadata: { error_message_count: 1 },
		});
		// Verify privacy: error message is not in the item
		expect(JSON.stringify(failedItems[0])).not.toContain("PRIVATE_ERROR_TEXT");
	});

	it("collects repeated_file_read evidence", () => {
		const sessions: ParsedSession[] = [
			session({
				tool_calls: [
					{
						call_id: "1",
						tool_name: "read",
						argument_keys: ["path"],
						source_ref: null,
						path: "src/file.ts",
					},
					{
						call_id: "2",
						tool_name: "read",
						argument_keys: ["path"],
						source_ref: null,
						path: "src/file.ts",
					},
				],
			}),
		];

		const items = collectSessionEvidence(sessions);
		const repeatedReads = items.filter((item) => item.kind === "repeated_file_read");
		expect(repeatedReads).toHaveLength(1);
		expect(repeatedReads[0]).toMatchObject({
			kind: "repeated_file_read",
			subject: "src/file.ts",
			count: 2,
			session_count: 1,
		});
	});

	it("collects repeated_shell_command evidence from command_executions", () => {
		const sessions: ParsedSession[] = [
			session({
				command_executions: [
					{
						command: "just test",
						exit_code: 0,
						cancelled: null,
						truncated: null,
						output_length: null,
						line_count: null,
						source_ref: null,
					},
					{
						command: "just test",
						exit_code: 0,
						cancelled: null,
						truncated: null,
						output_length: null,
						line_count: null,
						source_ref: null,
					},
				],
			}),
		];

		const items = collectSessionEvidence(sessions);
		const repeatedCommands = items.filter((item) => item.kind === "repeated_shell_command");
		expect(repeatedCommands).toHaveLength(1);
		expect(repeatedCommands[0]).toMatchObject({
			kind: "repeated_shell_command",
			subject: "just test",
			count: 2,
			session_count: 1,
		});
	});

	it("collects token_usage_observed evidence with aggregated metrics", () => {
		const sessions: ParsedSession[] = [
			session({
				usage_events: [
					{
						input_tokens: 100,
						output_tokens: 50,
						cache_read_tokens: 10,
						cache_write_tokens: 5,
						total_tokens: 150,
						source_ref: null,
					},
					{
						input_tokens: 200,
						output_tokens: 100,
						cache_read_tokens: null,
						cache_write_tokens: null,
						total_tokens: 300,
						source_ref: null,
					},
				],
			}),
		];

		const items = collectSessionEvidence(sessions);
		const tokenUsage = items.find((item) => item.kind === "token_usage_observed");
		expect(tokenUsage).toBeDefined();
		if (tokenUsage === undefined) throw new Error("tokenUsage is undefined");
		expect(tokenUsage.metadata).toMatchObject({
			usage_event_count: 2,
			input_tokens: 300,
			output_tokens: 150,
			cache_read_tokens: 10,
			cache_write_tokens: 5,
			total_tokens: 450,
		});
	});

	it("collects large_output_observed evidence for tool results", () => {
		const sessions: ParsedSession[] = [
			session({
				tool_results: [
					{
						tool_call_id: "1",
						tool_name: "read",
						is_error: false,
						error_message: null,
						text_length: 25_000,
						line_count: 300,
						truncated: true,
						source_ref: null,
					},
				],
			}),
		];

		const items = collectSessionEvidence(sessions);
		const largeOutputs = items.filter((item) => item.kind === "large_output_observed");
		expect(largeOutputs).toHaveLength(1);
		const largeOutput = largeOutputs[0];
		if (largeOutput === undefined) throw new Error("largeOutput is undefined");
		expect(largeOutput).toMatchObject({
			kind: "large_output_observed",
			subject: "tool_result:read",
			count: 1,
			session_count: 1,
		});
		expect(largeOutput.metadata).toMatchObject({
			truncated_count: 1,
			char_threshold_hits: 1,
			line_threshold_hits: 1,
			max_output_length: 25_000,
			max_line_count: 300,
		});
	});

	it("respects threshold for repeated file reads", () => {
		const sessions: ParsedSession[] = [
			session({
				tool_calls: [
					{
						call_id: "1",
						tool_name: "read",
						argument_keys: ["path"],
						source_ref: null,
						path: "file1.ts",
					},
					{
						call_id: "2",
						tool_name: "read",
						argument_keys: ["path"],
						source_ref: null,
						path: "file2.ts",
					},
					{
						call_id: "3",
						tool_name: "read",
						argument_keys: ["path"],
						source_ref: null,
						path: "file2.ts",
					},
					{
						call_id: "4",
						tool_name: "read",
						argument_keys: ["path"],
						source_ref: null,
						path: "file2.ts",
					},
				],
			}),
		];

		const items = collectSessionEvidence(sessions, { repeatedFileReadThreshold: 3 });
		const repeatedReads = items.filter((item) => item.kind === "repeated_file_read");
		// Only file2.ts should be included (3 reads >= threshold)
		expect(repeatedReads).toHaveLength(1);
		const repeatedRead = repeatedReads[0];
		if (repeatedRead === undefined) throw new Error("repeatedRead is undefined");
		expect(repeatedRead.subject).toBe("file2.ts");
	});
});

function session(
	partial: Partial<ParsedSession> & {
		tool_calls?: ParsedSession["tool_calls"];
		tool_results?: ParsedSession["tool_results"];
		command_executions?: ParsedSession["command_executions"];
		usage_events?: ParsedSession["usage_events"];
	},
): ParsedSession {
	return {
		source_info: {
			harness: "test",
			adapter_name: "test",
			record_format: "test",
		},
		source_ref: {
			path: "/test/session.jsonl",
			uri: null,
			line_number: null,
		},
		session_id: "test-session",
		started_at_iso: null,
		ended_at_iso: null,
		association: {
			repo_root: "/repo",
			cwd: "/repo",
			branch: null,
			confidence: "repo_cwd",
			evidence: [],
		},
		message_counts: {
			user: 0,
			assistant: 0,
			tool_result: 0,
			command_execution: 0,
			system: 0,
			other: 0,
		},
		model_events: [],
		tool_calls: [],
		tool_results: [],
		command_executions: [],
		usage_events: [],
		warnings: [],
		...partial,
	};
}
