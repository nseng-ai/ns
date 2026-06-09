import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));
const WRAPPER = join(REPO_ROOT, "skills/pr-address/scripts/pr-address-run");
const BUNDLE = join(REPO_ROOT, "skills/pr-address/scripts/pr-address.bundle.mjs");

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pr-address-wrapper-"));
	tempDirs.push(dir);
	return dir;
}

async function writeFakeCommand(dir: string, name: string, label: string): Promise<void> {
	const path = join(dir, name);
	await writeFile(path, `#!/bin/sh\nprintf '${label}:'\nprintf ' %s' "$@"\nprintf '\\n'\n`, "utf8");
	await chmod(path, 0o755);
}

interface WrapperRunResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

interface RunWrapperOptions {
	env?: NodeJS.ProcessEnv | undefined;
	cwd?: string | undefined;
	wrapperPath?: string | undefined;
}

function runWrapper(args: readonly string[], options: RunWrapperOptions = {}): WrapperRunResult {
	const result = spawnSync(options.wrapperPath ?? WRAPPER, [...args], {
		cwd: options.cwd ?? REPO_ROOT,
		env: options.env ?? process.env,
		encoding: "utf8",
	});
	return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
}

/** Copies the wrapper (and optionally the bundle) into a temp dir that mimics an installed skill's scripts/ directory. */
async function makeInstalledScriptsDir(options: { includeBundle: boolean }): Promise<string> {
	const dir = await makeTempDir();
	const wrapperCopy = join(dir, "pr-address-run");
	await copyFile(WRAPPER, wrapperCopy);
	await chmod(wrapperCopy, 0o755);
	if (options.includeBundle) {
		await copyFile(BUNDLE, join(dir, "pr-address.bundle.mjs"));
	}
	return dir;
}

describe("pr-address-run wrapper", () => {
	test("defaults to the local TypeScript CLI in a checkout", () => {
		const result = runWrapper(["--help"]);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("Usage: pr-address");
		expect(result.stdout).toContain("PR review address operations");
	});

	test("ASDL_PR_ADDRESS_MODE=local forces the local TypeScript CLI", () => {
		const result = runWrapper(["--help"], { env: { ...process.env, ASDL_PR_ADDRESS_MODE: "local" } });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("Usage: pr-address");
		expect(result.stdout).toContain("PR review address operations");
	});

	test("ASDL_PR_ADDRESS_MODE=ts-local is a local TypeScript CLI alias", () => {
		const result = runWrapper(["--help"], { env: { ...process.env, ASDL_PR_ADDRESS_MODE: "ts-local" } });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("Usage: pr-address");
		expect(result.stdout).toContain("PR review address operations");
	});

	test("ASDL_PR_ADDRESS_MODE=prod executes the bundled artifact with node", async () => {
		const fakeBin = await makeTempDir();
		await writeFakeCommand(fakeBin, "node", "node");

		const result = runWrapper(["--help"], { env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ""}`, ASDL_PR_ADDRESS_MODE: "prod" } });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe(`node: ${BUNDLE} --help\n`);
	});

	test("ASDL_PR_ADDRESS_MODE=prod fails clearly when the bundle is missing", async () => {
		const scriptsDir = await makeInstalledScriptsDir({ includeBundle: false });

		const result = runWrapper(["--help"], {
			wrapperPath: join(scriptsDir, "pr-address-run"),
			cwd: scriptsDir,
			env: { ...process.env, ASDL_PR_ADDRESS_MODE: "prod" },
		});

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("bundled pr-address artifact is missing");
		expect(result.stderr).toContain("ASDL_PR_ADDRESS_MODE=legacy-python");
	});

	test("defaults to the bundled artifact outside a checkout", async () => {
		const scriptsDir = await makeInstalledScriptsDir({ includeBundle: true });

		const result = runWrapper(["--version"], {
			wrapperPath: join(scriptsDir, "pr-address-run"),
			cwd: scriptsDir,
			// GIT_CEILING_DIRECTORIES keeps `git rev-parse` from discovering an
			// enclosing repository above the temp dir, mimicking installed use.
			env: { ...process.env, GIT_CEILING_DIRECTORIES: scriptsDir },
		});

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("0.1.0\n");
	});

	test("ASDL_PR_ADDRESS_MODE=python-local is rejected now that the in-repo Python package is deleted", () => {
		const result = runWrapper(["--help"], { env: { ...process.env, ASDL_PR_ADDRESS_MODE: "python-local" } });

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("unknown ASDL_PR_ADDRESS_MODE='python-local'");
	});

	test("ASDL_PR_ADDRESS_MODE=legacy-python uses the published PyPI rollback pin", async () => {
		const fakeBin = await makeTempDir();
		await writeFakeCommand(fakeBin, "uvx", "uvx");

		const result = runWrapper(["--help"], { env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ""}`, ASDL_PR_ADDRESS_MODE: "legacy-python" } });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("uvx: --from asdl-pr-address==0.1.1 pr-address --help\n");
	});

	test("invalid mode exits 2 and lists valid modes", () => {
		const result = runWrapper(["--help"], { env: { ...process.env, ASDL_PR_ADDRESS_MODE: "bogus" } });

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("unknown ASDL_PR_ADDRESS_MODE='bogus'");
		expect(result.stderr).toContain("local, ts-local, legacy-python, prod");
	});
});
