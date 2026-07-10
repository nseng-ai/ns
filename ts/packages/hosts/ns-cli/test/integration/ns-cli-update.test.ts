import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { commandSucceeded, formatCommandFailure, runCommand } from "@nseng-ai/foundation/exec";

import { runNsCli } from "../../src/cli.ts";
import { writeModuleExtension } from "../support/cli-harness.ts";

const tempDirs: string[] = [];

async function createEmptyProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-cli-host-"));
	tempDirs.push(directory);
	return directory;
}

async function initializeGitRepo(projectRoot: string): Promise<void> {
	const result = await runCommand("git", ["init"], { cwd: projectRoot });
	if (!commandSucceeded(result)) {
		throw new Error(formatCommandFailure("git init failed", "git init", result));
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
	test("updates module and first-party artifacts from a git-root subdirectory", async () => {
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

		const installed = await runNsCliJson(["update", "--extensions"], cwd);
		const installedData = dataFromEnvelope(parseJsonOutput(installed));
		const moduleTarget = join(projectRoot, ".pi", "skills", "module-skill", "SKILL.md");
		const objectiveTarget = join(projectRoot, ".pi", "skills", "objective", "SKILL.md");
		const manifestPath = join(projectRoot, ".pi", "skills", ".ns-harness-artifacts-manifest.json");
		const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;

		expect(installed.exit).toBe(0);
		expect(installedData).toMatchObject({ mode: "applied", isForceRequired: false });
		expect(installedData.artifacts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ skillName: "module-skill", action: "installed" }),
				expect.objectContaining({ skillName: "objective", action: "installed" }),
			]),
		);
		expect(await readFile(moduleTarget, "utf8")).toBe("# module skill\n");
		expect(await readFile(objectiveTarget, "utf8")).toContain("# objective");
		expect(manifest).toMatchObject({
			version: 1,
			artifacts: {
				"pi:project:skill:@acme/module:module-skill": {
					artifactId: "@acme/module:module-skill",
					provisionName: "module-skill",
				},
				"pi:project:skill:objective-skill": {
					artifactId: "objective-skill",
					provisionName: "objective",
				},
			},
		});

		const rerun = await runNsCliJson(["update", "--extensions"], cwd);
		const rerunData = dataFromEnvelope(parseJsonOutput(rerun));
		expect(rerun.exit).toBe(0);
		expect(rerunData.artifacts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ skillName: "module-skill", action: "unchanged" }),
				expect.objectContaining({ skillName: "objective", action: "unchanged" }),
			]),
		);

		await writeFile(objectiveTarget, "local edit\n", "utf8");
		await writeFile(
			join(projectRoot, "extensions", "acme-module", "skills", "module-skill", "SKILL.md"),
			"# module skill v2\n",
			"utf8",
		);
		const refused = await runNsCliJson(["update", "--extensions"], cwd);
		const refusedEnvelope = parseJsonOutput(refused);
		expect(refused.exit).toBe(1);
		expect(refusedEnvelope).toMatchObject({ status: "negative", exitCode: 1 });
		expect(dataFromEnvelope(refusedEnvelope)).toMatchObject({
			mode: "dry-run",
			isForceRequired: true,
		});
		expect(dataFromEnvelope(refusedEnvelope).artifacts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ skillName: "module-skill", action: "refreshed" }),
				expect.objectContaining({ skillName: "objective", action: "conflicted" }),
			]),
		);
		expect(await readFile(moduleTarget, "utf8")).toBe("# module skill\n");
		expect(await readFile(objectiveTarget, "utf8")).toBe("local edit\n");

		const forced = await runNsCliJson(["update", "--extensions", "--force"], cwd);
		expect(forced.exit).toBe(0);
		expect(await readFile(moduleTarget, "utf8")).toBe("# module skill v2\n");
		expect(await readFile(objectiveTarget, "utf8")).toContain("# objective");
	});
});
