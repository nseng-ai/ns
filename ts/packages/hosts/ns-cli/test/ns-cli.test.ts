import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runNsCli } from "../src/cli.ts";

const tempDirs: string[] = [];

async function createEmptyProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-cli-host-"));
	tempDirs.push(directory);
	return directory;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("ns CLI host", () => {
	test("injects Objective preinstalled command metadata", async () => {
		const cwd = await createEmptyProject();
		const stdout: string[] = [];
		const stderr: string[] = [];

		const exit = await runNsCli(["objective", "list", "--help"], {
			cwd,
			homeDir: join(cwd, ".home"),
			env: { HOME: join(cwd, ".home") },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});

		expect(exit).toBe(0);
		expect(stdout.join("")).toContain("Usage: ns objective list");
		expect(stdout.join("")).toContain("List Objective records in the current checkout.");
		expect(stderr.join("")).toBe("");
	});

	test("injects ns init preinstalled command metadata", async () => {
		const cwd = await createEmptyProject();
		const stdout: string[] = [];
		const stderr: string[] = [];

		const exit = await runNsCli(["init", "--help"], {
			cwd,
			homeDir: join(cwd, ".home"),
			env: { HOME: join(cwd, ".home") },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});

		expect(exit).toBe(0);
		expect(stdout.join("")).toContain("Usage: ns init");
		expect(stdout.join("")).toContain(
			"Activate ns Objectives in this repository by writing ns.toml",
		);
		expect(stderr.join("")).toBe("");
	});
});
