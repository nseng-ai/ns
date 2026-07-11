import { describe, expect, it } from "vitest";

import { exitedResult, parseJsonOutput, runScenario } from "./run-scenario.ts";

const BASE_FILES = {
	"/repo/ts/packages/hosts/ns-cli/package.json": JSON.stringify({
		name: "@nseng-ai/ns",
		version: "0.4.0",
	}),
	"/repo/ts/packages/hosts/ns-cli/dist/publish/package.json": JSON.stringify({
		name: "@nseng-ai/ns",
		version: "0.4.0",
	}),
};

describe("create-local-ns-project", () => {
	it("requires --ns-worktree", async () => {
		const run = runScenario(["create-local-ns-project", "--format", "json"], { files: BASE_FILES });
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "usageError",
			data: { argument: "--ns-worktree" },
		});
	});

	it("refuses existing destinations unless --force is supplied", async () => {
		const run = runScenario(
			[
				"create-local-ns-project",
				"--ns-worktree",
				"/repo",
				"--parent",
				"/tmp/projects",
				"--name",
				"demo",
				"--format",
				"json",
			],
			{
				files: BASE_FILES,
				existingPaths: ["/tmp/projects/demo"],
			},
		);
		expect(await run.exit).toBe(2);
		expect(run.calls).toEqual([]);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "usageError",
			data: { argument: "--force", projectPath: "/tmp/projects/demo" },
		});
	});

	it("creates a project with default timestamp name and skips verification when requested", async () => {
		const run = runScenario(
			[
				"create-local-ns-project",
				"--ns-worktree",
				"/repo",
				"--parent",
				"/tmp/projects",
				"--skip-verify",
				"--format",
				"json",
			],
			{
				files: BASE_FILES,
			},
		);
		expect(await run.exit).toBe(0);
		expect(run.calls).toEqual([
			{
				command: "pnpm",
				args: ["--dir", "/repo/ts", "--filter", "@nseng-ai/ns", "run", "pack:local"],
				cwd: "/repo",
			},
			{
				command: "git",
				args: ["init", "-b", "main", "."],
				cwd: "/tmp/projects/ns-local-project-20260102030405",
			},
			{
				command: "npm",
				args: ["init", "-y"],
				cwd: "/tmp/projects/ns-local-project-20260102030405",
			},
			{
				command: "npm",
				args: ["install", "--save-dev", "/repo/ts/packages/hosts/ns-cli/dist/publish"],
				cwd: "/tmp/projects/ns-local-project-20260102030405",
			},
			{
				command: "git",
				args: ["add", ".gitignore", "README.md", "package.json", "package-lock.json"],
				cwd: "/tmp/projects/ns-local-project-20260102030405",
			},
			{
				command: "git",
				args: ["commit", "-m", "Initial commit"],
				cwd: "/tmp/projects/ns-local-project-20260102030405",
			},
		]);
		expect(run.fs.writtenFiles).toContainEqual({
			path: "/tmp/projects/ns-local-project-20260102030405/.gitignore",
			content: [
				"node_modules/",
				"dist/",
				"coverage/",
				".ns/managed-extensions/",
				".npm/",
				"npm-debug.log*",
				"yarn-debug.log*",
				"yarn-error.log*",
				"pnpm-debug.log*",
				".DS_Store",
				".env",
				".env.*",
				"",
			].join("\n"),
		});
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				projectName: "ns-local-project-20260102030405",
				verification: "skipped",
				nsPackageVersion: "0.4.0",
			},
		});
	});

	it("runs verification commands and renders human next steps", async () => {
		const run = runScenario(
			[
				"create-local-ns-project",
				"--ns-worktree",
				"/repo",
				"--parent",
				"/tmp/projects",
				"--name",
				"demo",
			],
			{
				files: BASE_FILES,
			},
		);
		expect(await run.exit).toBe(0);
		expect(run.calls.slice(-4)).toEqual([
			{ command: "npx", args: ["ns", "--help"], cwd: "/tmp/projects/demo" },
			{ command: "npx", args: ["ns", "init", "--help"], cwd: "/tmp/projects/demo" },
			{ command: "npx", args: ["ns", "skills", "list"], cwd: "/tmp/projects/demo" },
			{ command: "npx", args: ["ns", "extension", "points"], cwd: "/tmp/projects/demo" },
		]);
		const stdout = run.stdout.join("");
		expect(stdout).toContain("Ready: /tmp/projects/demo");
		expect(stdout).toContain("npx ns init --harness claude-code");
	});

	it("reports the failed verification command", async () => {
		const commandResults = Array.from({ length: 6 }, () => exitedResult());
		commandResults.push(exitedResult({ stderr: "bad ns", code: 9 }));
		const run = runScenario(
			[
				"create-local-ns-project",
				"--ns-worktree",
				"/repo",
				"--parent",
				"/tmp/projects",
				"--name",
				"demo",
				"--format",
				"json",
			],
			{
				files: BASE_FILES,
				commandResults,
			},
		);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "verification-failed",
			data: {
				failedCommand: { command: "npx", args: ["ns", "--help"], cwd: "/tmp/projects/demo" },
			},
		});
	});
});
