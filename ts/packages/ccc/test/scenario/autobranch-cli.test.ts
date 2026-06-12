import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@asdl/core/exec";
import { runCli } from "../../src/cli.ts";

interface CliRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	commands: AutobranchCommandFake;
	commits: string[];
}

interface FakeOptions {
	isCleanWorktree?: boolean;
	isDetachedHead?: boolean;
	shouldGtCreateFail?: boolean;
	upstreamMode?: "none" | "ahead" | "contains";
}

class AutobranchCommandFake implements CommandExecApi {
	readonly events: string[] = [];
	private readonly options: FakeOptions;
	private readonly sourceBranch = "feature/base";
	private currentBranch = "feature/base";
	private head = "abc123def456";
	private statusCalls = 0;
	private stashMessage = "";

	constructor(options: FakeOptions = {}) {
		this.options = options;
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		void options;
		this.events.push(`${command} ${args.join(" ")}`);
		if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") {
			return ok("/repo\n");
		}
		if (command === "git" && args[0] === "symbolic-ref") {
			return this.options.isDetachedHead === true ? fail("not a symbolic ref") : ok(`${this.sourceBranch}\n`);
		}
		if (command === "git" && args[0] === "status") {
			this.statusCalls += 1;
			const firstStatus = this.options.isCleanWorktree === true ? "" : " M file.ts\n";
			return ok(this.statusCalls === 1 ? firstStatus : "");
		}
		if (command === "git" && args[0] === "diff" && args[1] === "HEAD^") {
			return ok("diff --git a/file.ts b/file.ts\n+committed\n");
		}
		if (command === "git" && args[0] === "diff") {
			return ok("diff --git a/file.ts b/file.ts\n+pending\n");
		}
		if (command === "git" && args[0] === "ls-files") {
			return ok("");
		}
		if (command === "git" && args[0] === "check-ref-format") {
			return ok();
		}
		if (command === "git" && args[0] === "show-ref") {
			return { code: 1, stdout: "", stderr: "", killed: false };
		}
		if (command === "git" && args[0] === "stash" && args[1] === "push") {
			this.stashMessage = args.at(-1) ?? "";
			return ok("Saved working directory\n");
		}
		if (command === "git" && args[0] === "stash" && args[1] === "list") {
			return ok(`stash@{0}\0On ${this.sourceBranch}: ${this.stashMessage}\n`);
		}
		if (command === "git" && args[0] === "stash" && args[1] === "pop") {
			return ok("restored\n");
		}
		if (command === "gt" && args[0] === "trunk") {
			return ok("master\n");
		}
		if (command === "gt" && args[0] === "children") {
			return ok("");
		}
		if (command === "gt" && args[0] === "create") {
			if (this.options.shouldGtCreateFail === true) {
				return fail("gt create failed");
			}
			this.currentBranch = args[1] ?? this.currentBranch;
			return ok("created\n");
		}
		if (command === "git" && args[0] === "branch" && args[1] === "--show-current") {
			return ok(`${this.currentBranch}\n`);
		}
		if (command === "git" && args[0] === "branch" && args[1] === "-D") {
			return ok("deleted\n");
		}
		if (command === "git" && args[0] === "branch") {
			return ok();
		}
		if (command === "git" && args[0] === "for-each-ref") {
			if (this.options.upstreamMode === "contains") {
				return ok(`origin/${this.sourceBranch}\n`);
			}
			return ok("");
		}
		if (command === "git" && args[0] === "merge-base") {
			return this.options.upstreamMode === "contains" ? ok() : { code: 1, stdout: "", stderr: "", killed: false };
		}
		if (command === "git" && args[0] === "rev-list") {
			return ok("abc123def456 parent987654\n");
		}
		if (command === "git" && args[0] === "log" && args.includes("--format=%B")) {
			return ok("Add latest commit support\n");
		}
		if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
			return ok(`${this.head}\n`);
		}
		if (command === "git" && args[0] === "reset" && args[1] === "--hard") {
			this.head = args[2] ?? this.head;
			return ok();
		}
		if (command === "git" && args[0] === "checkout") {
			this.currentBranch = args[1] ?? this.currentBranch;
			return ok();
		}
		if (command === "pi") {
			return ok("model-derived-branch\n");
		}
		return ok();
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

function ok(stdout = "", stderr = ""): ExecResult {
	return { code: 0, stdout, stderr, killed: false };
}

function fail(stderr: string, code = 1): ExecResult {
	return { code, stdout: "", stderr, killed: false };
}

function output(run: Pick<CliRun, "stdout" | "stderr">): { stdout: string; stderr: string } {
	return { stdout: run.stdout.join(""), stderr: run.stderr.join("") };
}

function eventIndex(events: readonly string[], prefix: string): number {
	return events.findIndex((event) => event.startsWith(prefix));
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
		expect(output(detached).stderr).toContain("Detached HEAD; check out a branch before running /code:autobranch.");

		const graphite = runWithFakes(["exec", "autobranch", "--slug", "failed branch"], { shouldGtCreateFail: true });
		expect(await graphite.exit).toBe(1);
		expect(output(graphite).stdout).toBe("");
		expect(output(graphite).stderr).toContain("Failed to create Graphite branch failed-branch.");
		expect(output(graphite).stderr).toContain("Restored pending changes to the original branch.");
	});
});
