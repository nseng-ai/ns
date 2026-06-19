import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

describe("aretro CLI shape", () => {
	it("prints version and TypeScript runtime diagnostics", async () => {
		const version = runScenario(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toContain("0.1.0");

		const runtime = runScenario(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toContain("runtime: typescript");
		expect(runtime.stdout.join("")).toContain("ts/packages/aretro/src/cli.ts");
	});

	it("shows exec subgroup hidden from top-level help", async () => {
		const run = runScenario(["--help"]);
		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("aretro");
		expect(help).toContain("retrospective evidence");
		expect(help).not.toContain("collect-evidence");
		expect(help).not.toContain("read-evidence-detail");
	});

	it("keeps hidden exec collect-evidence invocable", async () => {
		const run = runScenario(["exec", "collect-evidence", "--help"]);
		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("collect-evidence");
		expect(help).toContain("--repo");
		expect(help).toContain("--branch");
		expect(help).toContain("--session-root");
		expect(help).toContain("--max-sessions");
		expect(help).toContain("--payload-mode");
		expect(help).toContain("--payload-session-id");
		// format is automatically added by clinkr
	});

	it("keeps hidden exec read-evidence-detail invocable", async () => {
		const run = runScenario(["exec", "read-evidence-detail", "--help"]);
		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("read-evidence-detail");
		expect(help).toContain("pointer");
		// format is automatically added by clinkr
	});
});

describe("aretro exec collect-evidence", () => {
	it("returns JSON envelope with expected top-level fields", async () => {
		const run = runScenario([
			"exec",
			"collect-evidence",
			"--format",
			"json",
			"--repo",
			"/test/repo",
			"--branch",
			"test-branch",
		]);
		expect(await run.exit).toBe(0);
		const result = parseJsonOutput(run);
		expect(result).toMatchObject({ exit_code: 0 });
		const envelope = (result as { data: unknown }).data;
		expect(envelope).toMatchObject({
			success: true,
			repo: "/test/repo",
			query: {
				branch: "test-branch",
				max_sessions: 20,
				payload_mode: "inline",
			},
			source: expect.any(String),
			aggregate_metrics: expect.any(Object),
			sessions: expect.any(Array),
			warnings: expect.any(Array),
			evidence_items: expect.any(Array),
		});
	});

	it("includes optional query fields when provided", async () => {
		const run = runScenario([
			"exec",
			"collect-evidence",
			"--format",
			"json",
			"--session-root",
			"/session-data",
			"--max-sessions",
			"10",
			"--payload-mode",
			"payload",
			"--payload-session-id",
			"session-123",
		]);
		expect(await run.exit).toBe(0);
		const result = parseJsonOutput(run);
		const envelope = (result as { data: unknown }).data;
		expect(envelope).toMatchObject({
			query: {
				session_root: "/session-data",
				max_sessions: 10,
				payload_mode: "payload",
				payload_session_id: "session-123",
			},
		});
	});

	it("returns human-readable placeholder when format is human", async () => {
		const run = runScenario(["exec", "collect-evidence", "--format", "human"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Placeholder");
		expect(run.stdout.join("")).toContain("contract-only");
	});
});

describe("aretro exec read-evidence-detail", () => {
	it("returns not-yet-implemented error as JSON", async () => {
		const run = runScenario(["exec", "read-evidence-detail", "some-pointer", "--format", "json"]);
		expect(await run.exit).toBe(2);
		const result = parseJsonOutput(run);
		expect(result).toMatchObject({
			exit_code: 2,
			error_type: "not-yet-implemented",
			message: expect.stringContaining("Not yet implemented"),
		});
	});

	it("returns not-yet-implemented error as human text", async () => {
		const run = runScenario(["exec", "read-evidence-detail", "some-pointer", "--format", "human"]);
		expect(await run.exit).toBe(2);
		// failure messages go to stderr in human mode
		expect(run.stderr.join("")).toContain("Not yet implemented");
	});
});
