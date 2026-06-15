import { spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { REPO_ROOT } from "../support/golden.ts";
import { useTempDirs } from "../support/temp.ts";

const makeTempDir = useTempDirs();

const SHIM_TEMPLATE = join(REPO_ROOT, "ts/scripts/source-cli-shim-template");
const TOKEN_PREFIX = "@@ASDL_";
const SHELL_SAFE_VALUE_PATTERN = /^[A-Za-z0-9_@%+=:,./-]+$/u;

interface ShimConfig {
	tool: string;
	cliRelPath: string;
	installHint: string;
}

const SHIM_CONFIG = {
	tool: "pr-address",
	cliRelPath: "ts/packages/pr-address/src/cli.ts",
	installHint: "just install-pr-address",
} as const satisfies ShimConfig;

/** Renders the shared shim template into an installed `pr-address` the way `just install-pr-address` does. */
async function installShim(canonicalCheckout: string): Promise<string> {
	const dir = await makeTempDir("pr-address-shim-");
	const template = await readFile(SHIM_TEMPLATE, "utf8");
	const shimPath = join(dir, "pr-address");
	await writeFile(shimPath, renderShimTemplate(template, canonicalCheckout), "utf8");
	await chmod(shimPath, 0o755);
	return shimPath;
}

function renderShimTemplate(template: string, canonicalCheckout: string): string {
	const rendered = template
		.replaceAll("@@ASDL_TOOL@@", shellQuote(SHIM_CONFIG.tool))
		.replaceAll("@@ASDL_CANONICAL_CHECKOUT@@", shellQuote(canonicalCheckout))
		.replaceAll("@@ASDL_CLI_REL_PATH@@", shellQuote(SHIM_CONFIG.cliRelPath))
		.replaceAll("@@ASDL_INSTALL_HINT@@", shellQuote(SHIM_CONFIG.installHint));
	if (rendered.includes(TOKEN_PREFIX)) {
		throw new Error("unrendered shim token remains");
	}
	return rendered;
}

function shellQuote(value: string): string {
	if (value.length > 0 && SHELL_SAFE_VALUE_PATTERN.test(value)) return value;
	return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

/** Creates a git repository that looks like an asdl checkout, with a fake CLI that echoes its arguments. */
async function makeFakeCheckout(options: { shouldIncludeNodeModules: boolean }): Promise<string> {
	const dir = await makeTempDir("pr-address-shim-");
	spawnSync("git", ["init", "--quiet", dir], { encoding: "utf8" });
	await mkdir(join(dir, "ts/packages/pr-address/src"), { recursive: true });
	await writeFile(
		join(dir, "ts/packages/pr-address/src/cli.ts"),
		`console.log("fake-cli: " + process.argv.slice(2).join(" "));
`,
		"utf8",
	);
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

describe("pr-address shim", () => {
	test("renders the tool-specific values into the installed shim", async () => {
		const shimPath = await installShim("/canonical/asdl");
		const rendered = await readFile(shimPath, "utf8");

		expect(rendered).not.toContain(TOKEN_PREFIX);
		expect(rendered).toContain("tool=pr-address");
		expect(rendered).toContain("canonical_checkout=/canonical/asdl");
		expect(rendered).toContain("cli_rel_path=ts/packages/pr-address/src/cli.ts");
		expect(rendered).toContain("install_hint='just install-pr-address'");
	});

	test("runs the enclosing checkout's TypeScript CLI inside an asdl checkout", async () => {
		const shimPath = await installShim("/nonexistent/canonical/checkout");

		const result = runShim(shimPath, ["--help"], { cwd: REPO_ROOT });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("Usage: pr-address");
	});

	test("prefers the enclosing checkout over the canonical checkout", async () => {
		const fakeCheckout = await makeFakeCheckout({ shouldIncludeNodeModules: true });
		const shimPath = await installShim(REPO_ROOT);

		const result = runShim(shimPath, ["--version"], { cwd: fakeCheckout });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("fake-cli: --version\n");
	});

	test("falls back to the baked canonical checkout outside a checkout", async () => {
		const outsideDir = await makeTempDir("pr-address-shim-");
		const shimPath = await installShim(REPO_ROOT);

		const result = runShim(shimPath, ["--version"], { cwd: outsideDir, isOutsideCheckout: true });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("0.1.0\n");
	});

	test("forwards runtime diagnostics to the TypeScript CLI", async () => {
		const outsideDir = await makeTempDir("pr-address-shim-");
		const shimPath = await installShim(REPO_ROOT);

		const result = runShim(shimPath, ["--runtime"], { cwd: outsideDir, isOutsideCheckout: true });

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("runtime: typescript\nentry_point: @asdl/pr-address bin pr-address -> ts/packages/pr-address/src/cli.ts\n");
	});

	test("fails clearly when the checkout has no installed ts dependencies", async () => {
		const fakeCheckout = await makeFakeCheckout({ shouldIncludeNodeModules: false });
		const shimPath = await installShim("/nonexistent/canonical/checkout");

		const result = runShim(shimPath, ["--help"], { cwd: fakeCheckout });

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("no ts/node_modules");
		expect(result.stderr).toContain("just ts-install");
	});

	test("fails clearly when no checkout is available", async () => {
		const outsideDir = await makeTempDir("pr-address-shim-");
		const shimPath = await installShim("/nonexistent/canonical/checkout");

		const result = runShim(shimPath, ["--help"], { cwd: outsideDir, isOutsideCheckout: true });

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("no asdl checkout found");
		expect(result.stderr).toContain("just install-pr-address");
		expect(result.stderr).not.toContain("just install-tools");
	});
});
