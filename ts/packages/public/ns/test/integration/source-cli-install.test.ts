import { access, chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { createTempDirTracker } from "@nseng-ai/foundation/test-kit";
import { afterEach, describe, expect, test } from "vitest";

const tempDirs = createTempDirTracker();
const justfilePath = fileURLToPath(new URL("../../../../../../justfile", import.meta.url));

async function writeExecutable(path: string, content: string): Promise<void> {
	await writeFile(path, content, "utf8");
	await chmod(path, 0o755);
}

afterEach(async () => {
	await tempDirs.cleanup();
});

describe("ns source CLI installation", () => {
	test("removes a stale workspace shim that shadows the installed source shim", async () => {
		const fixtureRoot = await tempDirs.makeTempDir("ns-source-cli-install-");
		const fakeBinDir = join(fixtureRoot, "fake-bin");
		const homeDir = join(fixtureRoot, "home");
		const scriptsDir = join(fixtureRoot, "ts", "scripts");
		const workspaceBinDir = join(fixtureRoot, "ts", "node_modules", ".bin");
		const cliPath = join(fixtureRoot, "ts", "packages", "public", "ns", "src", "cli.ts");
		const staleShimPath = join(workspaceBinDir, "ns");

		await Promise.all([
			mkdir(fakeBinDir, { recursive: true }),
			mkdir(homeDir, { recursive: true }),
			mkdir(scriptsDir, { recursive: true }),
			mkdir(workspaceBinDir, { recursive: true }),
			mkdir(join(fixtureRoot, "ts", "packages", "public", "ns", "src"), { recursive: true }),
		]);
		await copyFile(justfilePath, join(fixtureRoot, "justfile"));
		await writeExecutable(
			join(fakeBinDir, "corepack"),
			[
				"#!/bin/sh",
				'case " $* " in',
				'*" exec ns-dev render-cli-shim "*)',
				'  cli_path="$NS_CANONICAL_CHECKOUT/$NS_CLI_REL_PATH"',
				`  printf '#!/usr/bin/env bash\\nexec node "%s" "$@"\\n' "$cli_path" > "$NS_OUTPUT"`,
				"  exit 0",
				"  ;;",
				'*" install "*) exit 0 ;;',
				"esac",
				'echo "unexpected corepack invocation: $*" >&2',
				"exit 24",
				"",
			].join("\n"),
		);
		await writeExecutable(
			staleShimPath,
			"#!/bin/sh\necho 'stale @ns/kernel workspace shim' >&2\nexit 23\n",
		);
		await writeExecutable(
			cliPath,
			'#!/usr/bin/env node\nconsole.log("fixture ns " + process.argv.slice(2).join(" "));\n',
		);
		await writeFile(
			join(scriptsDir, "source-cli-shim-template"),
			"unused by fake renderer\n",
			"utf8",
		);
		const gitInit = spawnSync("git", ["init", "-b", "main", fixtureRoot], {
			encoding: "utf8",
		});
		expect(gitInit.status, gitInit.stderr).toBe(0);
		const inheritedPath = process.env.PATH;
		if (inheritedPath === undefined) throw new Error("test process PATH is required");
		const install = spawnSync(
			"just",
			[
				"--justfile",
				join(fixtureRoot, "justfile"),
				"--working-directory",
				fixtureRoot,
				"install-global-ns",
			],
			{
				env: { ...process.env, HOME: homeDir, PATH: `${fakeBinDir}:${inheritedPath}` },
				encoding: "utf8",
			},
		);

		expect(install.status, install.stderr).toBe(0);
		await expect(access(staleShimPath)).rejects.toMatchObject({ code: "ENOENT" });

		const run = spawnSync("ns", ["--version"], {
			cwd: fixtureRoot,
			env: {
				...process.env,
				PATH: `${workspaceBinDir}:${join(homeDir, ".local", "bin")}:${inheritedPath}`,
			},
			encoding: "utf8",
		});
		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toBe("fixture ns --version\n");
		expect(run.stderr).toBe("");
	});

	test("uses the main worktree as the fallback when installed from a linked worktree", async () => {
		const fixtureRoot = await tempDirs.makeTempDir("ns-source-cli-main-");
		const linkedRoot = await tempDirs.makeTempDir("ns-source-cli-linked-");
		const unrelatedRoot = await tempDirs.makeTempDir("ns-source-cli-unrelated-");
		const fakeBinDir = join(fixtureRoot, "fake-bin");
		const homeDir = join(fixtureRoot, "home");
		const scriptsDir = join(fixtureRoot, "ts", "scripts");
		const cliDir = join(fixtureRoot, "ts", "packages", "public", "ns", "src");

		await Promise.all([
			mkdir(fakeBinDir, { recursive: true }),
			mkdir(homeDir, { recursive: true }),
			mkdir(scriptsDir, { recursive: true }),
			mkdir(cliDir, { recursive: true }),
		]);
		await copyFile(justfilePath, join(fixtureRoot, "justfile"));
		await writeFile(
			join(scriptsDir, "source-cli-shim-template"),
			"unused by fake renderer\n",
			"utf8",
		);
		await writeExecutable(
			join(cliDir, "cli.ts"),
			'#!/usr/bin/env node\nconsole.log("main worktree");\n',
		);
		await writeExecutable(
			join(fakeBinDir, "corepack"),
			[
				"#!/bin/sh",
				'case " $* " in',
				'*" exec ns-dev render-cli-shim "*)',
				'  cli_path="$NS_CANONICAL_CHECKOUT/$NS_CLI_REL_PATH"',
				`  printf '#!/usr/bin/env bash\\nexec node "%s" "$@"\\n' "$cli_path" > "$NS_OUTPUT"`,
				"  exit 0",
				"  ;;",
				'*" install "*) exit 0 ;;',
				"esac",
				'echo "unexpected corepack invocation: $*" >&2',
				"exit 24",
				"",
			].join("\n"),
		);

		const gitInit = spawnSync("git", ["init", "-b", "main", fixtureRoot], {
			encoding: "utf8",
		});
		expect(gitInit.status, gitInit.stderr).toBe(0);
		const gitAdd = spawnSync(
			"git",
			["-C", fixtureRoot, "add", "justfile", "ts/scripts", "ts/packages"],
			{ encoding: "utf8" },
		);
		expect(gitAdd.status, gitAdd.stderr).toBe(0);
		const gitCommit = spawnSync(
			"git",
			[
				"-C",
				fixtureRoot,
				"-c",
				"user.name=ns test",
				"-c",
				"user.email=ns-test@example.invalid",
				"commit",
				"-m",
				"fixture",
			],
			{ encoding: "utf8" },
		);
		expect(gitCommit.status, gitCommit.stderr).toBe(0);
		const addWorktree = spawnSync(
			"git",
			["-C", fixtureRoot, "worktree", "add", "-b", "linked", linkedRoot],
			{ encoding: "utf8" },
		);
		expect(addWorktree.status, addWorktree.stderr).toBe(0);
		await writeExecutable(
			join(linkedRoot, "ts", "packages", "public", "ns", "src", "cli.ts"),
			'#!/usr/bin/env node\nconsole.log("linked worktree");\n',
		);

		const inheritedPath = process.env.PATH;
		if (inheritedPath === undefined) throw new Error("test process PATH is required");
		const install = spawnSync(
			"just",
			[
				"--justfile",
				join(linkedRoot, "justfile"),
				"--working-directory",
				linkedRoot,
				"install-global-ns",
			],
			{
				env: { ...process.env, HOME: homeDir, PATH: `${fakeBinDir}:${inheritedPath}` },
				encoding: "utf8",
			},
		);
		expect(install.status, install.stderr).toBe(0);
		expect(install.stdout).toContain(`canonical checkout: ${fixtureRoot}`);

		const run = spawnSync(join(homeDir, ".local", "bin", "ns"), [], {
			cwd: unrelatedRoot,
			env: { ...process.env, HOME: homeDir, PATH: inheritedPath },
			encoding: "utf8",
		});
		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toBe("main worktree\n");
		expect(run.stderr).toBe("");
	});
});
