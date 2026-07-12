import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/command";
import { VERSION, runCli } from "../../src/ns/cli.ts";

interface RecordedCommand {
	command: string;
	args: string[];
	options?: ExecOptions;
}

class CmuxCommandFake implements CommandExecApi {
	readonly events: RecordedCommand[] = [];
	private readonly failedCommand: string | undefined;

	constructor(failedCommand?: string) {
		this.failedCommand = failedCommand;
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.events.push({ command, args: [...args], ...(options === undefined ? {} : { options }) });
		if (args.join(" ") === this.failedCommand) {
			return { type: "exited", stdout: "", stderr: "workspace not found", code: 2, signal: null };
		}
		return { type: "exited", stdout: "", stderr: "", code: 0, signal: null };
	}
}

function run(args: readonly string[]) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		exit: runCli(args, {
			cwd: "/repo",
			env: { PATH: "/bin" },
			commands: new CmuxCommandFake(),
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
	};
}

function output(result: { stdout: string[]; stderr: string[] }): {
	stdout: string;
	stderr: string;
} {
	return { stdout: result.stdout.join(""), stderr: result.stderr.join("") };
}

describe("ccc CLI", () => {
	test("prints help, version, runtime diagnostics, and hidden exec help", async () => {
		const help = run(["--help"]);
		expect(await help.exit).toBe(0);
		expect(output(help).stdout).toContain("Usage: ccc [options] [command]");
		expect(output(help).stdout).toContain("CCC repo orchestration tools.");
		expect(output(help).stdout).not.toContain("exec");

		const version = run(["--version"]);
		expect(await version.exit).toBe(0);
		expect(output(version).stdout).toBe(`${VERSION}\n`);

		const runtime = run(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(output(runtime).stdout).toBe(
			"runtime: typescript\nentry_point: @nseng-ai/cmux bin ccc -> ts/packages/capabilities/cmux/src/ns/cli.ts\n",
		);

		const execHelp = run(["exec", "--help"]);
		expect(await execHelp.exit).toBe(0);
		expect(output(execHelp).stdout).toContain(
			"Run hidden deterministic CCC operations for agents.",
		);
		expect(output(execHelp).stdout).toContain("cmux-workspace-summary");
		expect(output(execHelp).stdout).not.toContain("autobranch");
	});

	test("cmux workspace summary applies title, description, and status through ccc exec", async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const commands = new CmuxCommandFake();
		const exit = await runCli(
			[
				"exec",
				"cmux-workspace-summary",
				"--title",
				"Ship cmux summary command",
				"--description",
				"Goal: Add a project-local Pi command that labels this cmux workspace.",
				"--format",
				"json",
			],
			{
				cwd: "/repo",
				env: { PATH: "/bin", CMUX_WORKSPACE_ID: "workspace:16", CMUX_TAB_ID: "workspace:tab" },
				commands,
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
			},
		);

		expect(exit).toBe(0);
		expect(stderr.join("")).toBe("");
		expect(JSON.parse(stdout.join(""))).toEqual({
			status: "ok",
			exitCode: 0,
			data: {
				success: true,
				workspace: "workspace:16",
				title: "Ship cmux summary command",
				description: "Goal: Add a project-local Pi command that labels this cmux workspace.",
				statusKey: "pi-summary",
				error: null,
			},
		});
		expect(commands.events.map((event) => [event.command, event.args])).toEqual([
			["cmux", ["workspace", "rename", "workspace:16", "--title", "Ship cmux summary command"]],
			[
				"cmux",
				[
					"workspace-action",
					"--workspace",
					"workspace:16",
					"--action",
					"set-description",
					"--description",
					"Goal: Add a project-local Pi command that labels this cmux workspace.",
				],
			],
			["cmux", ["clear-status", "pi-summary", "--workspace", "workspace:16"]],
		]);
	});

	test("cmux workspace summary reports validation and command failures as JSON", async () => {
		const missingStdout: string[] = [];
		const missingStderr: string[] = [];
		const missing = await runCli(
			["exec", "cmux-workspace-summary", "--title", "Missing description", "--format", "json"],
			{
				cwd: "/repo",
				env: { PATH: "/bin", CMUX_WORKSPACE_ID: "workspace:16" },
				commands: new CmuxCommandFake(),
				stdout: (text) => missingStdout.push(text),
				stderr: (text) => missingStderr.push(text),
			},
		);

		expect(missing).toBe(2);
		expect(missingStderr.join("")).toBe("");
		expect(JSON.parse(missingStdout.join(""))).toMatchObject({
			status: "usageError",
			exitCode: 2,
			message: "Provide --description.",
			data: { success: false, error: { code: "missing-description" } },
		});

		const failedStdout: string[] = [];
		const failed = await runCli(
			[
				"exec",
				"cmux-workspace-summary",
				"--workspace",
				"workspace:16",
				"--title",
				"fail",
				"--description",
				"Goal: Test failure.",
				"--format",
				"json",
			],
			{
				cwd: "/repo",
				env: { PATH: "/bin" },
				commands: new CmuxCommandFake("workspace rename workspace:16 --title fail"),
				stdout: (text) => failedStdout.push(text),
				stderr: () => undefined,
			},
		);

		expect(failed).toBe(2);
		expect(JSON.parse(failedStdout.join(""))).toMatchObject({
			exitCode: 2,
			data: {
				success: false,
				error: {
					code: "rename-workspace-failed",
					commandFailure: {
						command: ["cmux", "workspace", "rename", "workspace:16", "--title", "fail"],
						exitCode: 2,
						stderr: "workspace not found",
					},
				},
			},
		});
	});

	test("unknown commands use clinkr usage errors", async () => {
		const unknown = run(["bogus"]);
		expect(await unknown.exit).toBe(2);
		expect(output(unknown)).toEqual({ stdout: "", stderr: "error: unknown command 'bogus'\n" });
	});
});
