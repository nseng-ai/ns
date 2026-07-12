import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { commandSucceeded, runCommand } from "@nseng-ai/foundation/exec";
import { nsExtensionInstallCommand } from "@nseng-ai/ns-init/ns/commands/extension-install";
import { nsExtensionUninstallCommand } from "@nseng-ai/ns-init/ns/commands/extension-uninstall";

import { runNsCli } from "../../src/cli/index.ts";
import {
	createEmptyProject,
	parseJsonOutput,
	runNsCliJson,
	writeModuleExtension,
} from "../support/cli-harness.ts";

describe("extension install host integration", () => {
	test("imports a full local descriptor, reconciles artifacts, and reports idempotence", async () => {
		expect(nsExtensionInstallCommand.name).toBe("install");
		const cwd = await createEmptyProject();
		await initializeGitRepo(cwd);
		await writeFile(join(cwd, "ns.toml"), 'harnesses = ["pi"]\n', "utf8");
		await writeModuleExtension(cwd);

		const installed = await runNsCliJson(["extension", "install", "./extensions/acme-module"], cwd);
		expect(installed.exit).toBe(0);
		expect(parseJsonOutput(installed)).toMatchObject({
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
		expect(stderr.join("")).toBe("");

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
		expect(stderr.join(" ")).toBe("");
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
