import { describe, expect, it } from "vitest";

import {
	summarizeSession,
	aggregateMetricsFromSummaries,
} from "../../src/operations/collect-evidence.ts";
import type { ParsedSession } from "../../src/sessions/types.ts";
import type { SessionWarningDto } from "../../src/contracts.ts";

describe("summarizeSession", () => {
	it("converts session to summary DTO with counts only", () => {
		const session: ParsedSession = {
			source_info: {
				harness: "pi",
				adapter_name: "pi_jsonl",
				record_format: "jsonl",
			},
			source_ref: {
				path: "/tmp/sessions/s1.jsonl",
				uri: null,
				line_number: null,
			},
			session_id: "s1",
			started_at_iso: "2026-01-01T00:00:00Z",
			ended_at_iso: "2026-01-01T00:01:00Z",
			association: {
				repo_root: "/repo",
				cwd: "/repo",
				branch: null,
				confidence: "repo_cwd",
				evidence: ["query.repo_root", "session_header.cwd"],
			},
			message_counts: {
				user: 1,
				assistant: 2,
				tool_result: 3,
				command_execution: 4,
				system: 5,
				other: 6,
			},
			model_events: [{ provider: "anthropic", model: "sonnet" }],
			tool_calls: [
				{
					call_id: "c1",
					tool_name: "read",
					argument_keys: ["path"],
					source_ref: null,
					command: "raw prompt command",
					path: "secret.txt",
				},
			],
			tool_results: [
				{
					tool_call_id: "c1",
					tool_name: "read",
					is_error: true,
					error_message: "raw tool-output",
					text_length: 99,
					line_count: 7,
					truncated: false,
					source_ref: null,
				},
			],
			command_executions: [
				{
					command: "echo classified",
					exit_code: 0,
					cancelled: false,
					truncated: false,
					output_length: 15,
					line_count: 1,
					source_ref: null,
				},
			],
			usage_events: [
				{
					input_tokens: 10,
					output_tokens: 5,
					cache_read_tokens: null,
					cache_write_tokens: null,
					total_tokens: 15,
					source_ref: null,
				},
			],
			warnings: [
				{
					code: "note",
					message: "non-fatal",
					source_ref: null,
					harness: null,
					adapter_name: null,
				},
			],
		};

		const summary = summarizeSession(session);

		expect(summary.source_ref.path).toBe("/tmp/sessions/s1.jsonl");
		expect(summary.association.repo_root).toBe("/repo");
		expect(summary.association.cwd).toBe("/repo");
		expect(summary.message_counts.user).toBe(1);
		expect(summary.message_counts.assistant).toBe(2);
		expect(summary.model_event_count).toBe(1);
		expect(summary.tool_call_count).toBe(1);
		expect(summary.tool_result_count).toBe(1);
		expect(summary.command_execution_count).toBe(1);
		expect(summary.usage_event_count).toBe(1);
		expect(summary.warning_count).toBe(1);

		// Verify privacy: raw data should not be in summary
		const summaryJson = JSON.stringify(summary);
		expect(summaryJson).not.toContain("raw prompt command");
		expect(summaryJson).not.toContain("raw tool-output");
		expect(summaryJson).not.toContain("echo classified");
		expect(summaryJson).not.toContain("secret.txt");
	});
});

describe("aggregateMetricsFromSummaries", () => {
	it("aggregates metrics from multiple summaries", () => {
		const first = summary({
			session_id: "s1",
			message_counts: {
				user: 1,
				assistant: 2,
				tool_result: 3,
				command_execution: 4,
				system: 5,
				other: 6,
			},
			tool_call_count: 7,
			tool_result_count: 8,
			command_execution_count: 9,
			usage_event_count: 10,
			warning_count: 11,
		});
		const second = summary({
			session_id: "s2",
			message_counts: {
				user: 10,
				assistant: 20,
				tool_result: 30,
				command_execution: 40,
				system: 50,
				other: 60,
			},
			tool_call_count: 70,
			tool_result_count: 80,
			command_execution_count: 90,
			usage_event_count: 100,
			warning_count: 110,
		});
		const warnings: SessionWarningDto[] = [warning("w1"), warning("w2"), warning("w3")];

		const metrics = aggregateMetricsFromSummaries([first, second], warnings);

		expect(metrics.session_count).toBe(2);
		expect(metrics.message_counts).toMatchObject({
			user: 11,
			assistant: 22,
			tool_result: 33,
			command_execution: 44,
			system: 55,
			other: 66,
		});
		expect(metrics.tool_call_count).toBe(77);
		expect(metrics.tool_result_count).toBe(88);
		expect(metrics.command_execution_count).toBe(99);
		expect(metrics.usage_event_count).toBe(110);
		expect(metrics.warning_count).toBe(3);
	});
});

function summary(partial: {
	session_id: string;
	message_counts: {
		user: number;
		assistant: number;
		tool_result: number;
		command_execution: number;
		system: number;
		other: number;
	};
	tool_call_count: number;
	tool_result_count: number;
	command_execution_count: number;
	usage_event_count: number;
	warning_count: number;
}) {
	return {
		session_id: partial.session_id,
		started_at_iso: null,
		ended_at_iso: null,
		source_ref: {
			path: `/tmp/${partial.session_id}.jsonl`,
			uri: null,
			line_number: null,
		},
		association: {
			repo_root: "/repo",
			cwd: "/repo",
			branch: null,
			confidence: "repo_cwd",
			evidence: ["query.repo_root"],
		},
		message_counts: partial.message_counts,
		model_event_count: 0,
		tool_call_count: partial.tool_call_count,
		tool_result_count: partial.tool_result_count,
		command_execution_count: partial.command_execution_count,
		usage_event_count: partial.usage_event_count,
		warning_count: partial.warning_count,
	};
}

function warning(code: string): SessionWarningDto {
	return {
		code,
		message: "non-fatal",
		source_ref: null,
		harness: "fake",
		adapter_name: "fake",
	};
}
