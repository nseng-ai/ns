import { describe, expect, it } from "vitest";

import { FakeSessionSource } from "../../../src/sessions/source-fake.ts";
import type { ParsedSession } from "../../../src/sessions/types.ts";

describe("FakeSessionSource", () => {
	it("applies the SessionSource max_sessions query limit", async () => {
		const source = new FakeSessionSource({
			sessions: [sampleSession("one"), sampleSession("two"), sampleSession("three")],
		});

		const result = await source.query({
			repo_root: "/repo",
			session_root: null,
			max_sessions: 2,
		});

		expect(result.sessions.map((session) => session.session_id)).toEqual(["one", "two"]);
	});

	it("returns no sessions when max_sessions is zero", async () => {
		const source = new FakeSessionSource({ sessions: [sampleSession("one")] });

		const result = await source.query({
			repo_root: "/repo",
			session_root: null,
			max_sessions: 0,
		});

		expect(result.sessions).toEqual([]);
	});
});

function sampleSession(sessionId: string): ParsedSession {
	return {
		source_info: { harness: "fake", adapter_name: "fake", record_format: "memory" },
		source_ref: { path: null, uri: null, line_number: null },
		session_id: sessionId,
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
	};
}
