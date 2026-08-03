import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createTempDirTracker } from "@nseng-ai/foundation/test-kit";
import { afterEach, describe, expect, test } from "vitest";

import { renderCliShim } from "../src/public-packages/render-cli-shim.ts";

const CLI_REL_PATH = "ts/packages/public/ns/src/cli.ts";
const templatePath = fileURLToPath(
	new URL("../../../../../scripts/source-cli-shim-template", import.meta.url),
);
const tempDirs = createTempDirTracker();

interface ShimFixture {
	readonly callerCheckout: string;
	readonly canonicalCheckout: string;
	readonly unrelatedCwd: string;
	readonly shimPath: string;
	readonly fakeBinPath: string;
	readonly nodeRecordPath: string;
}

async function writeExecutable(path: string, content: string): Promise<void> {
	await writeFile(path, content, "utf8");
	await chmod(path, 0o755);
}

async function createFixture(): Promise<ShimFixture> {
	const root = await tempDirs.makeTempDir("ns-source-cli-shim-");
	const callerCheckout = join(root, "caller");
	const canonicalCheckout = join(root, "canonical");
	const unrelatedCwd = join(root, "unrelated");
	const fakeBinPath = join(root, "fake-bin");
	const shimPath = join(root, "ns");
	const nodeRecordPath = join(root, "node-record");

	await Promise.all([
		mkdir(join(callerCheckout, "ts", "node_modules"), { recursive: true }),
		mkdir(join(canonicalCheckout, "ts", "node_modules"), { recursive: true }),
		mkdir(join(callerCheckout, CLI_REL_PATH, ".."), { recursive: true }),
		mkdir(join(canonicalCheckout, CLI_REL_PATH, ".."), { recursive: true }),
		mkdir(unrelatedCwd, { recursive: true }),
		mkdir(fakeBinPath, { recursive: true }),
	]);
	await Promise.all([
		writeFile(join(callerCheckout, CLI_REL_PATH), "caller CLI marker\n", "utf8"),
		writeFile(join(canonicalCheckout, CLI_REL_PATH), "canonical CLI marker\n", "utf8"),
		writeExecutable(
			join(fakeBinPath, "git"),
			'#!/bin/sh\nif [ "$FAKE_GIT_FAIL" = "1" ]; then exit 1; fi\nprintf \'%s\\n\' "$FAKE_GIT_ROOT"\n',
		),
		writeExecutable(
			join(fakeBinPath, "node"),
			'#!/bin/sh\nprintf \'%s\\0\' "$@" > "$NODE_RECORD"\nexit 0\n',
		),
	]);

	const rendered = renderCliShim({
		template: await readFile(templatePath, "utf8"),
		tool: "ns",
		canonicalCheckout,
		cliRelPath: CLI_REL_PATH,
		installHint: "reinstall ns",
		fallbackMode: "literal",
		templateLabel: templatePath,
	});
	if (rendered.type === "failure") throw new Error(rendered.message);
	await writeExecutable(shimPath, rendered.rendered);

	return {
		callerCheckout,
		canonicalCheckout,
		unrelatedCwd,
		shimPath,
		fakeBinPath,
		nodeRecordPath,
	};
}

function runShim(
	fixture: ShimFixture,
	options: { readonly cwd: string; readonly gitFails: boolean; readonly args: readonly string[] },
): SpawnSyncReturns<string> {
	const inheritedPath = process.env.PATH;
	if (inheritedPath === undefined) throw new Error("test process PATH is required");
	return spawnSync("/bin/bash", [fixture.shimPath, ...options.args], {
		cwd: options.cwd,
		env: {
			...process.env,
			PATH: `${fixture.fakeBinPath}:${inheritedPath}`,
			FAKE_GIT_FAIL: options.gitFails ? "1" : "0",
			FAKE_GIT_ROOT: fixture.callerCheckout,
			NODE_RECORD: fixture.nodeRecordPath,
		},
		encoding: "utf8",
	});
}

async function readNodeArguments(path: string): Promise<string[]> {
	const fields = (await readFile(path, "utf8")).split("\0");
	if (fields.at(-1) !== "") throw new Error("fake node record must end with NUL");
	return fields.slice(0, -1);
}

afterEach(async () => {
	await tempDirs.cleanup();
});

describe("source CLI shim", () => {
	test("prefers the caller checkout when the canonical checkout also has the CLI", async () => {
		const fixture = await createFixture();
		const args = ["extension", "install", "path with spaces", "", "--flag=value"];

		const run = runShim(fixture, {
			cwd: join(fixture.callerCheckout, "ts"),
			gitFails: false,
			args,
		});

		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toBe("");
		expect(run.stderr).toBe("");
		await expect(readNodeArguments(fixture.nodeRecordPath)).resolves.toEqual([
			join(fixture.callerCheckout, CLI_REL_PATH),
			...args,
		]);
	});

	test("falls back to the canonical checkout outside a Git checkout", async () => {
		const fixture = await createFixture();
		const args = ["--runtime", "argument with spaces", "", "literal;$value"];

		const run = runShim(fixture, {
			cwd: fixture.unrelatedCwd,
			gitFails: true,
			args,
		});

		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toBe("");
		expect(run.stderr).toBe("");
		await expect(readNodeArguments(fixture.nodeRecordPath)).resolves.toEqual([
			join(fixture.canonicalCheckout, CLI_REL_PATH),
			...args,
		]);
	});
});
