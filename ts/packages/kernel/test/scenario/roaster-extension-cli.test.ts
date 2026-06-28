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
	return [gitRootResponse(root)];
}

function gitRootResponse(root: string) {
	return {
		match: "git rev-parse --show-toplevel",
		result: { stdout: `${root}\n` },
		repeatable: true,
	};
}

function brmemListResponse() {
	return {
		match: "brmem list --namespace roaster --format json",
		result: {
			stdout: `${JSON.stringify({
				status: "ok",
				exitCode: 0,
				data: {
					entries: [
						{
							namespace: "roaster",
							key: "reviews/typescript-style/2026-06-20T18-43-11-123Z.md",
							branch: "feature/roaster",
							refName:
								"refs/brmem/ns/roaster/feature/roaster:reviews/typescript-style/2026-06-20T18-43-11-123Z.md",
						},
					],
				},
			})}\n`,
		},
	};
}

function brmemPutFailureResponse() {
	return {
		match: (call: { command: string; args: string[] }) =>
			call.command === "brmem" && call.args[0] === "put",
		result: { code: 1, stderr: "simulated brmem write failure\n" },
	};
}

function claudeReviewResponse() {
	return {
		match: (call: { command: string }) => call.command === "claude",
		result: {
			stdout: `${JSON.stringify({ type: "result", structured_output: { findings: [] } })}\n`,
		},
	};
}

function diffText(): string {
	return "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n+changed\n";
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

	test("group help exposes nested Roaster commands without running backends", async () => {
		const run = runWithFakes({
			args: ["roaster", "review", "--help"],
			cwd: repoRoot(),
			homeDir: await isolatedHome(),
			state: { exec: [] },
		});

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: sdl roaster review");
		expect(help).toContain("list");
		expect(help).toContain("ls");
		expect(help).toContain("log");
		expect(help).toContain("run");
		expect(help).not.toContain("exec");
		expect(help).not.toContain("--applicable");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("selected Roaster help loads the command schema without running backends", async () => {
		const run = runWithFakes({
			args: ["roaster", "review", "list", "--help"],
			cwd: repoRoot(),
			homeDir: await isolatedHome(),
			state: { exec: [] },
		});

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: sdl roaster review list");
		expect(help).toContain("--applicable");
		expect(help).toContain("--ci");
		expect(help).toContain("--base-ref");
		expect(help).toContain("gateway-injected");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("selected Roaster command publishes its machine schema", async () => {
		const run = runWithFakes({
			args: ["roaster", "review", "log", "--json-schema"],
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

	test("selected Roaster review list runs through SDL exec-scoped gateways", async () => {
		const root = repoRoot();
		const run = runWithFakes({
			args: ["roaster", "review", "list", "--format", "json"],
			cwd: root,
			homeDir: await isolatedHome(),
			state: { exec: repoRootResponses(root) },
		});

		expect(await run.exit).toBe(0);
		const envelope = parseJsonOutput(run);
		expect(envelope.status).toBe("ok");
		expect(envelope.exitCode).toBe(0);
		expect(envelope.data).toMatchObject({
			reviewsDir: `${root}/.sdl/reviews`,
			count: expect.any(Number),
		});
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls.length).toBeGreaterThan(0);
		expect(run.context.execCalls.every((call) => call.command === "git")).toBe(true);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("selected Roaster review ls aliases list", async () => {
		const root = repoRoot();
		const run = runWithFakes({
			args: ["roaster", "review", "ls", "--format", "json"],
			cwd: root,
			homeDir: await isolatedHome(),
			state: { exec: repoRootResponses(root) },
		});

		expect(await run.exit).toBe(0);
		const envelope = parseJsonOutput(run);
		expect(envelope.status).toBe("ok");
		expect(envelope.data).toMatchObject({ count: expect.any(Number) });
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("selected Roaster review log preserves namespace and review-key semantics", async () => {
		const root = repoRoot();
		const run = runWithFakes({
			args: ["roaster", "review", "log", "typescript-style", "--format", "json"],
			cwd: root,
			homeDir: await isolatedHome(),
			state: { exec: [brmemListResponse()] },
		});

		expect(await run.exit).toBe(0);
		const envelope = parseJsonOutput(run);
		expect(envelope.status).toBe("ok");
		expect(envelope.data).toMatchObject({
			namespace: "roaster",
			reviewKey: "typescript-style",
			count: 1,
		});
		expect((envelope.data as { entries: Array<{ entryKey: string }> }).entries[0]?.entryKey).toBe(
			"reviews/typescript-style/2026-06-20T18-43-11-123Z.md",
		);
		expect(run.context.execCalls.map((call) => call.command)).toEqual(["brmem"]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("selected Roaster review run preserves review result when review-log write fails", async () => {
		const root = repoRoot();
		const run = runWithFakes({
			args: [
				"roaster",
				"review",
				"run",
				"sdl-typescript-style-tripwire",
				"--model",
				"haiku",
				"--base-ref",
				"main",
				"--format",
				"json",
			],
			cwd: root,
			homeDir: await isolatedHome(),
			state: {
				exec: [
					...repoRootResponses(root),
					{
						match: /git -c diff\.noprefix=false .* diff --no-ext-diff origin\/main\.\.\.HEAD/u,
						result: { stdout: diffText() },
					},
					claudeReviewResponse(),
					{ match: "git branch --show-current", result: { stdout: "feature/roaster\n" } },
					{ match: "git rev-parse HEAD", result: { stdout: "abc123\n" } },
					brmemPutFailureResponse(),
				],
			},
		});

		expect(await run.exit).toBe(1);
		const envelope = parseJsonOutput(run);
		expect(envelope.status).toBe("negative");
		expect(envelope.data).toMatchObject({
			reviewName: "sdl-typescript-style-tripwire",
			model: "haiku",
			baseRef: "main",
			count: 0,
		});
		expect(run.stderr.join("")).toContain(
			"resolved model=haiku model_profile=quick base_ref=main changed_paths=1",
		);
		expect(run.context.execCalls.map((call) => call.command)).not.toContain("gh");
	});

	test("hidden Roaster record-findings reads SDL stdin and preserves invalid-JSON failure", async () => {
		const run = runWithFakes({
			args: [
				"roaster",
				"exec",
				"record-findings",
				"--review-key",
				"typescript-style",
				"--format",
				"json",
			],
			cwd: repoRoot(),
			homeDir: await isolatedHome(),
			state: { exec: [], stdin: "not json" },
		});

		expect(await run.exit).toBe(2);
		const envelope = parseJsonOutput(run);
		expect(envelope.status).toBe("failure");
		expect(envelope.errorType).toBe("review_execution_invalid_json");
		expect(run.context.execCalls).toEqual([]);
	});

	test("selected Roaster roast list exposes review-skill entries", async () => {
		const root = repoRoot();
		const run = runWithFakes({
			args: ["roaster", "roast", "list", "--format", "json"],
			cwd: root,
			homeDir: await isolatedHome(),
			state: { exec: repoRootResponses(root) },
		});

		expect(await run.exit).toBe(0);
		const envelope = parseJsonOutput(run);
		expect(envelope.status).toBe("ok");
		const data = envelope.data as { entries: Array<{ surface: string }> };
		expect(data.entries.map((entry) => entry.surface)).toContain(
			"skill:roast-thermonuclear-review",
		);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});
});
