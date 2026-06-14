import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../..", import.meta.url)));
const SHIM_TEMPLATE = join(REPO_ROOT, "ts/packages/brmem/scripts/brmem-shim");
const CANONICAL_TOKEN = "@@ASDL_CANONICAL_CHECKOUT@@";

const tempDirs: string[] = [];

afterEach(async () => {
	const pending = tempDirs.splice(0);
	await Promise.all(pending.map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Renders the shim template into an installed `brmem` the way `just install-brmem` does. */
async function installShim(canonicalCheckout: string): Promise<string> {
	const dir = await makeTempDir("brmem-shim-");
	const template = await readFile(SHIM_TEMPLATE, "utf8");
	const shimPath = join(dir, "brmem");
	await writeFile(shimPath, template.replaceAll(CANONICAL_TOKEN, canonicalCheckout), "utf8");
	await chmod(shimPath, 0o755);
	return shimPath;
}

/** Creates a git repository that looks like an asdl checkout, with a fake CLI that echoes its arguments. */
async function makeFakeCheckout(options: { shouldIncludeNodeModules: boolean }): Promise<string> {
	const dir = await makeTempDir("brmem-shim-");
	spawnSync("git", ["init", "--quiet", dir], { encoding: "utf8" });
	await mkdir(join(dir, "ts/packages/brmem/src"), { recursive: true });
	await writeFile(join(dir, "ts/packages/brmem/src/cli.ts"), `console.log("fake-cli: " + process.argv.slice(2).join(" "));\n`, "utf8");
	if (options.shouldIncludeNodeModules) {
		await mkdir(join(dir, "ts/node_modules"), { recursive: true });
	}
	return dir;
}

interface ShimRunResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

function runShim(shimPath: string, args: readonly string[], options: { cwd: string; isOutsideCheckout?: boolean }): ShimRunResult {
	const env = options.isOutsideCheckout === true
		// GIT_CEILING_DIRECTORIES keeps `git rev-parse` from discovering an
		// enclosing repository above the cwd, mimicking use outside a checkout.
		? { ...process.env, GIT_CEILING_DIRECTORIES: options.cwd }
		: process.env;
	const result = spawnSync(shimPath, [...args], { cwd: options.cwd, env, encoding: "utf8" });
	return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
}

async function makeTempDir(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

describe("brmem shim", () => {
	test("renders the canonical checkout path into the installed shim", async () => {
		const shimPath = await installShim("/canonical/asdl");
		const rendered = await readFile(shimPath, "utf8");

		expect(rendered).not.toContain(CANONICAL_TOKEN);
		expect(rendered).toContain('canonical_checkout="/canonical/asdl"');
	});

	test("runs the enclosing checkout's TypeScript CLI inside an asdl checkout", async () => {
		const shimPath = await installShim("/nonexistent/canonical/checkout");

		const result = runShim(shimPath, ["--help"], { cwd: REPO_ROOT });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("Usage: brmem");
	});

	test("prefers the enclosing checkout over the canonical checkout", async () => {
		const fakeCheckout = await makeFakeCheckout({ shouldIncludeNodeModules: true });
		const shimPath = await installShim(REPO_ROOT);

		const result = runShim(shimPath, ["--version"], { cwd: fakeCheckout });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("fake-cli: --version\n");
	});

	test("falls back to the baked canonical checkout outside a checkout", async () => {
		const outsideDir = await makeTempDir("brmem-shim-");
		const shimPath = await installShim(REPO_ROOT);

		const result = runShim(shimPath, ["--version"], { cwd: outsideDir, isOutsideCheckout: true });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("0.1.0\n");
	});

	test("forwards runtime diagnostics to the TypeScript CLI", async () => {
		const outsideDir = await makeTempDir("brmem-shim-");
		const shimPath = await installShim(REPO_ROOT);

		const result = runShim(shimPath, ["--runtime"], { cwd: outsideDir, isOutsideCheckout: true });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("runtime: typescript\nentry_point: @asdl/brmem bin brmem -> ts/packages/brmem/src/cli.ts\n");
	});

	test("fails clearly when the checkout has no installed ts dependencies", async () => {
		const fakeCheckout = await makeFakeCheckout({ shouldIncludeNodeModules: false });
		const shimPath = await installShim("/nonexistent/canonical/checkout");

		const result = runShim(shimPath, ["--help"], { cwd: fakeCheckout });

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("brmem");
		expect(result.stderr).toContain("no ts/node_modules");
		expect(result.stderr).toContain("just ts-install");
	});

	test("fails clearly when no checkout is available", async () => {
		const outsideDir = await makeTempDir("brmem-shim-");
		const shimPath = await installShim("/nonexistent/canonical/checkout");

		const result = runShim(shimPath, ["--help"], { cwd: outsideDir, isOutsideCheckout: true });

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("no asdl checkout found");
		expect(result.stderr).toContain("just install-brmem");
		expect(result.stderr).toContain("just install-tools");
	});
});
