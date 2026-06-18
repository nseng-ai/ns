import type { CommandExecApi, ExecOptions, ExecResult } from "@asdl/core/exec";
import { ScriptedCommandExecApi } from "@asdl/core/testing";
import { describe, expect, it } from "vitest";

import { ClaudeRunner, type RunnerRequest } from "../../src/runners.ts";

interface ExecCall {
	command: string;
	args: readonly string[];
	cwd: string | undefined;
}

class StreamingExecApi implements CommandExecApi {
	private readonly result: ExecResult;
	private readonly callsInternal: ExecCall[] = [];

	constructor(result: ExecResult) {
		this.result = result;
	}

	async exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
		this.callsInternal.push({ command, args: [...args], cwd: options.cwd });
		options.onStdout?.("stdout chunk\n");
		options.onStderr?.("stderr chunk\n");
		return this.result;
	}

	calls(): readonly ExecCall[] {
		return this.callsInternal.map((call) => ({
			command: call.command,
			args: [...call.args],
			cwd: call.cwd,
		}));
	}
}

describe("ClaudeRunner", () => {
	it("runs through CommandExecApi while streaming transcript output", async () => {
		const execApi = new StreamingExecApi({
			stdout: "",
			stderr: "",
			code: 7,
			killed: false,
		});
		const runner = new ClaudeRunner(execApi);
		const transcript: string[] = [];
		const stdout: string[] = [];

		const result = await runner.run(
			request({ model: "claude-sonnet" }),
			(text) => transcript.push(text),
			(text) => stdout.push(text),
		);

		expect(result.exitCode).toBe(7);
		expect(transcript.join("")).toBe("stdout chunk\nstderr chunk\n");
		expect(stdout.join("")).toBe("stdout chunk\nstderr chunk\n");
		expect(execApi.calls()).toEqual([
			{
				command: "claude",
				args: [
					"--print",
					"--permission-mode",
					"acceptEdits",
					"--model",
					"claude-sonnet",
					"Do the work.",
				],
				cwd: "/repo",
			},
		]);
	});

	it("maps missing runner startup failures to VibechkError", async () => {
		const execApi = new ScriptedCommandExecApi([
			{
				code: 127,
				stderr: "spawn claude ENOENT",
				startupError: "spawn claude ENOENT",
			},
		]);
		const runner = new ClaudeRunner(execApi);

		await expect(
			runner.run(
				request(),
				() => {},
				() => {},
			),
		).rejects.toThrow("Runner 'claude' is not installed or not on PATH.");
	});
});

function request(options: { model?: string | null | undefined } = {}): RunnerRequest {
	return {
		planText: "Do the work.",
		workdir: "/repo",
		model: options.model ?? null,
		runId: "testrun",
		artifactsDir: "/artifacts",
	};
}
