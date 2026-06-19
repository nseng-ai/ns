import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import {
	PiJsonlSessionSource,
	encodePiSessionDirName,
	defaultPiSessionRoot,
} from "../../../src/sessions/pi-jsonl-source.ts";
import type { SessionQuery } from "../../../src/sessions/types.ts";

describe("encodePiSessionDirName", () => {
	it("encodes absolute repo path with leading/trailing slashes stripped and / replaced by -", () => {
		const result = encodePiSessionDirName("/Users/test/repos/myproject");
		expect(result).toBe("--Users-test-repos-myproject--");
	});

	it("handles paths without leading slash", () => {
		const result = encodePiSessionDirName("home/user/project");
		expect(result).toMatch(/^--.*home-user-project--$/);
	});

	it("handles root path", () => {
		const result = encodePiSessionDirName("/");
		expect(result).toBe("----");
	});
});

describe("defaultPiSessionRoot", () => {
	it("returns expected Pi session root path", () => {
		const result = defaultPiSessionRoot();
		expect(result).toMatch(/\.pi\/agent\/sessions$/);
	});
});

describe("PiJsonlSessionSource", () => {
	it("has correct source info", () => {
		const source = new PiJsonlSessionSource();
		expect(source.sourceInfo).toEqual({
			harness: "pi",
			adapter_name: "pi_jsonl",
			record_format: "jsonl",
		});
	});

	describe("query", () => {
		it("returns warning when session root does not exist", async () => {
			const source = new PiJsonlSessionSource();
			const nonexistentRoot = join(tmpdir(), "nonexistent-pi-session-root-xyz");

			const query: SessionQuery = {
				repo_root: "/some/repo",
				session_root: nonexistentRoot,
				max_sessions: 20,
			};

			const result = await source.query(query);

			expect(result.source_info).toEqual(source.sourceInfo);
			expect(result.sessions).toEqual([]);
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0]?.code).toBe("session_root_missing");
			expect(result.warnings[0]?.message).toContain("does not exist");
		});

		it("returns warning when session root is not a directory", async () => {
			const source = new PiJsonlSessionSource();
			const tmpRoot = mkdtempSync(join(tmpdir(), "pi-test-"));
			const fileNotDir = join(tmpRoot, "not-a-dir");
			writeFileSync(fileNotDir, "test");

			const query: SessionQuery = {
				repo_root: "/some/repo",
				session_root: fileNotDir,
				max_sessions: 20,
			};

			const result = await source.query(query);

			expect(result.sessions).toEqual([]);
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0]?.code).toBe("session_root_not_directory");
		});

		it("returns warning when repo session dir does not exist", async () => {
			const source = new PiJsonlSessionSource();
			const tmpRoot = mkdtempSync(join(tmpdir(), "pi-test-"));

			const query: SessionQuery = {
				repo_root: "/some/repo",
				session_root: tmpRoot,
				max_sessions: 20,
			};

			const result = await source.query(query);

			expect(result.sessions).toEqual([]);
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0]?.code).toBe("repo_session_dir_missing");
			expect(result.warnings[0]?.message).toContain("does not exist for repo");
		});

		it("returns warning when repo session path is not a directory", async () => {
			const source = new PiJsonlSessionSource();
			const tmpRoot = mkdtempSync(join(tmpdir(), "pi-test-"));
			const repoRoot = "/some/repo";
			const repoSessionPath = join(tmpRoot, encodePiSessionDirName(repoRoot));
			writeFileSync(repoSessionPath, "test");

			const query: SessionQuery = {
				repo_root: repoRoot,
				session_root: tmpRoot,
				max_sessions: 20,
			};

			const result = await source.query(query);

			expect(result.sessions).toEqual([]);
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0]?.code).toBe("repo_session_dir_not_directory");
		});

		it("returns empty sessions when repo session dir exists but has no JSONL files", async () => {
			const source = new PiJsonlSessionSource();
			const tmpRoot = mkdtempSync(join(tmpdir(), "pi-test-"));
			const repoRoot = "/some/repo";
			const repoSessionDir = join(tmpRoot, encodePiSessionDirName(repoRoot));
			mkdirSync(repoSessionDir);

			const query: SessionQuery = {
				repo_root: repoRoot,
				session_root: tmpRoot,
				max_sessions: 20,
			};

			const result = await source.query(query);

			expect(result.sessions).toEqual([]);
			expect(result.warnings).toEqual([]);
		});

		it("parses a minimal valid Pi JSONL session", async () => {
			const source = new PiJsonlSessionSource();
			const tmpRoot = mkdtempSync(join(tmpdir(), "pi-test-"));
			const repoRoot = "/test/repo";
			const repoSessionDir = join(tmpRoot, encodePiSessionDirName(repoRoot));
			mkdirSync(repoSessionDir);

			const sessionFile = join(repoSessionDir, "session-001.jsonl");
			const sessionContent = [
				JSON.stringify({
					type: "session",
					id: "test-session-001",
					timestamp: "2024-01-15T10:00:00Z",
					cwd: "/test/repo/worktree",
				}),
				JSON.stringify({
					type: "model_change",
					provider: "anthropic",
					model: "claude-3-5-sonnet-20241022",
					timestamp: "2024-01-15T10:00:01Z",
				}),
				JSON.stringify({
					type: "message",
					timestamp: "2024-01-15T10:00:02Z",
					message: {
						role: "user",
						content: "test message",
					},
				}),
			].join("\n");

			writeFileSync(sessionFile, sessionContent);

			const query: SessionQuery = {
				repo_root: repoRoot,
				session_root: tmpRoot,
				max_sessions: 20,
			};

			const result = await source.query(query);

			expect(result.sessions).toHaveLength(1);
			const session = result.sessions[0];
			expect(session?.session_id).toBe("test-session-001");
			expect(session?.started_at_iso).toBe("2024-01-15T10:00:00Z");
			expect(session?.ended_at_iso).toBe("2024-01-15T10:00:02Z");
			expect(session?.message_counts.user).toBe(1);
			expect(session?.message_counts.assistant).toBe(0);
			expect(session?.model_events).toHaveLength(1);
			expect(session?.model_events[0]?.provider).toBe("anthropic");
			expect(session?.model_events[0]?.model).toBe("claude-3-5-sonnet-20241022");
			expect(session?.association.confidence).toBe("repo_cwd");
			expect(session?.association.cwd).toBe("/test/repo/worktree");
		});

		it("respects max_sessions limit", async () => {
			const source = new PiJsonlSessionSource();
			const tmpRoot = mkdtempSync(join(tmpdir(), "pi-test-"));
			const repoRoot = "/test/repo";
			const repoSessionDir = join(tmpRoot, encodePiSessionDirName(repoRoot));
			mkdirSync(repoSessionDir);

			// Create 5 session files
			for (let i = 1; i <= 5; i++) {
				const sessionFile = join(repoSessionDir, `session-00${i}.jsonl`);
				const sessionContent = JSON.stringify({
					type: "session",
					id: `test-session-00${i}`,
					timestamp: `2024-01-15T10:00:0${i}Z`,
					cwd: "/test/repo",
				});
				writeFileSync(sessionFile, sessionContent);
			}

			const query: SessionQuery = {
				repo_root: repoRoot,
				session_root: tmpRoot,
				max_sessions: 3,
			};

			const result = await source.query(query);

			expect(result.sessions).toHaveLength(3);
		});

		it("returns empty when max_sessions is 0", async () => {
			const source = new PiJsonlSessionSource();
			const tmpRoot = mkdtempSync(join(tmpdir(), "pi-test-"));
			const repoRoot = "/test/repo";
			const repoSessionDir = join(tmpRoot, encodePiSessionDirName(repoRoot));
			mkdirSync(repoSessionDir);

			const sessionFile = join(repoSessionDir, "session-001.jsonl");
			writeFileSync(
				sessionFile,
				JSON.stringify({ type: "session", id: "test", timestamp: "2024-01-15T10:00:00Z" }),
			);

			const query: SessionQuery = {
				repo_root: repoRoot,
				session_root: tmpRoot,
				max_sessions: 0,
			};

			const result = await source.query(query);

			expect(result.sessions).toEqual([]);
		});

		it("parses tool calls from assistant message", async () => {
			const source = new PiJsonlSessionSource();
			const tmpRoot = mkdtempSync(join(tmpdir(), "pi-test-"));
			const repoRoot = "/test/repo";
			const repoSessionDir = join(tmpRoot, encodePiSessionDirName(repoRoot));
			mkdirSync(repoSessionDir);

			const sessionFile = join(repoSessionDir, "session-001.jsonl");
			const sessionContent = [
				JSON.stringify({ type: "session", id: "test", timestamp: "2024-01-15T10:00:00Z" }),
				JSON.stringify({
					type: "message",
					timestamp: "2024-01-15T10:00:01Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "call-123",
								name: "bash",
								arguments: { command: "ls -la" },
							},
						],
					},
				}),
			].join("\n");

			writeFileSync(sessionFile, sessionContent);

			const query: SessionQuery = {
				repo_root: repoRoot,
				session_root: tmpRoot,
				max_sessions: 20,
			};

			const result = await source.query(query);

			expect(result.sessions).toHaveLength(1);
			const session = result.sessions[0];
			expect(session?.tool_calls).toHaveLength(1);
			expect(session?.tool_calls[0]?.call_id).toBe("call-123");
			expect(session?.tool_calls[0]?.tool_name).toBe("bash");
			expect(session?.tool_calls[0]?.command).toBe("ls -la");
		});

		it("parses bash execution records", async () => {
			const source = new PiJsonlSessionSource();
			const tmpRoot = mkdtempSync(join(tmpdir(), "pi-test-"));
			const repoRoot = "/test/repo";
			const repoSessionDir = join(tmpRoot, encodePiSessionDirName(repoRoot));
			mkdirSync(repoSessionDir);

			const sessionFile = join(repoSessionDir, "session-001.jsonl");
			const sessionContent = [
				JSON.stringify({ type: "session", id: "test", timestamp: "2024-01-15T10:00:00Z" }),
				JSON.stringify({
					type: "bashExecution",
					timestamp: "2024-01-15T10:00:01Z",
					command: "echo hello",
					exitCode: 0,
					output: "hello\n",
				}),
			].join("\n");

			writeFileSync(sessionFile, sessionContent);

			const query: SessionQuery = {
				repo_root: repoRoot,
				session_root: tmpRoot,
				max_sessions: 20,
			};

			const result = await source.query(query);

			expect(result.sessions).toHaveLength(1);
			const session = result.sessions[0];
			expect(session?.command_executions).toHaveLength(1);
			expect(session?.command_executions[0]?.command).toBe("echo hello");
			expect(session?.command_executions[0]?.exit_code).toBe(0);
			expect(session?.command_executions[0]?.output_length).toBe(6);
			expect(session?.message_counts.command_execution).toBe(1);
		});

		it("parses usage events", async () => {
			const source = new PiJsonlSessionSource();
			const tmpRoot = mkdtempSync(join(tmpdir(), "pi-test-"));
			const repoRoot = "/test/repo";
			const repoSessionDir = join(tmpRoot, encodePiSessionDirName(repoRoot));
			mkdirSync(repoSessionDir);

			const sessionFile = join(repoSessionDir, "session-001.jsonl");
			const sessionContent = [
				JSON.stringify({ type: "session", id: "test", timestamp: "2024-01-15T10:00:00Z" }),
				JSON.stringify({
					type: "message",
					timestamp: "2024-01-15T10:00:01Z",
					message: {
						role: "assistant",
						content: "response",
						usage: {
							input: 100,
							output: 50,
							cacheRead: 200,
						},
					},
				}),
			].join("\n");

			writeFileSync(sessionFile, sessionContent);

			const query: SessionQuery = {
				repo_root: repoRoot,
				session_root: tmpRoot,
				max_sessions: 20,
			};

			const result = await source.query(query);

			expect(result.sessions).toHaveLength(1);
			const session = result.sessions[0];
			expect(session?.usage_events).toHaveLength(1);
			expect(session?.usage_events[0]?.input_tokens).toBe(100);
			expect(session?.usage_events[0]?.output_tokens).toBe(50);
			expect(session?.usage_events[0]?.cache_read_tokens).toBe(200);
		});

		it("warns on malformed JSON line", async () => {
			const source = new PiJsonlSessionSource();
			const tmpRoot = mkdtempSync(join(tmpdir(), "pi-test-"));
			const repoRoot = "/test/repo";
			const repoSessionDir = join(tmpRoot, encodePiSessionDirName(repoRoot));
			mkdirSync(repoSessionDir);

			const sessionFile = join(repoSessionDir, "session-001.jsonl");
			const sessionContent = [
				JSON.stringify({ type: "session", id: "test", timestamp: "2024-01-15T10:00:00Z" }),
				"{ invalid json",
			].join("\n");

			writeFileSync(sessionFile, sessionContent);

			const query: SessionQuery = {
				repo_root: repoRoot,
				session_root: tmpRoot,
				max_sessions: 20,
			};

			const result = await source.query(query);

			expect(result.sessions).toHaveLength(1);
			const session = result.sessions[0];
			expect(session?.warnings.some((w) => w.code === "malformed_json")).toBe(true);
		});

		it("warns when missing session header", async () => {
			const source = new PiJsonlSessionSource();
			const tmpRoot = mkdtempSync(join(tmpdir(), "pi-test-"));
			const repoRoot = "/test/repo";
			const repoSessionDir = join(tmpRoot, encodePiSessionDirName(repoRoot));
			mkdirSync(repoSessionDir);

			const sessionFile = join(repoSessionDir, "session-001.jsonl");
			const sessionContent = JSON.stringify({
				type: "message",
				timestamp: "2024-01-15T10:00:00Z",
				message: { role: "user", content: "test" },
			});

			writeFileSync(sessionFile, sessionContent);

			const query: SessionQuery = {
				repo_root: repoRoot,
				session_root: tmpRoot,
				max_sessions: 20,
			};

			const result = await source.query(query);

			expect(result.sessions).toHaveLength(1);
			const session = result.sessions[0];
			expect(session?.warnings.some((w) => w.code === "missing_session_header")).toBe(true);
		});

		it("ignores known record types", async () => {
			const source = new PiJsonlSessionSource();
			const tmpRoot = mkdtempSync(join(tmpdir(), "pi-test-"));
			const repoRoot = "/test/repo";
			const repoSessionDir = join(tmpRoot, encodePiSessionDirName(repoRoot));
			mkdirSync(repoSessionDir);

			const sessionFile = join(repoSessionDir, "session-001.jsonl");
			const sessionContent = [
				JSON.stringify({ type: "session", id: "test", timestamp: "2024-01-15T10:00:00Z" }),
				JSON.stringify({ type: "thinking_level_change", timestamp: "2024-01-15T10:00:01Z" }),
				JSON.stringify({ type: "custom_message", timestamp: "2024-01-15T10:00:02Z" }),
			].join("\n");

			writeFileSync(sessionFile, sessionContent);

			const query: SessionQuery = {
				repo_root: repoRoot,
				session_root: tmpRoot,
				max_sessions: 20,
			};

			const result = await source.query(query);

			expect(result.sessions).toHaveLength(1);
			const session = result.sessions[0];
			// Should not warn about ignored record types
			expect(session?.warnings).toEqual([]);
		});
	});
});
