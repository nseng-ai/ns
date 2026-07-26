import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { commandSucceeded, formatCommandFailure, runCommand } from "@nseng-ai/foundation/exec";

import { runNsCli } from "../../src/cli/index.ts";
import { writeModuleExtension } from "../support/cli-harness.ts";

const tempDirs: string[] = [];

async function createEmptyProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-cli-host-"));
	tempDirs.push(directory);
	return await realpath(directory);
}

async function initializeGitRepo(projectRoot: string): Promise<void> {
	const initialized = await runCommand("git", ["init", "--initial-branch=main"], {
		cwd: projectRoot,
	});
	if (!commandSucceeded(initialized)) {
		throw new Error(formatCommandFailure("git init failed", "git init", initialized));
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
		throw new Error(formatCommandFailure("git commit failed", "git commit", committed));
	}
}

async function runNsCliJson(args: readonly string[], cwd: string) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const homeDir = join(cwd, ".home");
	const exit = await runNsCli([...args, "--format", "json"], {
		cwd,
		homeDir,
		env: { HOME: homeDir, CLAUDE_CONFIG_DIR: join(cwd, ".claude-user") },
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	return { exit, stdout: stdout.join(""), stderr: stderr.join("") };
}

function parseJsonOutput(run: { stdout: string }): Record<string, unknown> {
	const parsed: unknown = JSON.parse(run.stdout);
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("Expected JSON object output.");
	}
	return parsed as Record<string, unknown>;
}

function dataFromEnvelope(envelope: Record<string, unknown>): Record<string, unknown> {
	const data = envelope.data;
	if (typeof data !== "object" || data === null) {
		throw new Error("Expected envelope data object.");
	}
	return data as Record<string, unknown>;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("ns CLI host integration", () => {
	test("updates one declared extension and reconciles artifacts from a git-root subdirectory", async () => {
		const projectRoot = await createEmptyProject();
		await initializeGitRepo(projectRoot);
		await mkdir(join(projectRoot, "nested"), { recursive: true });
		await writeFile(
			join(projectRoot, "ns.toml"),
			'harnesses = ["pi"]\nextensions = ["./extensions/acme-module"]\n',
			"utf8",
		);
		await writeModuleExtension(projectRoot);
		const cwd = join(projectRoot, "nested");

		const installed = await runNsCliJson(["extension", "update", "./extensions/acme-module"], cwd);
		const installedData = dataFromEnvelope(parseJsonOutput(installed));
		const moduleTarget = join(projectRoot, ".pi", "skills", "module-skill", "SKILL.md");
		const manifestPath = join(projectRoot, ".pi", "skills", ".ns-harness-artifacts-manifest.json");

		expect(installed.exit).toBe(0);
		expect(installed.stderr).toBe("");
		expect(installedData).toMatchObject({
			mode: "applied",
			acquisitionIntent: "local-in-place",
			acquisitionOutcome: "not-applicable",
		});
		expect(installedData.steps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "acquisition-decided", outcome: "not-applicable" }),
				expect.objectContaining({ type: "artifact-completed", action: "installed" }),
			]),
		);
		const installedCompleted = installedData.completed as Record<string, unknown>;
		expect(installedCompleted.artifacts).toEqual([
			expect.objectContaining({ skillName: "module-skill", action: "installed" }),
		]);
		expect(await readFile(moduleTarget, "utf8")).toBe("# module skill\n");
		const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
		expect(manifest).toMatchObject({
			version: 1,
			artifacts: {
				"pi:project:skill:@acme/module:module-skill": {
					artifactId: "@acme/module:module-skill",
					provisionName: "module-skill",
				},
			},
		});

		const rerun = await runNsCliJson(["extension", "update", "./extensions/acme-module"], cwd);
		const rerunData = dataFromEnvelope(parseJsonOutput(rerun));
		expect(rerun.exit).toBe(0);
		const rerunCompleted = rerunData.completed as Record<string, unknown>;
		expect(rerunCompleted.artifacts).toEqual([
			expect.objectContaining({ skillName: "module-skill", action: "unchanged" }),
		]);

		const humanStdout: string[] = [];
		const humanStderr: string[] = [];
		const humanExit = await runNsCli(
			["extension", "update", "./extensions/acme-module", "--dry-run"],
			{
				cwd,
				homeDir: join(projectRoot, ".home"),
				env: { HOME: join(projectRoot, ".home") },
				stdout: (text) => humanStdout.push(text),
				stderr: (text) => humanStderr.push(text),
			},
		);
		expect(humanExit).toBe(0);
		expect(humanStdout.join("")).toContain("Planned local-in-place");
		expect(humanStderr.join("")).toContain("Effect: dry run; no writes performed");

		const markdownStdout: string[] = [];
		const markdownStderr: string[] = [];
		const markdownExit = await runNsCli(
			["extension", "update", "./extensions/acme-module", "--dry-run", "--format", "markdown"],
			{
				cwd,
				homeDir: join(projectRoot, ".home"),
				env: { HOME: join(projectRoot, ".home") },
				stdout: (text) => markdownStdout.push(text),
				stderr: (text) => markdownStderr.push(text),
			},
		);
		expect(markdownExit).toBe(0);
		expect(markdownStderr.join("")).toBe("");
		expect(markdownStdout.join("")).toContain("# ns extension update");
		expect(markdownStdout.join("")).toContain("no writes were performed");

		await writeFile(moduleTarget, "local edit\n", "utf8");
		await writeFile(
			join(projectRoot, "extensions", "acme-module", "skills", "module-skill", "SKILL.md"),
			"# module skill v2\n",
			"utf8",
		);
		const refused = await runNsCliJson(["extension", "update", "./extensions/acme-module"], cwd);
		const refusedEnvelope = parseJsonOutput(refused);
		expect(refused.exit).toBe(2);
		expect(refusedEnvelope).toMatchObject({
			status: "failure",
			errorType: "ns-extension-update-preflight-failed",
			exitCode: 2,
			data: {
				steps: expect.arrayContaining([
					expect.objectContaining({ type: "failure", phase: "activation-preflight" }),
				]),
			},
		});
		expect(await readFile(moduleTarget, "utf8")).toBe("local edit\n");

		await writeFile(moduleTarget, "# module skill\n", "utf8");
		const recovered = await runNsCliJson(["extension", "update", "./extensions/acme-module"], cwd);
		expect(recovered.exit).toBe(0);
		expect(await readFile(moduleTarget, "utf8")).toBe("# module skill v2\n");
	});
});
