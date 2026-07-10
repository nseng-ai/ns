import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { runCommand } from "@nseng-ai/foundation/exec";
import { nsExtensionInstallCommand } from "@nseng-ai/ns-init/ns/commands/extension-install";

import { runNsCli } from "../../src/cli.ts";
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
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
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
});

async function initializeGitRepo(projectRoot: string): Promise<void> {
	const initialized = await runCommand("git", ["init", "--initial-branch=main"], {
		cwd: projectRoot,
	});
	if (initialized.code !== 0) {
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
	if (committed.code !== 0) {
		throw new Error(`git commit failed: ${committed.stderr || committed.stdout}`);
	}
}
