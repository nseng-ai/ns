import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { commandSucceeded, runCommand } from "@nseng-ai/foundation/exec";
import { installExtensionResultSchema } from "../../src/init/index.ts";
import { nsExtensionInstallCommand } from "../../src/init/ns/commands/extension-install.ts";
import { nsExtensionUninstallCommand } from "../../src/init/ns/commands/extension-uninstall.ts";

import { runNsCli } from "../../src/cli/index.ts";
import {
	createEmptyProject,
	parseJsonOutput,
	runNsCliJson,
	writeModuleExtension,
} from "../support/cli-harness.ts";

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
		const exit = await runNsCli(["init", "--harness", "pi"], {
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
			status: "ok",
			data: { steps: expect.arrayContaining([expect.objectContaining({ type: "phase" })]) },
		});

		const markdownStdout: string[] = [];
		const markdownStderr: string[] = [];
		const markdownExit = await runNsCli(["init", "--format", "markdown"], {
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

	test("imports a full local descriptor, reconciles artifacts, and reports idempotence", async () => {
		expect(nsExtensionInstallCommand.name).toBe("install");
		const cwd = await createEmptyProject();
		await initializeGitRepo(cwd);
		await writeFile(join(cwd, "ns.toml"), 'harnesses = ["pi"]\n', "utf8");
		await writeModuleExtension(cwd);

		const installed = await runNsCliJson(["extension", "install", "./extensions/acme-module"], cwd);
		expect(installed.exit).toBe(0);
		const installedJson = parseJsonOutput(installed);
		expect(installedJson).toMatchObject({
			status: "ok",
			exitCode: 0,
			data: {
				sourceSpec: "./extensions/acme-module",
				sourceKind: "local",
				packageName: "@acme/module",
				packageVersion: "1.0.0",
				isRecorded: true,
				harnesses: ["pi"],
			},
		});
		expect(installed.stderr).toBe("");
		const installedData = installExtensionResultSchema.parse(installedJson.data!);
		expect(installedData.steps.slice(0, 2)).toEqual([
			{ type: "phase", phase: "repository-preflight", status: "started" },
			expect.objectContaining({ type: "repository-resolved", repoRoot: cwd }),
		]);
		expect(await readFile(join(cwd, "ns.toml"), "utf8")).toContain(
			'extensions = ["./extensions/acme-module"]',
		);
		expect(await readFile(join(cwd, ".pi", "skills", "module-skill", "SKILL.md"), "utf8")).toBe(
			"# module skill\n",
		);

		const stdout: string[] = [];
		const stderr: string[] = [];
		const rerunExit = await runNsCli(["extension", "install", "./extensions/acme-module"], {
			cwd,
			homeDir: join(cwd, ".home"),
			env: { HOME: join(cwd, ".home") },
			stdout: (text: string) => stdout.push(text),
			stderr: (text: string) => stderr.push(text),
		});
		expect(rerunExit).toBe(0);
		expect(stdout.join("")).toContain("Ensured already-present @acme/module@1.0.0");
		expect(stdout.join("")).toContain("already present in");
		expect(stderr.join("")).toContain("[repository-preflight] started");
		expect(stderr.join("")).toContain("File: ns.toml unchanged");

		const markdownStdout: string[] = [];
		const markdownStderr: string[] = [];
		const markdownExit = await runNsCli(
			["extension", "install", "./extensions/acme-module", "--format", "markdown"],
			{
				cwd,
				homeDir: join(cwd, ".home"),
				env: { HOME: join(cwd, ".home") },
				stdout: (text) => markdownStdout.push(text),
				stderr: (text) => markdownStderr.push(text),
			},
		);
		expect(markdownExit).toBe(0);
		expect(markdownStderr.join("")).toBe("");
		expect(markdownStdout.join("")).toContain("# ns extension install");
		expect(markdownStdout.join("")).toContain("## Lifecycle history");

		const artifactPath = join(cwd, ".pi", "skills", "module-skill", "SKILL.md");
		await writeFile(artifactPath, "local edit\n");
		const conflicted = await runNsCliJson(
			["extension", "install", "./extensions/acme-module"],
			cwd,
		);
		expect(conflicted.exit).toBe(2);
		expect(parseJsonOutput(conflicted)).toMatchObject({
			status: "failure",
			errorType: "ns-extension-install-preflight-failed",
			data: { diagnostics: [{ code: "artifact-local-conflict" }], completed: {} },
		});
		expect(await readFile(artifactPath, "utf8")).toBe("local edit\n");
	});

	test("lists installed, conflicted, and missing extension state without changing bytes", async () => {
		const cwd = await createEmptyProject();
		await initializeGitRepo(cwd);
		await writeFile(join(cwd, "ns.toml"), 'harnesses = ["pi"]\n', "utf8");
		await writeModuleExtension(cwd);
		const source = "./extensions/acme-module";
		expect((await runNsCliJson(["extension", "install", source], cwd)).exit).toBe(0);
		const artifactPath = join(cwd, ".pi", "skills", "module-skill", "SKILL.md");
		const manifestPath = join(cwd, ".pi", "skills", ".ns-harness-artifacts-manifest.json");
		const before = {
			nsToml: await readFile(join(cwd, "ns.toml"), "utf8"),
			artifact: await readFile(artifactPath, "utf8"),
			manifest: await readFile(manifestPath, "utf8"),
		};

		const listed = await runNsCliJson(["extension", "list"], cwd);
		expect(listed.exit).toBe(0);
		expect(parseJsonOutput(listed)).toMatchObject({
			status: "ok",
			exitCode: 0,
			data: {
				repoRoot: cwd,
				configPath: join(cwd, "ns.toml"),
				extensions: [
					{
						sourceSpec: source,
						sourceKind: "local",
						packageName: "@acme/module",
						packageVersion: "1.0.0",
						acquisitionStatus: "installed",
						artifactStatus: "provisioned",
						artifactCount: 1,
						affectedArtifactCount: 0,
						diagnostics: [],
					},
				],
			},
		});
		const listedAgain = await runNsCliJson(["extension", "list"], cwd);
		expect({
			exit: listedAgain.exit,
			stdout: listedAgain.stdout,
			stderr: listedAgain.stderr,
		}).toEqual({
			exit: listed.exit,
			stdout: listed.stdout,
			stderr: listed.stderr,
		});
		expect(await readFile(join(cwd, "ns.toml"), "utf8")).toBe(before.nsToml);
		expect(await readFile(artifactPath, "utf8")).toBe(before.artifact);
		expect(await readFile(manifestPath, "utf8")).toBe(before.manifest);

		await writeFile(artifactPath, "customer edit\n", "utf8");
		const conflicted = await runNsCliJson(["extension", "list"], cwd);
		expect(conflicted.exit).toBe(0);
		expect(parseJsonOutput(conflicted)).toMatchObject({
			status: "ok",
			data: {
				extensions: [
					{
						acquisitionStatus: "installed",
						artifactStatus: "conflicted",
						artifactCount: 1,
						affectedArtifactCount: 1,
						diagnostics: [{ code: "artifact-local-conflict", path: artifactPath }],
					},
				],
			},
		});
		expect(await readFile(artifactPath, "utf8")).toBe("customer edit\n");

		await rm(join(cwd, "extensions", "acme-module"), { recursive: true });
		const missing = await runNsCliJson(["extension", "list"], cwd);
		expect(missing.exit).toBe(0);
		expect(parseJsonOutput(missing)).toMatchObject({
			status: "ok",
			data: {
				extensions: [
					{
						sourceSpec: source,
						acquisitionStatus: "missing",
						artifactStatus: "unavailable",
						diagnostics: [{ code: "extension-descriptor-package-missing" }],
					},
				],
			},
		});
	});

	test("uninstalls a local extension while preserving source and consumer data", async () => {
		expect(nsExtensionUninstallCommand.name).toBe("uninstall");
		const cwd = await createEmptyProject();
		await initializeGitRepo(cwd);
		await writeFile(join(cwd, "ns.toml"), 'harnesses = ["pi"]\n', "utf8");
		await writeModuleExtension(cwd);
		const source = "./extensions/acme-module";
		const installed = await runNsCliJson(["extension", "install", source], cwd);
		expect(installed.exit).toBe(0);
		await writeFile(join(cwd, ".ns", "acme-data", "customer.txt"), "preserve me\n", "utf8");
		await writeFile(join(cwd, ".pi", "skills", "module-skill", "notes.txt"), "untracked\n", "utf8");

		const stdout: string[] = [];
		const stderr: string[] = [];
		const exit = await runNsCli(["extension", "uninstall", source], {
			cwd,
			homeDir: join(cwd, ".home"),
			env: { HOME: join(cwd, ".home") },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});

		expect(exit).toBe(0);
		expect(stdout.join(" ")).toContain("Uninstalled identity local:");
		expect(stdout.join(" ")).toContain("Local extension bytes were left untouched");
		expect(stdout.join(" ")).toContain("consumer data was preserved");
		expect(stderr.join(" ")).toContain("[repository-preflight] started");
		expect(stderr.join(" ")).toContain("Preserved local-source");
		expect(await readFile(join(cwd, "ns.toml"), "utf8")).toContain("extensions = []");
		expect(await readFile(join(cwd, ".ns", "instructions.md"), "utf8")).not.toContain(
			"ACME module instructions",
		);
		await expect(
			readFile(join(cwd, ".pi", "skills", "module-skill", "SKILL.md"), "utf8"),
		).rejects.toMatchObject({ code: "ENOENT" });
		expect(await readFile(join(cwd, ".pi", "skills", "module-skill", "notes.txt"), "utf8")).toBe(
			"untracked\n",
		);
		expect(await readFile(join(cwd, ".ns", "acme-data", "customer.txt"), "utf8")).toBe(
			"preserve me\n",
		);
		expect(
			await readFile(join(cwd, "extensions", "acme-module", "package.json"), "utf8"),
		).toContain("@acme/module");

		const json = await runNsCliJson(["extension", "uninstall", source], cwd);
		expect(json.exit).toBe(0);
		expect(json.stderr).toBe("");
		expect(parseJsonOutput(json)).toMatchObject({
			status: "ok",
			data: {
				steps: expect.arrayContaining([
					expect.objectContaining({ type: "declaration-decided", action: "absent" }),
				]),
			},
		});

		const markdownStdout: string[] = [];
		const markdownStderr: string[] = [];
		const markdownExit = await runNsCli(
			["extension", "uninstall", source, "--format", "markdown"],
			{
				cwd,
				homeDir: join(cwd, ".home"),
				env: { HOME: join(cwd, ".home") },
				stdout: (text) => markdownStdout.push(text),
				stderr: (text) => markdownStderr.push(text),
			},
		);
		expect(markdownExit).toBe(0);
		expect(markdownStderr.join("")).toBe("");
		expect(markdownStdout.join("")).toContain("# ns extension uninstall");
		expect(markdownStdout.join("")).toContain("Local source and consumer data were preserved");
	});

	test("refuses uninstall when a manifest-owned artifact was locally modified", async () => {
		const cwd = await createEmptyProject();
		await initializeGitRepo(cwd);
		await writeFile(join(cwd, "ns.toml"), 'harnesses = ["pi"]\n', "utf8");
		await writeModuleExtension(cwd);
		const source = "./extensions/acme-module";
		expect((await runNsCliJson(["extension", "install", source], cwd)).exit).toBe(0);
		const artifactPath = join(cwd, ".pi", "skills", "module-skill", "SKILL.md");
		await writeFile(artifactPath, "customer edit\n", "utf8");

		const result = await runNsCliJson(["extension", "uninstall", source], cwd);

		expect(result.exit).toBe(2);
		expect(parseJsonOutput(result)).toMatchObject({
			status: "failure",
			errorType: "ns-extension-uninstall-preflight-failed",
			data: { diagnostics: [{ code: "artifact-local-conflict" }], completed: {} },
		});
		expect(await readFile(artifactPath, "utf8")).toBe("customer edit\n");
		expect(await readFile(join(cwd, "ns.toml"), "utf8")).toContain(source);
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
}
