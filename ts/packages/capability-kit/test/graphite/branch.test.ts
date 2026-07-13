import { describe, expect, test } from "vitest";

import {
	GRAPHITE_COMMAND_NAME,
	RealGraphiteBranchGateway,
	runGraphiteCommand,
} from "@nseng-ai/capability-kit/graphite/branch";
import { InMemoryGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/testing";
import type {
	CommandExecApi,
	CommandRunner,
	ExecOptions,
	ExecResult,
} from "@nseng-ai/foundation/exec";

const SUCCESS_RESULT = {
	stdout: "ok\n",
	stderr: "",
	code: 0,
	type: "exited",
	signal: null,
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

describe("GraphiteBranchGateway.trunkBranch", () => {
	test("resolves the first non-empty configured trunk line through exact argv", async () => {
		const calls: Array<{ command: string; args: string[]; options: ExecOptions | undefined }> = [];
		const commands: CommandExecApi = {
			exec: async (command, args, options) => {
				calls.push({ command, args: [...args], options });
				return exited({ stdout: "\nrelease\nignored\n" });
			},
		};

		const gateway = new RealGraphiteBranchGateway(commands);

		await expect(gateway.trunkBranch({ cwd: "/repo" })).resolves.toEqual({
			ok: true,
			branch: "release",
		});
		expect(calls).toEqual([
			{
				command: "gt",
				args: ["trunk", "--no-interactive"],
				options: { cwd: "/repo", timeout: 30_000 },
			},
		]);
	});

	test("returns structured command evidence for nonzero and detached-HEAD failures", async () => {
		const ordinary = new RealGraphiteBranchGateway({
			exec: async () => exited({ code: 1, stderr: "configuration unavailable" }),
		});
		const detached = new RealGraphiteBranchGateway({
			exec: async () => exited({ code: 1, stderr: "ERROR: No current branch" }),
		});

		await expect(ordinary.trunkBranch({ cwd: "/repo" })).resolves.toMatchObject({
			ok: false,
			reason: "command-failed",
			error: {
				code: "graphite-trunk-failed",
				displayCommand: "gt trunk --no-interactive",
			},
		});
		await expect(detached.trunkBranch({ cwd: "/repo" })).resolves.toMatchObject({
			ok: false,
			reason: "detached-head",
			error: {
				code: "graphite-trunk-detached-head",
				displayCommand: "gt trunk --no-interactive",
			},
		});
	});

	test("returns startup and empty-output failures without inventing results", async () => {
		const startup = new RealGraphiteBranchGateway({
			exec: async () => {
				throw new Error("spawn unavailable");
			},
		});
		const empty = new RealGraphiteBranchGateway({ exec: async () => exited({ stdout: "\n" }) });

		await expect(startup.trunkBranch({ cwd: "/repo" })).resolves.toMatchObject({
			ok: false,
			reason: "command-failed",
			error: {
				code: "graphite_startup_failed",
				displayCommand: "gt trunk --no-interactive",
			},
		});
		await expect(empty.trunkBranch({ cwd: "/repo" })).resolves.toEqual({
			ok: false,
			reason: "empty",
			error: {
				code: "graphite-trunk-empty",
				message:
					"gt trunk --no-interactive returned no branch.\nCommand: gt trunk --no-interactive",
				displayCommand: "gt trunk --no-interactive",
			},
		});
	});

	test("in-memory gateway defaults to main and records semantic calls", async () => {
		const gateway = new InMemoryGraphiteBranchGateway();

		await expect(gateway.trunkBranch({ cwd: "/repo" })).resolves.toEqual({
			ok: true,
			branch: "main",
		});
		expect(gateway.trunkBranchCalls).toEqual([{ cwd: "/repo" }]);
	});

	test("in-memory gateway returns configured trunk and failure states", async () => {
		const configured = new InMemoryGraphiteBranchGateway({ trunk: "release" });
		const failure = new InMemoryGraphiteBranchGateway({
			trunk: {
				ok: false,
				reason: "command-failed",
				error: { code: "graphite-trunk-failed", message: "unavailable" },
			},
		});

		await expect(configured.trunkBranch({ cwd: "/repo" })).resolves.toEqual({
			ok: true,
			branch: "release",
		});
		await expect(failure.trunkBranch({ cwd: "/repo" })).resolves.toEqual({
			ok: false,
			reason: "command-failed",
			error: { code: "graphite-trunk-failed", message: "unavailable" },
		});
	});
});

function exited(
	overrides: Partial<Extract<ExecResult, { type: "exited" }>> = {},
): Extract<ExecResult, { type: "exited" }> {
	return {
		type: "exited",
		stdout: "",
		stderr: "",
		code: 0,
		signal: null,
		...overrides,
	};
}
