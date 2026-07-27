import { describe, expect, it } from "vitest";

import { exitedResult, parseJsonOutput, runScenario } from "./run-scenario.ts";

const NS_TOML = `
[models.profiles.fast]
model = "vercel-ai-gateway/openai/gpt-5.6-luna"
thinking = "medium"
`;

const BASE_FILES = { "/repo/ns.toml": NS_TOML };

describe("caveman", () => {
	it("shows help with input and intensity flags", async () => {
		const help = runScenario(["caveman", "--help"]);
		expect(await help.exit).toBe(0);
		const stdout = help.stdout.join("");
		expect(stdout).toContain("--file");
		expect(stdout).toContain("--lite");
		expect(stdout).toContain("--full");
		expect(stdout).toContain("--ultra");
	});

	it("publishes the machine envelope schema", async () => {
		const schema = runScenario(["caveman", "--json-schema"]);
		expect(await schema.exit).toBe(0);
		expect(JSON.parse(schema.stdout.join(""))).toMatchObject({
			machineEnvelopeJsonSchema: { oneOf: expect.any(Array) },
		});
	});

	it("requires input text or --file", async () => {
		const run = runScenario(["caveman", "--format", "json"], { files: BASE_FILES });
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "usageError",
			data: { argument: "<text>" },
		});
	});

	it("rejects text and --file together", async () => {
		const run = runScenario(
			["caveman", "some text", "--file", "/repo/notes.md", "--format", "json"],
			{ files: { ...BASE_FILES, "/repo/notes.md": "note" } },
		);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "usageError",
			data: { argument: "--file" },
		});
	});

	it("rejects combined intensity flags", async () => {
		const run = runScenario(["caveman", "some text", "--lite", "--ultra", "--format", "json"], {
			files: BASE_FILES,
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "usageError",
			data: { arguments: ["--lite", "--ultra"] },
		});
	});

	it("rejects a missing --file path", async () => {
		const run = runScenario(["caveman", "--file", "/repo/missing.md", "--format", "json"], {
			files: BASE_FILES,
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "usageError",
			data: { argument: "--file" },
		});
	});

	it("fails when ns.toml is not found", async () => {
		const run = runScenario(["caveman", "some text", "--format", "json"], { files: {} });
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "model-policy-error",
		});
	});

	it("compresses positional text through the pi model", async () => {
		const run = runScenario(
			["caveman", "I would really just like to fix the bug now.", "--format", "json"],
			{
				files: BASE_FILES,
				commandResults: [exitedResult({ stdout: "Fix bug now.\n" })],
			},
		);
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				output: "Fix bug now.",
				intensity: "full",
				provider: "vercel-ai-gateway",
				model: "openai/gpt-5.6-luna",
			},
		});

		expect(run.calls).toHaveLength(1);
		const call = run.calls[0];
		expect(call?.command).toBe("pi");
		expect(call?.args).toContain("--provider");
		expect(call?.args).toContain("vercel-ai-gateway");
		expect(call?.args).toContain("openai/gpt-5.6-luna");
		const prompt = call?.args.at(-1) ?? "";
		expect(prompt).toContain("smart caveman");
		expect(prompt).toContain('intensity "full"');
		expect(prompt).toContain("I would really just like to fix the bug now.");
	});

	it("reports progress on stderr while rewriting a file", async () => {
		const run = runScenario(["caveman", "--file", "CONTEXT.md", "--full", "--format", "json"], {
			files: { ...BASE_FILES, "/repo/CONTEXT.md": "Long project context." },
			commandResults: [exitedResult({ stdout: "Project context.\n" })],
		});
		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("ns-dev caveman: rewriting /repo/CONTEXT.md with model…\n");
	});

	it("rewrites --file input in place without model-generated trailing whitespace", async () => {
		const run = runScenario(["caveman", "--file", "notes.md", "--ultra", "--format", "json"], {
			files: { ...BASE_FILES, "/repo/notes.md": "The database connection pool is exhausted." },
			commandResults: [exitedResult({ stdout: "**Database**:  \r\nDB pool exhausted. \r\n" })],
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: { output: "**Database**:\nDB pool exhausted.", intensity: "ultra" },
		});
		expect(run.fs.writtenFiles).toContainEqual({
			path: "/repo/notes.md",
			content: "**Database**:\nDB pool exhausted.",
		});
		const prompt = run.calls[0]?.args.at(-1) ?? "";
		expect(prompt).toContain('intensity "ultra"');
		expect(prompt).toContain("The database connection pool is exhausted.");
	});

	it("reports --file write failures", async () => {
		const run = runScenario(["caveman", "--file", "notes.md", "--format", "json"], {
			files: { ...BASE_FILES, "/repo/notes.md": "Please fix the bug." },
			writeFailures: { "/repo/notes.md": "permission denied" },
			commandResults: [exitedResult({ stdout: "Fix bug.\n" })],
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "file-write-error",
			data: { path: "/repo/notes.md" },
		});
	});

	it("renders only the rewritten text for humans", async () => {
		const run = runScenario(["caveman", "please fix it", "--lite"], {
			files: BASE_FILES,
			commandResults: [exitedResult({ stdout: "Fix it.\n" })],
		});
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("Fix it.\n");
	});

	it("surfaces model failures as a failure envelope", async () => {
		const run = runScenario(["caveman", "please fix it", "--format", "json"], {
			files: BASE_FILES,
			commandResults: [exitedResult({ code: 1, stderr: "model exploded" })],
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "model-error",
		});
	});
});
