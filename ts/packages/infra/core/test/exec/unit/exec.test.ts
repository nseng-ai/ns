import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { afterEach, describe, expect, test } from "vitest";

import { defaultCommandResolver, NodeCommandExecApi } from "@sdl/core/exec";

const tempDirs: string[] = [];
const originalPath = process.env.PATH;

function createTempDir(): string {
	const directory = mkdtempSync(join(tmpdir(), "ji-exec-unit-"));
	tempDirs.push(directory);
	return directory;
}

afterEach(() => {
	process.env.PATH = originalPath;
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("NodeCommandExecApi", () => {
	test("advertises stdin support for callers that require a real Node adapter", () => {
		expect(new NodeCommandExecApi().supportsStdin).toBe(true);
	});
});

describe("defaultCommandResolver", () => {
	test("finds executables on PATH", () => {
		const directory = createTempDir();
		const executable = join(directory, "ji-exec-test-tool");
		writeFileSync(executable, "#!/bin/sh\nexit 0\n");
		chmodSync(executable, 0o755);
		process.env.PATH = directory;

		expect(defaultCommandResolver("ji-exec-test-tool")).toBe(executable);
	});

	test("returns undefined for non-executable commands", () => {
		const directory = createTempDir();
		writeFileSync(join(directory, "ji-exec-test-tool"), "#!/bin/sh\nexit 0\n");
		process.env.PATH = directory;

		expect(defaultCommandResolver("ji-exec-test-tool")).toBeUndefined();
		expect(defaultCommandResolver("missing-tool")).toBeUndefined();
	});
});
