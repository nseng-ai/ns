import { spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createTempDirTracker } from "@asdl/core/testing";
import { afterEach, describe, expect, test } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../..", import.meta.url)));
const SHIM_TEMPLATE = join(REPO_ROOT, "ts/scripts/source-cli-shim-template");
const SHIM_RENDERER = join(REPO_ROOT, "ts/scripts/render-cli-shim.py");
const TOKEN_PREFIX = "@@ASDL_";

interface ShimConfig {
	tool: string;
	cliRelPath: string;
	installHint: string;
}

const SHIM_CONFIG = {
	tool: "fake-tool",
	cliRelPath: "ts/packages/fake-tool/src/cli.ts",
	installHint: "just install-fake",
} as const satisfies ShimConfig;

interface FakeCheckoutOptions {
	label: string;
	shouldIncludeNodeModules: boolean;
}

interface ShimRunResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

const tempDirs = createTempDirTracker();

afterEach(async () => {
	await tempDirs.cleanup();
});

describe("source CLI shim", () => {
	test("renders the tool-specific values into the installed shim", async () => {
		const shimPath = await installShim("/canonical/asdl");
		const rendered = await readFile(shimPath, "utf8");

		expect(rendered).not.toContain(TOKEN_PREFIX);
		expect(rendered).toContain("tool=fake-tool");
		expect(rendered).toContain("canonical_checkout=/canonical/asdl");
		expect(rendered).toContain("cli_rel_path=ts/packages/fake-tool/src/cli.ts");
		expect(rendered).toContain("install_hint='just install-fake'");
	});

	test("runs the enclosing checkout's TypeScript CLI inside an asdl checkout", async () => {
		const fakeCheckout = await makeFakeCheckout({ label: "enclosing", shouldIncludeNodeModules: true });
		const shimPath = await installShim("/nonexistent/canonical/checkout");

		const result = runShim(shimPath, ["--help"], { cwd: fakeCheckout });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("enclosing: --help\n");
	});

	test("prefers the enclosing checkout over the canonical checkout", async () => {
		const enclosingCheckout = await makeFakeCheckout({ label: "enclosing", shouldIncludeNodeModules: true });
		const canonicalCheckout = await makeFakeCheckout({ label: "canonical", shouldIncludeNodeModules: true });
		const shimPath = await installShim(canonicalCheckout);

		const result = runShim(shimPath, ["--version"], { cwd: enclosingCheckout });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("enclosing: --version\n");
	});

	test("falls back to the baked canonical checkout outside a checkout", async () => {
		const outsideDir = await makeTempDir("source-cli-shim-");
		const canonicalCheckout = await makeFakeCheckout({ label: "canonical", shouldIncludeNodeModules: true });
		const shimPath = await installShim(canonicalCheckout);

		const result = runShim(shimPath, ["--version"], { cwd: outsideDir, isOutsideCheckout: true });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("canonical: --version\n");
	});

	test("passes arguments through to the chosen TypeScript CLI", async () => {
		const outsideDir = await makeTempDir("source-cli-shim-");
		const canonicalCheckout = await makeFakeCheckout({ label: "canonical", shouldIncludeNodeModules: true });
		const shimPath = await installShim(canonicalCheckout);

		const result = runShim(shimPath, ["--flag", "value with spaces"], { cwd: outsideDir, isOutsideCheckout: true });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("canonical: --flag value with spaces\n");
	});

	test("fails clearly when the checkout has no installed ts dependencies", async () => {
		const fakeCheckout = await makeFakeCheckout({ label: "missing-deps", shouldIncludeNodeModules: false });
		const shimPath = await installShim("/nonexistent/canonical/checkout");

		const result = runShim(shimPath, ["--help"], { cwd: fakeCheckout });

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("fake-tool");
		expect(result.stderr).toContain("no ts/node_modules");
		expect(result.stderr).toContain("just ts-install");
	});

	test("fails clearly when neither an enclosing checkout nor the canonical checkout is available", async () => {
		const outsideDir = await makeTempDir("source-cli-shim-");
		const shimPath = await installShim("/nonexistent/canonical/checkout");

		const result = runShim(shimPath, ["--help"], { cwd: outsideDir, isOutsideCheckout: true });

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("no asdl checkout found");
		expect(result.stderr).toContain("just install-fake");
	});
});

async function installShim(canonicalCheckout: string): Promise<string> {
	const dir = await makeTempDir("source-cli-shim-");
	const shimPath = join(dir, SHIM_CONFIG.tool);
	const result = spawnSync("python", [SHIM_RENDERER], {
		env: {
			...process.env,
			ASDL_TEMPLATE: SHIM_TEMPLATE,
			ASDL_OUTPUT: shimPath,
			ASDL_TOOL: SHIM_CONFIG.tool,
			ASDL_CANONICAL_CHECKOUT: canonicalCheckout,
			ASDL_CLI_REL_PATH: SHIM_CONFIG.cliRelPath,
			ASDL_INSTALL_HINT: SHIM_CONFIG.installHint,
		},
		encoding: "utf8",
	});
	if (result.status !== 0) {
		throw new Error(`failed to render shim: ${String(result.stderr)}`);
	}
	await chmod(shimPath, 0o755);
	return shimPath;
}

async function makeFakeCheckout(options: FakeCheckoutOptions): Promise<string> {
	const dir = await makeTempDir("source-cli-shim-");
	runRequiredCommand("git", ["init", "--quiet", dir]);
	await mkdir(join(dir, "ts/packages/fake-tool/src"), { recursive: true });
	await writeFile(
		join(dir, "ts/packages/fake-tool/src/cli.ts"),
		`console.log(${JSON.stringify(options.label)} + ": " + process.argv.slice(2).join(" "));
`,
		"utf8",
	);
	if (options.shouldIncludeNodeModules) {
		await mkdir(join(dir, "ts/node_modules"), { recursive: true });
	}
	return dir;
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

function runRequiredCommand(command: string, args: readonly string[]): void {
	const result = spawnSync(command, [...args], { encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(`command failed: ${command} ${args.join(" ")}\n${String(result.stderr)}`);
	}
}

async function makeTempDir(prefix: string): Promise<string> {
	return tempDirs.makeTempDir(prefix);
}
