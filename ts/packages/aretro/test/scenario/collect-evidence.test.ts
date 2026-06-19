import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AretroCliContext } from "../../src/context.ts";
import { FakeAretroGitGateway } from "../../src/gateways/git-fake.ts";
import { FakeSessionSource } from "../../src/sessions/source-fake.ts";
import type { ParsedSession } from "../../src/sessions/types.ts";
import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

describe("aretro exec collect-evidence", () => {
	it("returns JSON envelope with expected top-level fields", async () => {
		const git = new FakeAretroGitGateway({
			repoRoot: "/test/repo",
			currentBranch: "test-branch",
		});
		const context: AretroCliContext = {
			cwd: "/repo",
			env: {},
			git,
			sessionSource: new FakeSessionSource(),
		};

		const run = runScenario(
			["exec", "collect-evidence", "--format", "json", "--branch", "test-branch"],
			{ context },
		);
		expect(await run.exit).toBe(0);
		const result = parseJsonOutput(run) as { exit_code: number; data: unknown };
		expect(result).toMatchObject({ exit_code: 0 });
		const envelope = result.data as Record<string, unknown>;
		expect(envelope).toMatchObject({
			success: true,
			error: null,
			repo: {
				repo_root: "/test/repo",
				cwd: "/repo",
				branch: "test-branch",
				branch_source: "explicit",
			},
			query: {
				repo_root: "/test/repo",
				session_root: null,
				max_sessions: 20,
			},
			source: {
				harness: "fake",
				adapter_name: "fake",
				record_format: "memory",
			},
			aggregate_metrics: expect.any(Object),
			sessions: expect.any(Array),
			warnings: expect.any(Array),
			evidence_items: expect.any(Array),
		});
	});

	it("collects evidence from session with tool usage", async () => {
		const session = sampleSession("/repo");
		const git = new FakeAretroGitGateway({
			repoRoot: "/repo",
			currentBranch: "feature/retro",
		});
		const sessionSource = new FakeSessionSource({ sessions: [session] });
		const context: AretroCliContext = {
			cwd: "/repo",
			env: {},
			git,
			sessionSource,
		};

		const run = runScenario(["exec", "collect-evidence", "--format", "json"], { context });
		expect(await run.exit).toBe(0);
		const result = parseJsonOutput(run) as { data: Record<string, unknown> };
		const data = result.data;
		expect(data.success).toBe(true);
		expect(data.repo).toMatchObject({
			branch: "feature/retro",
			branch_source: "git_current_branch",
		});
		expect((data.aggregate_metrics as Record<string, unknown>).session_count).toBe(1);
		const evidenceItems = data.evidence_items as Array<Record<string, unknown>>;
		expect(evidenceItems.length).toBeGreaterThan(0);
		const toolUsageItem = evidenceItems.find((item) => item.kind === "tool_usage_count");
		expect(toolUsageItem).toBeDefined();
		if (toolUsageItem === undefined) throw new Error("toolUsageItem is undefined");
		expect(toolUsageItem.subject).toBe("read");
		expect(toolUsageItem.count).toBe(1);
	});

	it("includes all evidence kinds for comprehensive session", async () => {
		const session = evidenceSession("/repo");
		const git = new FakeAretroGitGateway({
			repoRoot: "/repo",
			currentBranch: "feature/retro",
		});
		const sessionSource = new FakeSessionSource({ sessions: [session] });
		const context: AretroCliContext = {
			cwd: "/repo",
			env: {},
			git,
			sessionSource,
		};

		const run = runScenario(["exec", "collect-evidence", "--format", "json"], { context });
		expect(await run.exit).toBe(0);
		const result = parseJsonOutput(run) as {
			data?: { evidence_items?: Array<{ kind?: unknown }> };
		};
		const evidenceItems = result.data?.evidence_items ?? [];
		const kinds = new Set(evidenceItems.map((item) => String(item.kind ?? "unknown")));
		expect(kinds).toContain("tool_usage_count");
		expect(kinds).toContain("failed_tool_result");
		expect(kinds).toContain("repeated_file_read");
		expect(kinds).toContain("repeated_shell_command");
		expect(kinds).toContain("token_usage_observed");
		expect(kinds).toContain("large_output_observed");

		// Verify privacy: no raw outputs in JSON
		const jsonStr = JSON.stringify(result);
		expect(jsonStr).not.toContain("SECRET_TOOL_OUTPUT_TEXT");
		expect(jsonStr).not.toContain("SECRET_COMMAND_OUTPUT");
	});

	it("returns negative result for non-git repo", async () => {
		const git = new FakeAretroGitGateway({
			isGitRepo: false,
			repoRoot: { code: "repo_root_failed", message: "Not a git repo" },
		});
		const sessionSource = new FakeSessionSource();
		const context: AretroCliContext = {
			cwd: "/not-a-repo",
			env: {},
			git,
			sessionSource,
		};

		const run = runScenario(
			["exec", "collect-evidence", "--repo", "/not-a-repo", "--format", "json"],
			{ context },
		);
		expect(await run.exit).toBe(1);
		const result = parseJsonOutput(run) as { exit_code: number; data: Record<string, unknown> };
		expect(result.exit_code).toBe(1);
		expect(result.data.success).toBe(false);
		expect((result.data.error as Record<string, unknown>).code).toBe("not_a_git_repo");
		expect(result.data.sessions).toEqual([]);
		expect(sessionSource.queries).toEqual([]);
	});

	it("returns negative result for detached HEAD without explicit branch", async () => {
		const git = new FakeAretroGitGateway({
			repoRoot: "/repo",
			currentBranch: { code: "detached_head", message: "detached HEAD" },
		});
		const sessionSource = new FakeSessionSource();
		const context: AretroCliContext = {
			cwd: "/repo",
			env: {},
			git,
			sessionSource,
		};

		const run = runScenario(["exec", "collect-evidence", "--format", "json"], { context });
		expect(await run.exit).toBe(1);
		const result = parseJsonOutput(run) as { data: Record<string, unknown> };
		expect(result.data.success).toBe(false);
		expect((result.data.error as Record<string, unknown>).code).toBe("detached_head");
		expect((result.data.repo as Record<string, unknown>).branch_source).toBe("detached");
		expect(sessionSource.queries).toEqual([]);
	});

	it("succeeds with explicit branch bypassing current branch lookup", async () => {
		const git = new FakeAretroGitGateway({ repoRoot: "/repo" });
		const sessionSource = new FakeSessionSource({ sessions: [sampleSession("/repo")] });
		const context: AretroCliContext = {
			cwd: "/repo",
			env: {},
			git,
			sessionSource,
		};

		const run = runScenario(
			["exec", "collect-evidence", "--branch", "feature/manual", "--format", "json"],
			{ context },
		);
		expect(await run.exit).toBe(0);
		const result = parseJsonOutput(run) as { data: Record<string, unknown> };
		expect(result.data.success).toBe(true);
		expect((result.data.repo as Record<string, unknown>).branch).toBe("feature/manual");
		expect((result.data.repo as Record<string, unknown>).branch_source).toBe("explicit");
		expect(git.calls.getCurrentBranch).toEqual([]);
	});

	it("includes session root warning as successful result", async () => {
		const git = new FakeAretroGitGateway({
			repoRoot: "/repo",
			currentBranch: "feature/retro",
		});
		const sessionSource = new FakeSessionSource({
			warnings: [
				{
					code: "session_root_missing",
					message: "session root is missing",
					source_ref: { path: "/missing", uri: null, line_number: null },
					harness: "fake",
					adapter_name: "fake",
				},
			],
		});
		const context: AretroCliContext = {
			cwd: "/repo",
			env: {},
			git,
			sessionSource,
		};

		const run = runScenario(["exec", "collect-evidence", "--format", "json"], { context });
		expect(await run.exit).toBe(0);
		const result = parseJsonOutput(run) as { data: Record<string, unknown> };
		expect(result.data.success).toBe(true);
		expect((result.data.aggregate_metrics as Record<string, unknown>).session_count).toBe(0);
		expect((result.data.aggregate_metrics as Record<string, unknown>).warning_count).toBe(1);
		const warnings = (result.data.warnings as Array<Record<string, unknown>>) ?? [];
		expect(warnings).toHaveLength(1);
		const warning = warnings[0];
		if (warning === undefined) throw new Error("warning is undefined");
		expect(warning.code).toBe("session_root_missing");
	});

	it("rejects payload mode without session id", async () => {
		const git = new FakeAretroGitGateway({ repoRoot: "/repo", currentBranch: "main" });
		const sessionSource = new FakeSessionSource();
		const context: AretroCliContext = {
			cwd: "/repo",
			env: {},
			git,
			sessionSource,
		};

		const run = runScenario(
			["exec", "collect-evidence", "--payload-mode", "payload", "--format", "json"],
			{ context },
		);
		expect(await run.exit).toBe(1);
		const result = parseJsonOutput(run) as { data: Record<string, unknown> };
		expect(result.data.success).toBe(false);
		expect((result.data.error as Record<string, unknown>).code).toBe("payload_session_required");
		expect(git.calls.isGitRepository).toEqual([]);
		expect(git.calls.getRepositoryRoot).toEqual([]);
		expect(git.calls.getCurrentBranch).toEqual([]);
		expect(sessionSource.queries).toEqual([]);
	});

	it("writes sanitized payload detail and reads a targeted pointer", async () => {
		const payloadRoot = mkdtempSync(join(tmpdir(), "aretro-payload-test-"));
		const git = new FakeAretroGitGateway({ repoRoot: "/repo", currentBranch: "feature/retro" });
		const sessionSource = new FakeSessionSource({ sessions: [evidenceSession("/repo")] });
		const context: AretroCliContext = {
			cwd: "/repo",
			env: { ASDL_PAYLOAD_ROOT: payloadRoot },
			git,
			sessionSource,
		};

		const run = runScenario(
			[
				"exec",
				"collect-evidence",
				"--payload-mode",
				"payload",
				"--payload-session-id",
				"smoke",
				"--format",
				"json",
			],
			{ context },
		);
		expect(await run.exit).toBe(0);
		const result = parseJsonOutput(run) as { data: Record<string, unknown> };
		expect(result.data.payload_mode).toBe("payload");
		expect(result.data.detail_locator_hints).toContain("/data/sessions");
		const payloadReference = result.data.payload_reference as Record<string, unknown>;
		expect(payloadReference.descriptor).toBe("aretro-collect-evidence");
		expect(payloadReference.role).toBe("raw");
		const payloadPath = payloadReference.payload_path;
		if (typeof payloadPath !== "string") throw new Error("payload_path should be string");

		const payloadText = readFileSync(payloadPath, "utf-8");
		expect(payloadText).not.toContain("SECRET_TOOL_OUTPUT_TEXT");
		expect(payloadText).not.toContain("SECRET_COMMAND_OUTPUT");

		const detailRun = runScenario([
			"exec",
			"read-evidence-detail",
			"--payload-path",
			payloadPath,
			"--json-pointer",
			"/data/schema_version",
			"--format",
			"json",
		]);
		expect(await detailRun.exit).toBe(0);
		const detailResult = parseJsonOutput(detailRun) as { data: { value: unknown } };
		expect(detailResult.data.value).toBe(1);
	});

	it("returns human-readable output when format is human", async () => {
		const git = new FakeAretroGitGateway({
			repoRoot: "/repo",
			currentBranch: "feature/retro",
		});
		const sessionSource = new FakeSessionSource({ sessions: [sampleSession("/repo")] });
		const context: AretroCliContext = {
			cwd: "/repo",
			env: {},
			git,
			sessionSource,
		};

		const run = runScenario(["exec", "collect-evidence", "--format", "human"], { context });
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Collected 1 session(s)");
		expect(output).toContain("feature/retro");
		expect(output).toContain("fake/fake");
	});
});

function sampleSession(repoRoot: string): ParsedSession {
	return {
		source_info: {
			harness: "fake",
			adapter_name: "fake",
			record_format: "memory",
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
			repo_root: repoRoot,
			cwd: repoRoot,
			branch: null,
			confidence: "repo_cwd",
			evidence: ["query.repo_root", "session_header.cwd"],
		},
		message_counts: {
			user: 1,
			assistant: 1,
			tool_result: 0,
			command_execution: 0,
			system: 0,
			other: 0,
		},
		model_events: [{ provider: "fake", model: "model" }],
		tool_calls: [
			{
				call_id: "call-1",
				tool_name: "read",
				argument_keys: ["path"],
				source_ref: {
					path: "/tmp/sessions/s1.jsonl",
					uri: null,
					line_number: 2,
				},
			},
		],
		tool_results: [],
		command_executions: [],
		usage_events: [],
		warnings: [],
	};
}

function evidenceSession(repoRoot: string): ParsedSession {
	const sourcePath = "/tmp/sessions/s2.jsonl";
	return {
		source_info: {
			harness: "fake",
			adapter_name: "fake",
			record_format: "memory",
		},
		source_ref: {
			path: sourcePath,
			uri: null,
			line_number: null,
		},
		session_id: "s2",
		started_at_iso: "2026-01-01T00:00:00Z",
		ended_at_iso: "2026-01-01T00:01:00Z",
		association: {
			repo_root: repoRoot,
			cwd: repoRoot,
			branch: null,
			confidence: "repo_cwd",
			evidence: ["query.repo_root", "session_header.cwd"],
		},
		message_counts: {
			user: 1,
			assistant: 1,
			tool_result: 1,
			command_execution: 0,
			system: 0,
			other: 0,
		},
		model_events: [],
		tool_calls: [
			{
				call_id: "read-1",
				tool_name: "read",
				argument_keys: ["path"],
				source_ref: { path: sourcePath, uri: null, line_number: 2 },
				path: "packages/foo.py",
			},
			{
				call_id: "read-2",
				tool_name: "read",
				argument_keys: ["path"],
				source_ref: { path: sourcePath, uri: null, line_number: 3 },
				path: "packages/foo.py",
			},
			{
				call_id: "bash-1",
				tool_name: "bash",
				argument_keys: ["command"],
				source_ref: { path: sourcePath, uri: null, line_number: 4 },
				command: "just test",
			},
		],
		tool_results: [
			{
				tool_call_id: "read-1",
				tool_name: "read",
				is_error: true,
				error_message: "SECRET_TOOL_OUTPUT_TEXT",
				text_length: 25_000,
				line_count: 300,
				truncated: true,
				source_ref: { path: sourcePath, uri: null, line_number: 5 },
			},
		],
		command_executions: [
			{
				command: "just test",
				exit_code: 0,
				cancelled: false,
				truncated: false,
				output_length: 30_000,
				line_count: 4,
				source_ref: { path: sourcePath, uri: null, line_number: 6 },
			},
		],
		usage_events: [
			{
				input_tokens: 10,
				output_tokens: 5,
				cache_read_tokens: null,
				cache_write_tokens: null,
				total_tokens: 15,
				source_ref: { path: sourcePath, uri: null, line_number: 7 },
			},
		],
		warnings: [],
	};
}
