import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { commandSucceeded, runCommand } from "@nseng-ai/foundation/exec";
import { runNsCli } from "../../src/cli/index.ts";
import { createEmptyProject, parseJsonOutput, runNsCliJson } from "../support/cli-harness.ts";

describe("extension install host integration", () => {
	test("maps real non-Git repository detection through the host context", async () => {
		const cwd = await createEmptyProject();

		const run = await runNsCliJson(["extension", "list"], cwd);

		expect(run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "ns-extension-list-not-a-git-repo",
			data: { diagnostics: [{ code: "not-a-git-repo" }] },
		});
	});

	test("streams ns init lifecycle trace separately from its final human result", async () => {
		const cwd = await createEmptyProject();
		await initializeGitRepo(cwd);
		const stdout: string[] = [];
		const stderr: string[] = [];
		const exit = await runNsCli(["init"], {
			cwd,
			homeDir: join(cwd, ".home"),
			env: { HOME: join(cwd, ".home") },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});
		expect(exit).toBe(0);
		expect(stderr.join("")).toContain("[repository-preflight] started");
		expect(stderr.join("")).toContain("File: ns.toml created");
		expect(stdout.join("")).toContain("Activated ns in");

		const json = await runNsCliJson(["init"], cwd);
		expect(json.exit).toBe(0);
		expect(json.stderr).toBe("");
		expect(parseJsonOutput(json)).toMatchObject({
			status: "success",
			data: { steps: expect.arrayContaining([expect.objectContaining({ type: "phase" })]) },
		});

		const markdownStdout: string[] = [];
		const markdownStderr: string[] = [];
		const markdownExit = await runNsCli(["init", "--format", "md"], {
			cwd,
			homeDir: join(cwd, ".home"),
			env: { HOME: join(cwd, ".home") },
			stdout: (text) => markdownStdout.push(text),
			stderr: (text) => markdownStderr.push(text),
		});
		expect(markdownExit).toBe(0);
		expect(markdownStderr.join("")).toBe("");
		expect(markdownStdout.join("")).toContain("# ns init");
		expect(markdownStdout.join("")).toContain("## Lifecycle history");
	});
});

async function initializeGitRepo(projectRoot: string): Promise<void> {
	const initialized = await runCommand("git", ["init", "--initial-branch=main"], {
		cwd: projectRoot,
	});
	if (!commandSucceeded(initialized)) {
		throw new Error(`git init failed: ${initialized.stderr || initialized.stdout}`);
	}
	const committed = await runCommand(
		"git",
		[
			"-c",
			"user.name=ns tests",
			"-c",
			"user.email=ns-tests@example.invalid",
			"commit",
			"--allow-empty",
			"-m",
			"initialize test repository",
		],
		{ cwd: projectRoot },
	);
	if (!commandSucceeded(committed)) {
		throw new Error(`git commit failed: ${committed.stderr || committed.stdout}`);
	}
	const cachedRemoteHead = await runCommand(
		"git",
		["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"],
		{ cwd: projectRoot },
	);
	if (!commandSucceeded(cachedRemoteHead)) {
		throw new Error(
			`git symbolic-ref for cached origin HEAD failed: ${cachedRemoteHead.stderr || cachedRemoteHead.stdout}`,
		);
	}
}
