import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ScriptedCommandExecApi } from "@asdl/core/testing";
import { createSlotDiagnosticSinkFromEnv, runDiagnosticCommand, SLOT_DIAGNOSTIC_LOG_ENV } from "../../src/diagnostics.ts";

describe("slot diagnostics", () => {
	it("is disabled when no diagnostic log path is configured", () => {
		expect(createSlotDiagnosticSinkFromEnv({})).toBeUndefined();
	});

	it("writes command diagnostics as jsonl without stdout or stderr bodies", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "slot-diagnostics-"));
		try {
			const logPath = join(tempDir, "diagnostics.jsonl");
			const sink = createSlotDiagnosticSinkFromEnv({ [SLOT_DIAGNOSTIC_LOG_ENV]: logPath });
			const execApi = new ScriptedCommandExecApi([{ stdout: "hello\n", stderr: "warning\n", code: 7, killed: true, startupError: "startup detail" }]);

			const result = await runDiagnosticCommand({
				execApi,
				command: "git",
				args: ["status", "--porcelain"],
				execOptions: { cwd: "/repo", timeout: 123 },
				operation: "slot.git.has_uncommitted_changes",
				diagnosticSink: sink,
			});

			expect(result).toMatchObject({ stdout: "hello\n", stderr: "warning\n", code: 7, killed: true });
			const lines = (await readFile(logPath, "utf8")).trimEnd().split("\n");
			expect(lines).toHaveLength(1);
			const event = JSON.parse(lines[0] ?? "{}");
			expect(event).toMatchObject({
				type: "slot.command",
				operation: "slot.git.has_uncommitted_changes",
				command: "git",
				args: ["status", "--porcelain"],
				displayCommand: "git status --porcelain",
				cwd: "/repo",
				timeoutMs: 123,
				exitCode: 7,
				killed: true,
				stdoutBytes: 6,
				stderrBytes: 8,
				startupError: "startup detail",
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
