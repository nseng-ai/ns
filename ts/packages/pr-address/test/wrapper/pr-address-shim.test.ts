import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));
const SHIM_TEMPLATE = join(REPO_ROOT, "ts/packages/pr-address/scripts/pr-address-shim");
const CANONICAL_TOKEN = "@@ASDL_CANONICAL_CHECKOUT@@";

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pr-address-shim-"));
	tempDirs.push(dir);
	return dir;
}

/** Renders the shim template into an installed `pr-address` the way `just install-pr-address` does. */
async function installShim(canonicalCheckout: string): Promise<string> {
	const dir = await makeTempDir();
	const template = await readFile(SHIM_TEMPLATE, "utf8");
	const shimPath = join(dir, "pr-address");
	await writeFile(shimPath, template.replaceAll(CANONICAL_TOKEN, canonicalCheckout), "utf8");
	await chmod(shimPath, 0o755);
	return shimPath;
}

/** Creates a git repository that looks like an asdl checkout, with a fake CLI that echoes its arguments. */
async function makeFakeCheckout(options: { includeNodeModules: boolean }): Promise<string> {
	const dir = await makeTempDir();
	spawnSync("git", ["init", "--quiet", dir], { encoding: "utf8" });
	await mkdir(join(dir, "ts/packages/pr-address/src"), { recursive: true });
	await writeFile(
		join(dir, "ts/packages/pr-address/src/cli.ts"),
		`console.log("fake-cli: " + process.argv.slice(2).join(" "));\n`,
		"utf8",
	);
	if (options.includeNodeModules) {
		await mkdir(join(dir, "ts/node_modules"), { recursive: true });
	}
	return dir;
}

interface ShimRunResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

function runShim(shimPath: string, args: readonly string[], options: { cwd: string; outsideCheckout?: boolean }): ShimRunResult {
	const env = options.outsideCheckout === true
		// GIT_CEILING_DIRECTORIES keeps `git rev-parse` from discovering an
		// enclosing repository above the cwd, mimicking use outside a checkout.
		? { ...process.env, GIT_CEILING_DIRECTORIES: options.cwd }
		: process.env;
	const result = spawnSync(shimPath, [...args], { cwd: options.cwd, env, encoding: "utf8" });
	return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
}

describe("pr-address shim", () => {
	test("runs the enclosing checkout's TypeScript CLI inside an asdl checkout", async () => {
		const shimPath = await installShim("/nonexistent/canonical/checkout");

		const result = runShim(shimPath, ["--help"], { cwd: REPO_ROOT });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("Usage: pr-address");
	});

	test("prefers the enclosing checkout over the canonical checkout", async () => {
		const fakeCheckout = await makeFakeCheckout({ includeNodeModules: true });
		const shimPath = await installShim(REPO_ROOT);

		const result = runShim(shimPath, ["--version"], { cwd: fakeCheckout });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("fake-cli: --version\n");
	});

	test("falls back to the baked canonical checkout outside a checkout", async () => {
		const outsideDir = await makeTempDir();
		const shimPath = await installShim(REPO_ROOT);

		const result = runShim(shimPath, ["--version"], { cwd: outsideDir, outsideCheckout: true });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("0.1.0\n");
	});

	test("fails clearly when the checkout has no installed ts dependencies", async () => {
		const fakeCheckout = await makeFakeCheckout({ includeNodeModules: false });
		const shimPath = await installShim("/nonexistent/canonical/checkout");

		const result = runShim(shimPath, ["--help"], { cwd: fakeCheckout });

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("no ts/node_modules");
		expect(result.stderr).toContain("just ts-install");
	});

	test("fails clearly when no checkout is available", async () => {
		const outsideDir = await makeTempDir();
		const shimPath = await installShim("/nonexistent/canonical/checkout");

		const result = runShim(shimPath, ["--help"], { cwd: outsideDir, outsideCheckout: true });

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("no asdl checkout found");
		expect(result.stderr).toContain("just install-pr-address");
	});
});
