import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { parseJsonOutput, runCliWithFakes, type RunWithFakesOptions } from "./sdl-cli-fakes.ts";

const tempDirs: string[] = [];

function runWithFakes(options: RunWithFakesOptions) {
	return runCliWithFakes(options, {
		execResponses: () => [],
		textGenerationResults: () => [],
	});
}

function repoRoot(): string {
	return resolve(process.cwd(), "..");
}

function repoRootResponses(root: string) {
	return Array.from({ length: 10 }, () => ({
		match: "git rev-parse --show-toplevel",
		result: { stdout: `${root}\n` },
	}));
}

async function isolatedHome(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-roaster-extension-home-"));
	tempDirs.push(directory);
	return directory;
}

afterEach(async () => {
	for (const directory of tempDirs.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("Roaster SDL command face", () => {
	test("top-level help discovers Roaster manifest metadata without loading selected code", async () => {
		const run = runWithFakes({
			args: ["--help"],
			cwd: repoRoot(),
			homeDir: await isolatedHome(),
			state: { exec: [] },
		});

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("roaster");
		expect(help).toContain("SDL roaster commands.");
		expect(help).not.toContain("--applicable");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("selected Roaster help loads the command schema without running backends", async () => {
		const run = runWithFakes({
			args: ["roaster", "review-list", "--help"],
			cwd: repoRoot(),
			homeDir: await isolatedHome(),
			state: { exec: [] },
		});

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: sdl roaster review-list");
		expect(help).toContain("--applicable");
		expect(help).toContain("--ci");
		expect(help).toContain("--base-ref");
		expect(help).toContain("first Roaster command-face proof");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("selected Roaster command publishes its machine schema", async () => {
		const run = runWithFakes({
			args: ["roaster", "review-list", "--json-schema"],
			cwd: repoRoot(),
			homeDir: await isolatedHome(),
			state: { exec: [] },
		});

		expect(await run.exit).toBe(0);
		const schema = parseJsonOutput(run);
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
	});

	test("selected Roaster review-list runs through SDL exec-scoped gateways", async () => {
		const root = repoRoot();
		const run = runWithFakes({
			args: ["roaster", "review-list", "--format", "json"],
			cwd: root,
			homeDir: await isolatedHome(),
			state: { exec: repoRootResponses(root) },
		});

		expect(await run.exit).toBe(0);
		const envelope = parseJsonOutput(run);
		expect(envelope.status).toBe("ok");
		expect(envelope.exitCode).toBe(0);
		expect(envelope.data).toMatchObject({
			reviews_dir: `${root}/.sdl/reviews`,
			count: expect.any(Number),
		});
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls.length).toBeGreaterThan(0);
		expect(run.context.execCalls.every((call) => call.command === "git")).toBe(true);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});
});
