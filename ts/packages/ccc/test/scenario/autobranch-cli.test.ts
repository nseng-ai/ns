import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@asdl/core/exec";
import { runCli } from "../../src/cli.ts";
import { createGitWorldExec, eventIndex, type GitWorldExecOptions } from "../autobranch-test-helpers.ts";

interface CliRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	commands: CommandExecApi & { events: string[] };
	commits: string[];
}

type FakeOptions = Pick<GitWorldExecOptions, "isCleanWorktree" | "isDetachedHead" | "shouldGtCreateFail" | "upstreamMode" | "shouldDeleteBackupFail">;

class AutobranchCommandFake implements CommandExecApi {
	readonly events: string[];
	private readonly execWorld: ReturnType<typeof createGitWorldExec>["exec"];

	constructor(options: FakeOptions = {}) {
		const world = createGitWorldExec(options);
		this.events = world.events;
		this.execWorld = world.exec;
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		void options;
		return this.execWorld(command, args);
	}
}

function runWithFakes(args: readonly string[], options: FakeOptions = {}): CliRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const commands = new AutobranchCommandFake(options);
	const commits: string[] = [];
	return {
		stdout,
		stderr,
		commands,
		commits,
		exit: runCli(args, {
			cwd: "/repo",
			env: { PATH: "/bin" },
			commands,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
			autobranch: {
				now: () => 123,
				prepareCheckpointMessage: async () => ({ ok: true, message: "[cp] Add pending work\n\n- Checkpoint current changes", source: "model" }),
				commitPreparedCheckpointMessage: async (message) => {
					commits.push(message);
					return { summary: "abc123 [cp] Add pending work" };
				},
			},
		}),
	};
}

function output(run: Pick<CliRun, "stdout" | "stderr">): { stdout: string; stderr: string } {
	return { stdout: run.stdout.join(""), stderr: run.stderr.join("") };
}

describe("ccc CLI", () => {
	test("prints help, version, runtime diagnostics, and hidden exec help", async () => {
		const help = runWithFakes(["--help"]);
		expect(await help.exit).toBe(0);
		expect(output(help).stdout).toContain("Usage: ccc [options] [command]");
		expect(output(help).stdout).toContain("CCC repo orchestration tools.");
		expect(output(help).stdout).not.toContain("exec");

		const version = runWithFakes(["--version"]);
		expect(await version.exit).toBe(0);
		expect(output(version).stdout).toBe("0.1.0\n");

		const runtime = runWithFakes(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(output(runtime).stdout).toBe("runtime: typescript\nentry_point: @asdl/ccc bin ccc -> ts/packages/ccc/src/cli.ts\n");

		const execHelp = runWithFakes(["exec", "--help"]);
		expect(await execHelp.exit).toBe(0);
		expect(output(execHelp).stdout).toContain("Run hidden deterministic CCC operations for agents.");
		expect(output(execHelp).stdout).toContain("autobranch");
	});

	test("autobranch help documents slug, Graphite, latest-commit behavior, and json schema", async () => {
		const run = runWithFakes(["exec", "autobranch", "--help"]);

		expect(await run.exit).toBe(0);
		const help = output(run).stdout;
		expect(help).toContain("--slug <value>");
		expect(help).toContain("Graphite");
		expect(help).toContain("gt create");
		expect(help).toMatch(/latest\s+eligible\s+unpushed\s+non-merge\s+commit/);
		expect(help).toContain("--json-schema");
	});

	test("unknown commands and options use clinkr usage errors", async () => {
		const unknown = runWithFakes(["bogus"]);
		expect(await unknown.exit).toBe(2);
		expect(output(unknown)).toEqual({ stdout: "", stderr: "error: unknown command 'bogus'\n" });

		const badOption = runWithFakes(["exec", "autobranch", "--bogus"]);
		expect(await badOption.exit).toBe(2);
		expect(output(badOption)).toEqual({ stdout: "", stderr: "error: unknown option '--bogus'\n" });
	});

	test("dirty worktree success creates a Graphite branch, restores changes, and checkpoints", async () => {
		const run = runWithFakes(["exec", "autobranch", "--slug", "Requested Branch"]);

		expect(await run.exit).toBe(0);
		expect(output(run).stderr).toBe("");
		expect(output(run).stdout).toContain("New branch: requested-branch");
		expect(output(run).stdout).toContain("Stacked on: feature/base");
		expect(output(run).stdout).toContain("Commit: abc123 [cp] Add pending work");
		expect(output(run).stdout).toContain("Working directory is clean.");
		expect(run.commits).toEqual(["[cp] Add pending work\n\n- Checkpoint current changes"]);
		expect(eventIndex(run.commands.events, "git stash push --include-untracked")).toBeGreaterThan(-1);
		expect(eventIndex(run.commands.events, "gt create requested-branch --no-interactive --no-ai")).toBeGreaterThan(eventIndex(run.commands.events, "git stash push"));
		expect(eventIndex(run.commands.events, "git stash pop stash@{0}")).toBeGreaterThan(eventIndex(run.commands.events, "gt create requested-branch"));
		expect(run.commands.events.some((event) => event.startsWith("pi "))).toBe(false);
	});

	test("clean worktree success moves the latest eligible unpushed commit", async () => {
		const run = runWithFakes(["exec", "autobranch", "--slug", "Latest Commit Branch"], { isCleanWorktree: true, upstreamMode: "none" });

		expect(await run.exit).toBe(0);
		expect(output(run).stderr).toBe("");
		expect(output(run).stdout).toContain("New branch: latest-commit-branch");
		expect(output(run).stdout).toContain("Moved commit: abc123d Add latest commit support");
		expect(output(run).stdout).toContain("Source branch feature/base reset to parent9.");
		expect(eventIndex(run.commands.events, "gt trunk")).toBeGreaterThan(-1);
		expect(eventIndex(run.commands.events, "gt children")).toBeGreaterThan(-1);
		expect(eventIndex(run.commands.events, "git branch autobranch-backup/feature/base/123 abc123def456")).toBeGreaterThan(-1);
		expect(eventIndex(run.commands.events, "git reset --hard parent987654")).toBeGreaterThan(-1);
		expect(eventIndex(run.commands.events, "gt create latest-commit-branch --no-interactive --no-ai")).toBeGreaterThan(-1);
		expect(eventIndex(run.commands.events, "git reset --hard abc123def456")).toBeGreaterThan(eventIndex(run.commands.events, "gt create latest-commit-branch"));
		expect(eventIndex(run.commands.events, "git branch -D autobranch-backup/feature/base/123")).toBeGreaterThan(-1);
	});

	test("flow errors exit nonzero and write actionable guidance to stderr", async () => {
		const detached = runWithFakes(["exec", "autobranch"], { isDetachedHead: true });
		expect(await detached.exit).toBe(1);
		expect(output(detached).stdout).toBe("");
		expect(output(detached).stderr).toContain("Detached HEAD; check out a branch before autobranching.");

		const graphite = runWithFakes(["exec", "autobranch", "--slug", "failed branch"], { shouldGtCreateFail: true });
		expect(await graphite.exit).toBe(1);
		expect(output(graphite).stdout).toBe("");
		expect(output(graphite).stderr).toContain("Failed to create Graphite branch failed-branch.");
		expect(output(graphite).stderr).toContain("Restored pending changes to the original branch.");
	});

	test("clean worktree backup deletion warning goes to stderr while summary stays on stdout", async () => {
		const run = runWithFakes(["exec", "autobranch", "--slug", "Latest Commit Branch"], {
			isCleanWorktree: true,
			upstreamMode: "none",
			shouldDeleteBackupFail: true,
		});

		expect(await run.exit).toBe(0);
		expect(output(run).stdout).toContain("New branch: latest-commit-branch");
		expect(output(run).stdout).toContain("Moved commit: abc123d Add latest commit support");
		expect(output(run).stdout).not.toContain("recovery branch");
		expect(output(run).stderr).toContain("Warning: recovery branch autobranch-backup/feature/base/123 could not be deleted");
	});
});
