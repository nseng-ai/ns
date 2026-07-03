import { describe, expect, test } from "vitest";

import { GRAPHITE_COMMAND_NAME, runGraphiteCommand } from "@ji/capability-kit/graphite/branch";
import type { CommandRunner, ExecOptions, ExecResult } from "@ji/core/exec";

const SUCCESS_RESULT = {
	stdout: "ok\n",
	stderr: "",
	code: 0,
	killed: false,
} satisfies ExecResult;

describe("runGraphiteCommand", () => {
	test("invokes gt with copied args and default timeout", async () => {
		const calls: Array<{
			command: string;
			args: readonly string[];
			options: ExecOptions | undefined;
		}> = [];
		const args = ["trunk", "--no-interactive"];
		const runner: CommandRunner = async (command, commandArgs, options) => {
			calls.push({ command, args: commandArgs, options });
			return SUCCESS_RESULT;
		};

		await expect(runGraphiteCommand(runner, { cwd: "/repo", args })).resolves.toBe(SUCCESS_RESULT);

		expect(calls).toEqual([
			{
				command: GRAPHITE_COMMAND_NAME,
				args: ["trunk", "--no-interactive"],
				options: { cwd: "/repo", timeout: 30_000 },
			},
		]);
		expect(calls[0]?.args).not.toBe(args);
	});

	test("passes explicit timeout, signal, and env", async () => {
		const controller = new AbortController();
		const env = { PATH: "/bin", GT_NO_INTERACTIVE: "1" };
		let capturedOptions: ExecOptions | undefined;
		const runner: CommandRunner = async (_command, _args, options) => {
			capturedOptions = options;
			return SUCCESS_RESULT;
		};

		await runGraphiteCommand(runner, {
			cwd: "/repo",
			args: ["restack"],
			timeoutMs: 12_345,
			signal: controller.signal,
			env,
		});

		expect(capturedOptions).toEqual({
			cwd: "/repo",
			timeout: 12_345,
			signal: controller.signal,
			env,
		});
	});

	test("omits env and signal when undefined", async () => {
		let capturedOptions: ExecOptions | undefined;
		const runner: CommandRunner = async (_command, _args, options) => {
			capturedOptions = options;
			return SUCCESS_RESULT;
		};

		await runGraphiteCommand(runner, {
			cwd: "/repo",
			args: ["trunk"],
			timeoutMs: 1,
			env: undefined,
			signal: undefined,
		});

		expect(capturedOptions).toEqual({ cwd: "/repo", timeout: 1 });
		expect(capturedOptions).not.toHaveProperty("env");
		expect(capturedOptions).not.toHaveProperty("signal");
	});
});
