import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runScenario } from "../support/run-scenario.ts";
import { FakeRunner } from "../support/fake-runner.ts";
import { FakeGitGateway } from "../support/fake-git-gateway.ts";
import { runCli } from "../../src/cli.ts";
import { RealGitGateway } from "../../src/git.ts";
import { RunnerRegistry } from "../../src/runners.ts";

describe("vibechk run command", () => {
	let storeRoot: string;
	let tmpRoot: string;

	beforeEach(async () => {
		tmpRoot = await mkdtemp(join(tmpdir(), "vibechk-run-test-"));
		storeRoot = join(tmpRoot, "store");
		await mkdir(join(tmpRoot, "workdir"), { recursive: true });
		await mkdir(join(tmpRoot, "baseline"), { recursive: true });
		await mkdir(join(tmpRoot, "treatment"), { recursive: true });
	});

	afterEach(async () => {
		await rm(tmpRoot, { recursive: true, force: true });
	});

	it("successful run writes bundle, prints run id, and can be shown", async () => {
		const planPath = join(tmpRoot, "plan.md");
		await writeFile(planPath, "# Plan\n\nDo the thing.\n", "utf-8");

		const fakeRunner = new FakeRunner({
			changesByWorkdir: { workdir: "result content\n" },
			metricsByWorkdir: { workdir: { wallTimeSeconds: 1.5, totalTokens: 100 } },
		});

		const fakeGit = new FakeGitGateway({
			repoRoot: "/tmp/repo",
			currentBranch: "main",
			currentCommit: "abc123",
			isClean: true,
			hasChanges: false,
		});

		// Set changes after runner executes
		fakeGit.setHasChanges(true);
		fakeGit.setDiffPatch("diff --git a/result.txt b/result.txt\n+result content\n");

		const stdout: string[] = [];
		const stderr: string[] = [];
		const ids = ["testrun1"];
		let idIndex = 0;

		const exitCode = await runCli(
			[
				"run",
				"--plan",
				planPath,
				"--workdir",
				join(tmpRoot, "workdir"),
				"--runner",
				"fake",
				"--store",
				storeRoot,
			],
			{
				cwd: tmpRoot,
				env: { HOME: "/home/tester" },
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
				runnerRegistry: new RunnerRegistry([fakeRunner]),
				gitGatewayFactory: () => fakeGit,
				clock: () => new Date("2026-05-23T12:00:00Z"),
				idGenerator: () => ids[idIndex++] ?? "fallback",
				defaultRunnerName: "fake",
			},
		);

		expect(exitCode).toBe(0);
		expect(stdout.join("")).toContain("Run ID: testrun1");
		expect(fakeGit.getCreatedBranches()).toEqual(["vibechk/testrun1"]);
		expect(fakeGit.getCheckoutHistory()).toEqual(["main"]);

		const showRun = runScenario(["show", "testrun1", "--store", storeRoot]);
		expect(await showRun.exit).toBe(0);
		const showOutput = showRun.stdout.join("");
		expect(showOutput).toContain("# Vibechk Run `testrun1`");
		expect(showOutput).toContain("- Status: success");
		expect(showOutput).toContain("- Runner: fake");
		expect(showOutput).toContain("| Wall time seconds | 1.5 |");
		expect(showOutput).toContain("| Total tokens | 100 |");
		expect(showOutput).toContain("Do the thing.");
		expect(showOutput).toContain("fake transcript for workdir");
		expect(showOutput).toContain("+result content");
	});

	it("runner failure persists bundle and returns non-zero exit code", async () => {
		const planPath = join(tmpRoot, "plan.md");
		await writeFile(planPath, "# Plan\n", "utf-8");

		const fakeRunner = new FakeRunner({
			exitCode: 7,
			changesByWorkdir: { workdir: "failed output\n" },
		});

		const fakeGit = new FakeGitGateway({
			currentBranch: "main",
			isClean: true,
		});

		fakeGit.setHasChanges(true);
		fakeGit.setDiffPatch("diff --git a/result.txt b/result.txt\n+failed output\n");

		const stdout: string[] = [];
		const stderr: string[] = [];

		const exitCode = await runCli(
			[
				"run",
				"--plan",
				planPath,
				"--workdir",
				join(tmpRoot, "workdir"),
				"--runner",
				"fake",
				"--store",
				storeRoot,
			],
			{
				cwd: tmpRoot,
				env: { HOME: "/home/tester" },
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
				runnerRegistry: new RunnerRegistry([fakeRunner]),
				gitGatewayFactory: () => fakeGit,
				clock: () => new Date("2026-05-23T12:00:00Z"),
				idGenerator: () => "failedrun",
				defaultRunnerName: "fake",
			},
		);

		expect(exitCode).toBe(7);
		expect(stdout.join("")).toContain("Run ID: failedrun");

		const showRun = runScenario(["show", "failedrun", "--store", storeRoot]);
		expect(await showRun.exit).toBe(0);
		const showOutput = showRun.stdout.join("");
		expect(showOutput).toContain("- Status: failed");
		expect(showOutput).toContain("fake transcript for workdir");
		expect(showOutput).toContain("+failed output");
	});

	it("no-change run skips branch creation and records null result_branch", async () => {
		const planPath = join(tmpRoot, "plan.md");
		await writeFile(planPath, "# Plan\n", "utf-8");

		const fakeRunner = new FakeRunner({});

		const fakeGit = new FakeGitGateway({
			currentBranch: "main",
			isClean: true,
			hasChanges: false,
			diffPatch: "",
		});

		const stdout: string[] = [];
		const stderr: string[] = [];

		const exitCode = await runCli(
			[
				"run",
				"--plan",
				planPath,
				"--workdir",
				join(tmpRoot, "workdir"),
				"--runner",
				"fake",
				"--store",
				storeRoot,
			],
			{
				cwd: tmpRoot,
				env: { HOME: "/home/tester" },
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
				runnerRegistry: new RunnerRegistry([fakeRunner]),
				gitGatewayFactory: () => fakeGit,
				clock: () => new Date("2026-05-23T12:00:00Z"),
				idGenerator: () => "nochange",
				defaultRunnerName: "fake",
			},
		);

		expect(exitCode).toBe(0);
		expect(fakeGit.getCreatedBranches()).toEqual([]);
		expect(fakeGit.getCheckoutHistory()).toEqual([]);

		const showRun = runScenario(["show", "nochange", "--store", storeRoot]);
		expect(await showRun.exit).toBe(0);
		const showOutput = showRun.stdout.join("");
		expect(showOutput).toContain("- Status: success");
		expect(showOutput).toContain("- Result branch: null");
	});

	it("real git run creates a result branch and switches back", async () => {
		const repo = join(tmpRoot, "repo");
		git(["init", "-b", "main", repo]);
		git(["config", "user.email", "vibechk@example.com"], repo);
		git(["config", "user.name", "Vibechk Test"], repo);
		await writeFile(join(repo, "README.md"), "# Repo\n", "utf-8");
		git(["add", "README.md"], repo);
		git(["commit", "-m", "Initial commit"], repo);

		const planPath = join(tmpRoot, "plan.md");
		await writeFile(planPath, "# Plan\n", "utf-8");
		const fakeRunner = new FakeRunner({ changesByWorkdir: { repo: "real git output\n" } });
		const stdout: string[] = [];
		const stderr: string[] = [];

		const exitCode = await runCli(
			["run", "--plan", planPath, "--workdir", repo, "--runner", "fake", "--store", storeRoot],
			{
				cwd: tmpRoot,
				env: { HOME: "/home/tester" },
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
				runnerRegistry: new RunnerRegistry([fakeRunner]),
				gitGatewayFactory: (workdir) => new RealGitGateway(workdir),
				clock: () => new Date("2026-05-23T12:00:00Z"),
				idGenerator: () => "RealRun1",
				defaultRunnerName: "fake",
			},
		);

		expect(exitCode, stderr.join("")).toBe(0);
		expect(stdout.join("")).toContain("Run ID: realrun1");
		expect(git(["branch", "--show-current"], repo)).toBe("main");
		expect(git(["status", "--short"], repo)).toBe("");
		expect(git(["show", "vibechk/realrun1:result.txt"], repo)).toBe("real git output");

		const showRun = runScenario(["show", "realrun1", "--store", storeRoot]);
		expect(await showRun.exit).toBe(0);
		expect(showRun.stdout.join("")).toContain("- Result branch: vibechk/realrun1");
		expect(showRun.stdout.join("")).toContain("+real git output");
	});

	it("dirty workdir rejection before runner", async () => {
		const planPath = join(tmpRoot, "plan.md");
		await writeFile(planPath, "# Plan\n", "utf-8");

		const fakeRunner = new FakeRunner({});
		const fakeGit = new FakeGitGateway({
			currentBranch: "main",
			isClean: false,
		});

		const stdout: string[] = [];
		const stderr: string[] = [];

		const exitCode = await runCli(
			[
				"run",
				"--plan",
				planPath,
				"--workdir",
				join(tmpRoot, "workdir"),
				"--runner",
				"fake",
				"--store",
				storeRoot,
			],
			{
				cwd: tmpRoot,
				env: { HOME: "/home/tester" },
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
				runnerRegistry: new RunnerRegistry([fakeRunner]),
				gitGatewayFactory: () => fakeGit,
				clock: () => new Date("2026-05-23T12:00:00Z"),
				idGenerator: () => "shouldnotrun",
				defaultRunnerName: "fake",
			},
		);

		expect(exitCode).toBe(1);
		expect(stderr.join("")).toContain("has uncommitted changes");
		expect(stderr.join("")).toContain("requires a clean workdir");

		// Verify no bundle was created
		const listRun = runScenario(["runs", "--store", storeRoot]);
		expect(await listRun.exit).toBe(0);
		expect(listRun.stdout.join("")).toContain("No vibechk runs found");
	});

	it("full walking skeleton: run, show, diff", async () => {
		const planPath = join(tmpRoot, "plan.md");
		await writeFile(planPath, "# Plan\n\nWrite the result file.\n", "utf-8");

		const fakeRunner = new FakeRunner({
			changesByWorkdir: {
				baseline: "baseline result\n",
				treatment: "treatment result\n",
			},
			metricsByWorkdir: {
				baseline: { wallTimeSeconds: 1.0, totalTokens: 10, costUsd: 0.1 },
				treatment: { wallTimeSeconds: 2.5, totalTokens: 13, costUsd: 0.15 },
			},
		});

		const ids = ["aaaabbbb", "ccccdddd"];
		let idIndex = 0;
		const timestamps = [new Date("2026-05-23T12:00:00Z"), new Date("2026-05-23T12:00:01Z")];
		let timeIndex = 0;

		const runBaseline = async (): Promise<number> => {
			const fakeGit = new FakeGitGateway({ currentBranch: "main", isClean: true });
			fakeGit.setHasChanges(true);
			fakeGit.setDiffPatch("diff --git a/result.txt b/result.txt\n+baseline result\n");

			const stdout: string[] = [];
			const stderr: string[] = [];

			return await runCli(
				[
					"run",
					"--plan",
					planPath,
					"--workdir",
					join(tmpRoot, "baseline"),
					"--runner",
					"fake",
					"--store",
					storeRoot,
				],
				{
					cwd: tmpRoot,
					env: { HOME: "/home/tester" },
					stdout: (text) => stdout.push(text),
					stderr: (text) => stderr.push(text),
					runnerRegistry: new RunnerRegistry([fakeRunner]),
					gitGatewayFactory: () => fakeGit,
					clock: () => timestamps[timeIndex++] ?? new Date(),
					idGenerator: () => ids[idIndex++] ?? "fallback",
					defaultRunnerName: "fake",
				},
			);
		};

		const runTreatment = async (): Promise<number> => {
			const fakeGit = new FakeGitGateway({ currentBranch: "main", isClean: true });
			fakeGit.setHasChanges(true);
			fakeGit.setDiffPatch("diff --git a/result.txt b/result.txt\n+treatment result\n");

			const stdout: string[] = [];
			const stderr: string[] = [];

			return await runCli(
				[
					"run",
					"--plan",
					planPath,
					"--workdir",
					join(tmpRoot, "treatment"),
					"--runner",
					"fake",
					"--store",
					storeRoot,
				],
				{
					cwd: tmpRoot,
					env: { HOME: "/home/tester" },
					stdout: (text) => stdout.push(text),
					stderr: (text) => stderr.push(text),
					runnerRegistry: new RunnerRegistry([fakeRunner]),
					gitGatewayFactory: () => fakeGit,
					clock: () => timestamps[timeIndex++] ?? new Date(),
					idGenerator: () => ids[idIndex++] ?? "fallback",
					defaultRunnerName: "fake",
				},
			);
		};

		expect(await runBaseline()).toBe(0);
		expect(await runTreatment()).toBe(0);

		const showRun = runScenario(["show", "aaaabbbb", "--store", storeRoot]);
		expect(await showRun.exit).toBe(0);
		const showOutput = showRun.stdout.join("");
		expect(showOutput).toContain("# Vibechk Run `aaaabbbb`");
		expect(showOutput).toContain("- Status: success");
		expect(showOutput).toContain("| Wall time seconds | 1 |");
		expect(showOutput).toContain("+baseline result");

		const diffRun = runScenario(["diff", "aaaabbbb", "ccccdddd", "--store", storeRoot]);
		expect(await diffRun.exit).toBe(0);
		const diffOutput = diffRun.stdout.join("");
		expect(diffOutput).toContain("# Vibechk Comparison");
		expect(diffOutput).toContain("Baseline: `aaaabbbb`");
		expect(diffOutput).toContain("Treatment: `ccccdddd`");
		expect(diffOutput).toContain("## Baseline Diff");
		expect(diffOutput).toContain("+baseline result");
		expect(diffOutput).toContain("## Treatment Diff");
		expect(diffOutput).toContain("+treatment result");
	});
});

function git(args: readonly string[], cwd?: string): string {
	const result = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
	});
	expect(result.status, result.stderr).toBe(0);
	return result.stdout.trim();
}
