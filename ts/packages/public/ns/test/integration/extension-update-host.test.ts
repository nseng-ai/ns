import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { commandSucceeded, runCommand } from "@nseng-ai/foundation/exec";
import { runNsCli } from "../../src/cli/index.ts";
import {
	createEmptyProject,
	parseJsonOutput,
	writeModuleExtension,
} from "../support/cli-harness.ts";

async function initializeGitRepo(projectRoot: string): Promise<void> {
	const initialized = await runCommand("git", ["init", "--initial-branch=main"], {
		cwd: projectRoot,
	});
	if (!commandSucceeded(initialized)) throw new Error("git init failed");
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
			"initialize",
		],
		{ cwd: projectRoot },
	);
	if (!commandSucceeded(committed)) throw new Error("git commit failed");
	const head = await runCommand(
		"git",
		["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"],
		{ cwd: projectRoot },
	);
	if (!commandSucceeded(head)) throw new Error("git symbolic-ref failed");
}

describe("ns extension update integration", () => {
	test("updates a declared local extension from a git-root subdirectory and supports dry-run", async () => {
		const projectRoot = await createEmptyProject();
		await initializeGitRepo(projectRoot);
		await mkdir(join(projectRoot, "nested"));
		await writeFile(join(projectRoot, "ns.toml"), 'extensions = ["./extensions/acme-module"]\n');
		await writeModuleExtension(projectRoot);
		const cwd = join(projectRoot, "nested"),
			stdout: string[] = [],
			stderr: string[] = [];
		const exit = await runNsCli(
			["extension", "update", "./extensions/acme-module", "--format", "json"],
			{
				cwd,
				homeDir: join(projectRoot, ".home"),
				env: { HOME: join(projectRoot, ".home") },
				stdout: (x) => stdout.push(x),
				stderr: (x) => stderr.push(x),
			},
		);
		expect(exit).toBe(0);
		expect(stderr.join("")).toBe("");
		expect(parseJsonOutput({ stdout: stdout.join("") })).toMatchObject({
			status: "success",
			data: {
				mode: "applied",
				acquisitionIntent: "local-in-place",
				acquisitionOutcome: "not-applicable",
				repoRoot: projectRoot,
			},
		});
		expect(await readFile(join(projectRoot, ".ns", "instructions.md"), "utf8")).toContain(
			"ACME module instructions",
		);
		const human: string[] = [];
		const dry = await runNsCli(["extension", "update", "./extensions/acme-module", "--dry-run"], {
			cwd,
			homeDir: join(projectRoot, ".home"),
			env: { HOME: join(projectRoot, ".home") },
			stdout: (x) => human.push(x),
			stderr: () => {},
		});
		expect(dry).toBe(0);
		expect(human.join("")).toContain("Planned local-in-place");
	});
});
