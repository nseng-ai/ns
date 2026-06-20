import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeRunner } from "../support/fake-runner.ts";
import { runScenario } from "../support/run-scenario.ts";
import { runCli } from "../../src/cli.ts";
import { RealVibechkGitGateway } from "../../src/git.ts";
import { RunnerRegistry } from "../../src/runners.ts";

describe("vibechk run real git integration", () => {
	let storeRoot: string;
	let tmpRoot: string;

	beforeEach(async () => {
		tmpRoot = await mkdtemp(join(tmpdir(), "vibechk-run-real-git-"));
		storeRoot = join(tmpRoot, "store");
		await mkdir(join(tmpRoot, "repo"), { recursive: true });
	});

	afterEach(async () => {
		await rm(tmpRoot, { recursive: true, force: true });
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
				gitGatewayFactory: (workdir) => new RealVibechkGitGateway(workdir),
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
});

function git(args: readonly string[], cwd?: string): string {
	const result = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
	});
	expect(result.status, result.stderr).toBe(0);
	return result.stdout.trim();
}
