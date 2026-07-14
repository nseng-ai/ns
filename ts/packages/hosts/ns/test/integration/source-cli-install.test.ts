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
		const cliPath = join(fixtureRoot, "ts", "packages", "hosts", "ns", "src", "cli.ts");
		const staleShimPath = join(workspaceBinDir, "ns");

		await Promise.all([
			mkdir(fakeBinDir, { recursive: true }),
			mkdir(homeDir, { recursive: true }),
			mkdir(scriptsDir, { recursive: true }),
			mkdir(workspaceBinDir, { recursive: true }),
			mkdir(join(fixtureRoot, "ts", "packages", "hosts", "ns", "src"), { recursive: true }),
		]);
		await copyFile(justfilePath, join(fixtureRoot, "justfile"));
		await writeExecutable(join(fakeBinDir, "corepack"), "#!/bin/sh\nexit 0\n");
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
		await writeFile(
			join(scriptsDir, "render-cli-shim.mjs"),
			[
				'import { writeFile } from "node:fs/promises";',
				"const outputPath = process.env.NS_OUTPUT;",
				"const canonicalCheckout = process.env.NS_CANONICAL_CHECKOUT;",
				"const cliRelPath = process.env.NS_CLI_REL_PATH;",
				'if (outputPath === undefined || canonicalCheckout === undefined || cliRelPath === undefined) throw new Error("missing renderer input");',
				"const cliPath = `${canonicalCheckout}/${cliRelPath}`;",
				'const rendered = ["#!/usr/bin/env bash", `exec node ${JSON.stringify(cliPath)} "$@"`, ""].join("\\n");',
				'await writeFile(outputPath, rendered, "utf8");',
				"",
			].join("\n"),
			"utf8",
		);

		const inheritedPath = process.env.PATH;
		if (inheritedPath === undefined) throw new Error("test process PATH is required");
		const install = spawnSync(
			"just",
			[
				"--justfile",
				join(fixtureRoot, "justfile"),
				"--working-directory",
				fixtureRoot,
				"install-ns",
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
});
