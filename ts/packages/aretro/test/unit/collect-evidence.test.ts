import { describe, expect, it } from "vitest";

import {
	summarizeSession,
	aggregateMetricsFromSummaries,
} from "../../src/operations/collect-evidence.ts";
import type { ParsedSession } from "../../src/sessions/types.ts";
import type { SessionSummaryDto, SessionWarningDto } from "../../src/contracts.ts";

describe("summarizeSession", () => {
	it("converts session to summary DTO with counts only", () => {
		const session: ParsedSession = {
			source_info: {
				harness: "pi",
				adapter_name: "pi-jsonl",
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
				confidence: "repo-cwd",
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

		expect(summary.sourceRef.path).toBe("/tmp/sessions/s1.jsonl");
		expect(summary.association.repoRoot).toBe("/repo");
		expect(summary.association.cwd).toBe("/repo");
		expect(summary.messageCounts.user).toBe(1);
		expect(summary.messageCounts.assistant).toBe(2);
		expect(summary.modelEventCount).toBe(1);
		expect(summary.toolCallCount).toBe(1);
		expect(summary.toolResultCount).toBe(1);
		expect(summary.commandExecutionCount).toBe(1);
		expect(summary.usageEventCount).toBe(1);
		expect(summary.warningCount).toBe(1);

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
			sessionId: "s1",
			messageCounts: {
				user: 1,
				assistant: 2,
				toolResult: 3,
				commandExecution: 4,
				system: 5,
				other: 6,
			},
			toolCallCount: 7,
			toolResultCount: 8,
			commandExecutionCount: 9,
			usageEventCount: 10,
			warningCount: 11,
		});
		const second = summary({
			sessionId: "s2",
			messageCounts: {
				user: 10,
				assistant: 20,
				toolResult: 30,
				commandExecution: 40,
				system: 50,
				other: 60,
			},
			toolCallCount: 70,
			toolResultCount: 80,
			commandExecutionCount: 90,
			usageEventCount: 100,
			warningCount: 110,
		});
		const warnings: SessionWarningDto[] = [warning("w1"), warning("w2"), warning("w3")];

		const metrics = aggregateMetricsFromSummaries([first, second], warnings);

		expect(metrics.sessionCount).toBe(2);
		expect(metrics.messageCounts).toMatchObject({
			user: 11,
			assistant: 22,
			toolResult: 33,
			commandExecution: 44,
			system: 55,
			other: 66,
		});
		expect(metrics.toolCallCount).toBe(77);
		expect(metrics.toolResultCount).toBe(88);
		expect(metrics.commandExecutionCount).toBe(99);
		expect(metrics.usageEventCount).toBe(110);
		expect(metrics.warningCount).toBe(3);
	});
});

function summary(partial: {
	sessionId: string;
	messageCounts: {
		user: number;
		assistant: number;
		toolResult: number;
		commandExecution: number;
		system: number;
		other: number;
	};
	toolCallCount: number;
	toolResultCount: number;
	commandExecutionCount: number;
	usageEventCount: number;
	warningCount: number;
}): SessionSummaryDto {
	return {
		sessionId: partial.sessionId,
		startedAtIso: null,
		endedAtIso: null,
		sourceRef: {
			path: `/tmp/${partial.sessionId}.jsonl`,
			uri: null,
			lineNumber: null,
		},
		association: {
			repoRoot: "/repo",
			cwd: "/repo",
			branch: null,
			confidence: "repo-cwd",
			evidence: ["query.repo_root"],
		},
		messageCounts: partial.messageCounts,
		modelEventCount: 0,
		toolCallCount: partial.toolCallCount,
		toolResultCount: partial.toolResultCount,
		commandExecutionCount: partial.commandExecutionCount,
		usageEventCount: partial.usageEventCount,
		warningCount: partial.warningCount,
	};
}

function warning(code: string): SessionWarningDto {
	return {
		code,
		message: "non-fatal",
		sourceRef: null,
		harness: "fake",
		adapterName: "fake",
	};
}
