import { describe, expect, it } from "vitest";

import type { CompactResult } from "../../../src/payloads/evidence-payload.ts";
import {
	buildEvidencePayloadData,
	commandSubjectForPayload,
} from "../../../src/payloads/evidence-payload.ts";
import type { MessageCountsDto, SessionSourceRefDto } from "../../../src/contracts.ts";
import type {
	ParsedSession,
	SessionMessageCounts,
	SessionSourceRef,
} from "../../../src/sessions/types.ts";

describe("commandSubjectForPayload", () => {
	it("returns full command if under threshold", () => {
		const command = "just test";
		const result = commandSubjectForPayload(command);
		expect(result.subject).toBe(command);
		expect(result.metadata).toEqual({});
	});

	it("bounds long commands with hash metadata", () => {
		const command = "echo " + "secret-token ".repeat(80);
		const result = commandSubjectForPayload(command);

		expect(command).not.toContain(result.subject);
		expect(result.subject).toContain("echo secret");
		expect(result.subject).toContain("…[sha256:");
		expect(result.subject).toContain("]");
		expect(result.metadata.truncated).toBe(true);
		expect(result.metadata.originalLength).toBe(command.length);
		expect(typeof result.metadata.sha256Prefix).toBe("string");

		const jsonStr = JSON.stringify({ subject: result.subject, metadata: result.metadata });
		expect(jsonStr).not.toContain(command);
	});
});

describe("buildEvidencePayloadData", () => {
	it("includes sanitized event arrays", () => {
		const session = detailSession({ sourceInfo: sourceInfo() });
		const compactResult = compactResult_(session);

		const payloadData = buildEvidencePayloadData({
			compactResult,
			sessions: [session],
		});

		const detail = payloadData.sessions[0];
		if (!detail) throw new Error("detail is undefined");
		expect(payloadData.schemaVersion).toBe(1);
		expect(detail.sessionIndex).toBe(0);
		expect(detail.sessionId).toBe("s1");
		if (typeof detail.summary !== "object" || detail.summary === null) {
			throw new Error("summary should be object");
		}
		expect(detail.summary.sessionId).toBe("s1");
		if (!detail.modelEvents[0]) throw new Error("modelEvents[0] is undefined");
		expect(detail.modelEvents[0].provider).toBe("anthropic");
		if (!detail.toolCalls[0]) throw new Error("toolCalls[0] is undefined");
		expect(detail.toolCalls[0].toolName).toBe("read");
		expect(detail.toolCalls[0].path).toBe("packages/foo.py");
		if (!detail.toolResults[0]) throw new Error("toolResults[0] is undefined");
		expect(detail.toolResults[0].isError).toBe(true);
		expect(detail.toolResults[0].isTruncated).toBe(false);
		if (!detail.commandExecutions[0]) throw new Error("commandExecutions[0] is undefined");
		expect(detail.commandExecutions[0].commandSubject).toBe("just test");
		expect(detail.commandExecutions[0].isCancelled).toBe(false);
		expect(detail.commandExecutions[0].isTruncated).toBe(false);
		if (!detail.usageEvents[0]) throw new Error("usageEvents[0] is undefined");
		expect(detail.usageEvents[0].total_tokens).toBe(15);
		if (!detail.warnings[0]) throw new Error("warnings[0] is undefined");
		expect(detail.warnings[0].code).toBe("note");
	});

	it("omits raw error messages", () => {
		const session = detailSession({
			sourceInfo: sourceInfo(),
			errorMessage: "SECRET_RAW_ERROR_TEXT",
		});
		const compactResult = compactResult_(session);

		const payloadData = buildEvidencePayloadData({
			compactResult,
			sessions: [session],
		});

		const serialized = JSON.stringify(payloadData);
		expect(serialized).not.toContain("SECRET_RAW_ERROR_TEXT");
		const session0 = payloadData.sessions[0];
		if (!session0) throw new Error("session is undefined");
		const toolResult = session0.toolResults[0];
		if (!toolResult) throw new Error("toolResult is undefined");
		expect(toolResult.hasErrorMessage).toBe(true);
	});

	it("includes supporting event pointers from source refs", () => {
		const session = detailSession({ sourceInfo: sourceInfo() });
		const compactResult = compactResult_(session);

		const payloadData = buildEvidencePayloadData({
			compactResult,
			sessions: [session],
		});

		const failedToolItems = payloadData.evidenceItems.filter((item) => {
			const i = item.item as Record<string, unknown>;
			return i.kind === "failed-tool-result";
		});
		expect(failedToolItems.length).toBe(1);
		const firstItem = failedToolItems[0];
		if (!firstItem) throw new Error("firstItem is undefined");
		expect(firstItem.supportingEventPointers).toEqual(["/data/sessions/0/toolResults/0"]);
	});

	it("allows empty supporting event pointers when no source ref match", () => {
		const session = detailSession({
			sourceInfo: sourceInfo(),
			includeEventSourceRefs: false,
		});
		const compactResult = compactResult_(session);

		const payloadData = buildEvidencePayloadData({
			compactResult,
			sessions: [session],
		});

		expect(
			payloadData.evidenceItems.every((item) => item.supportingEventPointers.length === 0),
		).toBe(true);
	});
});

function messageCountsToDto(counts: SessionMessageCounts): MessageCountsDto {
	return {
		user: counts.user,
		assistant: counts.assistant,
		toolResult: counts.tool_result,
		commandExecution: counts.command_execution,
		system: counts.system,
		other: counts.other,
	};
}

function sourceRefToDto(ref: SessionSourceRef): SessionSourceRefDto {
	return { path: ref.path, uri: ref.uri, lineNumber: ref.line_number };
}

function compactResult_(session: ParsedSession): CompactResult {
	// Mock compact result using test data
	return {
		repo: {
			repoRoot: "/repo",
			cwd: "/repo",
			branch: "feature/retro",
			branchSource: "explicit",
		},
		query: {
			repoRoot: "/repo",
			sessionRoot: null,
			maxSessions: 20,
		},
		source: {
			harness: session.source_info.harness,
			adapterName: session.source_info.adapter_name,
			recordFormat: session.source_info.record_format,
		},
		aggregateMetrics: {
			sessionCount: 1,
			messageCounts: messageCountsToDto(session.message_counts),
			toolCallCount: session.tool_calls.length,
			toolResultCount: session.tool_results.length,
			commandExecutionCount: session.command_executions.length,
			usageEventCount: session.usage_events.length,
			warningCount: session.warnings.length,
		},
		sessions: [
			{
				sessionId: session.session_id,
				startedAtIso: session.started_at_iso,
				endedAtIso: session.ended_at_iso,
				sourceRef: sourceRefToDto(session.source_ref),
				association: {
					repoRoot: session.association.repo_root,
					cwd: session.association.cwd,
					branch: session.association.branch,
					confidence: session.association.confidence,
					evidence: [...session.association.evidence],
				},
				messageCounts: messageCountsToDto(session.message_counts),
				modelEventCount: session.model_events.length,
				toolCallCount: session.tool_calls.length,
				toolResultCount: session.tool_results.length,
				commandExecutionCount: session.command_executions.length,
				usageEventCount: session.usage_events.length,
				warningCount: session.warnings.length,
			},
		],
		warnings: session.warnings.map((w) => ({
			code: w.code,
			message: w.message,
			sourceRef: w.source_ref === null ? null : sourceRefToDto(w.source_ref),
			harness: w.harness,
			adapterName: w.adapter_name,
		})),
		evidenceItems: [
			{
				kind: "failed-tool-result",
				subject: "read",
				summary: "read failed 1 time across 1 session",
				count: 1,
				sessionCount: 1,
				sourceRefs: [
					session.tool_results[0]
						? sourceRefToDto(
								session.tool_results[0].source_ref ?? {
									path: null,
									uri: null,
									line_number: null,
								},
							)
						: { path: null, uri: null, lineNumber: null },
				],
				metadata: {},
			},
		],
	};
}

function sourceInfo() {
	return {
		harness: "fake",
		adapter_name: "fake",
		record_format: "memory",
	};
}

function detailSession(options: {
	sourceInfo: { harness: string; adapter_name: string; record_format: string };
	errorMessage?: string;
	includeEventSourceRefs?: boolean;
}): ParsedSession {
	const sourcePath = "/tmp/sessions/s1.jsonl";
	const includeRefs = options.includeEventSourceRefs ?? true;
	const modelRef = sourceRef_(sourcePath, 1, includeRefs);
	const toolCallRef = sourceRef_(sourcePath, 2, includeRefs);
	const toolResultRef = sourceRef_(sourcePath, 3, includeRefs);
	const commandRef = sourceRef_(sourcePath, 4, includeRefs);
	const usageRef = sourceRef_(sourcePath, 5, includeRefs);
	const warningRef = sourceRef_(sourcePath, 6, includeRefs);
	return {
		source_info: options.sourceInfo,
		source_ref: { path: sourcePath, uri: null, line_number: null },
		session_id: "s1",
		started_at_iso: "2026-01-01T00:00:00Z",
		ended_at_iso: "2026-01-01T00:01:00Z",
		association: {
			repo_root: "/repo",
			cwd: "/repo",
			branch: null,
			confidence: "repo-cwd",
			evidence: ["query.repo_root"],
		},
		message_counts: {
			user: 1,
			assistant: 1,
			tool_result: 1,
			command_execution: 0,
			system: 0,
			other: 0,
		},
		model_events: [
			{
				provider: "anthropic",
				model: "sonnet",
				source_ref: modelRef,
			},
		],
		tool_calls: [
			{
				call_id: "read-1",
				tool_name: "read",
				argument_keys: ["path"],
				source_ref: toolCallRef,
				path: "packages/foo.py",
			},
		],
		tool_results: [
			{
				tool_call_id: "read-1",
				tool_name: "read",
				is_error: true,
				error_message: options.errorMessage ?? "error details",
				text_length: 42,
				line_count: 2,
				truncated: false,
				source_ref: toolResultRef,
			},
		],
		command_executions: [
			{
				command: "just test",
				exit_code: 0,
				cancelled: false,
				truncated: false,
				output_length: 500,
				line_count: 10,
				source_ref: commandRef,
			},
		],
		usage_events: [
			{
				input_tokens: 10,
				output_tokens: 5,
				cache_read_tokens: null,
				cache_write_tokens: null,
				total_tokens: 15,
				source_ref: usageRef,
			},
		],
		warnings: [
			{
				code: "note",
				message: "non-fatal",
				source_ref: warningRef,
				harness: null,
				adapter_name: null,
			},
		],
	};
}

function sourceRef_(sourcePath: string, lineNumber: number, includeEventSourceRefs: boolean) {
	if (includeEventSourceRefs) {
		return { path: sourcePath, uri: null, line_number: lineNumber };
	}
	return null;
}
