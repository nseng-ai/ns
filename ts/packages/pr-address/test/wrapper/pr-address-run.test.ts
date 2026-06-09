import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));
const WRAPPER = join(REPO_ROOT, "skills/pr-address/scripts/pr-address-run");

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

function runWrapper(args: readonly string[], options: { env?: NodeJS.ProcessEnv | undefined } = {}): WrapperRunResult {
	const result = spawnSync(WRAPPER, [...args], {
		cwd: REPO_ROOT,
		env: options.env ?? process.env,
		encoding: "utf8",
	});
	return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
}

describe("pr-address-run wrapper", () => {
	test("defaults to the local TypeScript CLI in a checkout", () => {
		const result = runWrapper(["--help"]);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("Usage: pr-address");
		expect(result.stdout).toContain("TypeScript package is currently a migration scaffold");
	});

	test("ASDL_PR_ADDRESS_MODE=local forces the local TypeScript CLI", () => {
		const result = runWrapper(["--help"], { env: { ...process.env, ASDL_PR_ADDRESS_MODE: "local" } });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("Usage: pr-address");
		expect(result.stdout).toContain("TypeScript package is currently a migration scaffold");
	});

	test("ASDL_PR_ADDRESS_MODE=prod keeps the pinned legacy Python PyPI path", async () => {
		const fakeBin = await makeTempDir();
		await writeFakeCommand(fakeBin, "uvx", "uvx");

		const result = runWrapper(["--help"], { env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ""}`, ASDL_PR_ADDRESS_MODE: "prod" } });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("uvx: --from asdl-pr-address==0.1.0 pr-address --help\n");
	});

	test("ASDL_PR_ADDRESS_MODE=python-local reaches the local legacy Python command", async () => {
		const fakeBin = await makeTempDir();
		await writeFakeCommand(fakeBin, "uv", "uv");

		const result = runWrapper(["--help"], { env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ""}`, ASDL_PR_ADDRESS_MODE: "python-local" } });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe(`uv: run --project ${REPO_ROOT} pr-address --help\n`);
	});

	test("invalid mode exits 2 and lists valid modes", () => {
		const result = runWrapper(["--help"], { env: { ...process.env, ASDL_PR_ADDRESS_MODE: "bogus" } });

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("unknown ASDL_PR_ADDRESS_MODE='bogus'");
		expect(result.stderr).toContain("local, ts-local, python-local, legacy-python, prod");
	});
});
