import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { exitedResult, ScriptedCommandExecApi } from "@nseng-ai/foundation/exec/testing";
import {
	createSlotDiagnosticSinkFromEnv,
	runDiagnosticCommand,
	SLOT_DIAGNOSTIC_LOG_ENV,
} from "../../src/core/diagnostics.ts";

describe("slot diagnostics", () => {
	it("is disabled when no diagnostic log path is configured", () => {
		expect(createSlotDiagnosticSinkFromEnv({})).toBeUndefined();
	});

	it("writes command diagnostics as jsonl without stdout or stderr bodies", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "slot-diagnostics-"));
		try {
			const logPath = join(tempDir, "diagnostics.jsonl");
			const sink = createSlotDiagnosticSinkFromEnv({ [SLOT_DIAGNOSTIC_LOG_ENV]: logPath });
			if (sink === undefined) throw new Error("expected configured diagnostic sink");
			const execApi = new ScriptedCommandExecApi([
				exitedResult({
					stdout: "hello\n",
					stderr: "warning\n",
					code: 7,
					signal: "SIGTERM",
				}),
			]);

			const result = await runDiagnosticCommand({
				execApi,
				command: "git",
				args: ["worktree", "list", "--porcelain"],
				execOptions: { cwd: "/repo", timeout: 123 },
				operation: "slot.git.list_worktrees",
				diagnosticSink: sink,
			});

			expect(result).toEqual(
				exitedResult({
					stdout: "hello\n",
					stderr: "warning\n",
					code: 7,
					signal: "SIGTERM",
				}),
			);
			const lines = (await readFile(logPath, "utf8")).trimEnd().split("\n");
			expect(lines).toHaveLength(1);
			const event = JSON.parse(lines[0] ?? "{}");
			expect(event).toMatchObject({
				type: "slot.command",
				operation: "slot.git.list_worktrees",
				command: "git",
				args: ["worktree", "list", "--porcelain"],
				displayCommand: "git worktree list --porcelain",
				cwd: "/repo",
				timeoutMs: 123,
				termination: { type: "exited", code: 7, signal: "SIGTERM" },
				stdoutBytes: 6,
				stderrBytes: 8,
			});
			expect(event.startedAt).toEqual(expect.any(String));
			expect(event.durationMs).toEqual(expect.any(Number));
			expect(JSON.stringify(event)).not.toContain("hello");
			expect(JSON.stringify(event)).not.toContain("warning");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
