import { describe, expect, it } from "vitest";

import type { CompactResult } from "../../../src/payloads/evidence-payload.ts";
import {
	buildEvidencePayloadData,
	commandSubjectForPayload,
} from "../../../src/payloads/evidence-payload.ts";
import type { ParsedSession } from "../../../src/sessions/types.ts";

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
		expect(result.metadata.original_length).toBe(command.length);
		expect(typeof result.metadata.sha256_prefix).toBe("string");

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
		expect(payloadData.schema_version).toBe(1);
		expect(detail.session_index).toBe(0);
		expect(detail.session_id).toBe("s1");
		if (typeof detail.summary !== "object" || detail.summary === null) {
			throw new Error("summary should be object");
		}
		expect(detail.summary.session_id).toBe("s1");
		if (!detail.model_events[0]) throw new Error("model_events[0] is undefined");
		expect(detail.model_events[0].provider).toBe("anthropic");
		if (!detail.tool_calls[0]) throw new Error("tool_calls[0] is undefined");
		expect(detail.tool_calls[0].tool_name).toBe("read");
		expect(detail.tool_calls[0].path).toBe("packages/foo.py");
		if (!detail.tool_results[0]) throw new Error("tool_results[0] is undefined");
		expect(detail.tool_results[0].is_error).toBe(true);
		if (!detail.command_executions[0]) throw new Error("command_executions[0] is undefined");
		expect(detail.command_executions[0].command_subject).toBe("just test");
		if (!detail.usage_events[0]) throw new Error("usage_events[0] is undefined");
		expect(detail.usage_events[0].total_tokens).toBe(15);
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
		const toolResult = session0.tool_results[0];
		if (!toolResult) throw new Error("toolResult is undefined");
		expect(toolResult.has_error_message).toBe(true);
	});

	it("includes supporting event pointers from source refs", () => {
		const session = detailSession({ sourceInfo: sourceInfo() });
		const compactResult = compactResult_(session);

		const payloadData = buildEvidencePayloadData({
			compactResult,
			sessions: [session],
		});

		const failedToolItems = payloadData.evidence_items.filter((item) => {
			const i = item.item as Record<string, unknown>;
			return i.kind === "failed_tool_result";
		});
		expect(failedToolItems.length).toBe(1);
		const firstItem = failedToolItems[0];
		if (!firstItem) throw new Error("firstItem is undefined");
		expect(firstItem.supporting_event_pointers).toEqual(["/data/sessions/0/tool_results/0"]);
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
			payloadData.evidence_items.every((item) => item.supporting_event_pointers.length === 0),
		).toBe(true);
	});
});

function compactResult_(session: ParsedSession): CompactResult {
	// Mock compact result using test data
	return {
		repo: {
			repo_root: "/repo",
			cwd: "/repo",
			branch: "feature/retro",
			branch_source: "explicit",
		},
		query: {
			repo_root: "/repo",
			session_root: null,
			max_sessions: 20,
		},
		source: session.source_info,
		aggregate_metrics: {
			session_count: 1,
			message_counts: session.message_counts,
			tool_call_count: session.tool_calls.length,
			tool_result_count: session.tool_results.length,
			command_execution_count: session.command_executions.length,
			usage_event_count: session.usage_events.length,
			warning_count: session.warnings.length,
		},
		sessions: [
			{
				session_id: session.session_id,
				started_at_iso: session.started_at_iso,
				ended_at_iso: session.ended_at_iso,
				source_ref: session.source_ref,
				association: {
					repo_root: session.association.repo_root,
					cwd: session.association.cwd,
					branch: session.association.branch,
					confidence: session.association.confidence,
					evidence: [...session.association.evidence],
				},
				message_counts: session.message_counts,
				model_event_count: session.model_events.length,
				tool_call_count: session.tool_calls.length,
				tool_result_count: session.tool_results.length,
				command_execution_count: session.command_executions.length,
				usage_event_count: session.usage_events.length,
				warning_count: session.warnings.length,
			},
		],
		warnings: session.warnings.map((w) => ({
			code: w.code,
			message: w.message,
			source_ref: w.source_ref,
			harness: w.harness,
			adapter_name: w.adapter_name,
		})),
		evidence_items: [
			{
				kind: "failed_tool_result",
				subject: "read",
				summary: "read failed 1 time across 1 session",
				count: 1,
				session_count: 1,
				source_refs: [
					session.tool_results[0]
						? (session.tool_results[0].source_ref ?? { path: null, uri: null, line_number: null })
						: { path: null, uri: null, line_number: null },
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
			confidence: "repo_cwd",
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
