import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
		expect(help).toContain("--payload-path");
		expect(help).toContain("--json-pointer");
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
			"--branch",
			"test-branch",
		]);
		expect(await run.exit).toBe(0);
		const result = parseJsonOutput(run);
		expect(result).toMatchObject({ exit_code: 0 });
		const envelope = (result as { data: Record<string, unknown> }).data;
		expect(envelope.success).toBe(true);
		expect(envelope.repo).toMatchObject({
			branch: "test-branch",
			branch_source: "explicit",
		});
		expect(envelope.query).toMatchObject({
			max_sessions: 20,
		});
		expect(envelope).toHaveProperty("source");
		expect(envelope).toHaveProperty("aggregate_metrics");
		expect(envelope).toHaveProperty("sessions");
		expect(envelope).toHaveProperty("warnings");
		expect(envelope).toHaveProperty("evidence_items");
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
		]);
		expect(await run.exit).toBe(0);
		const result = parseJsonOutput(run);
		const envelope = (result as { data: Record<string, unknown> }).data;
		expect(envelope.query).toMatchObject({
			session_root: "/session-data",
			max_sessions: 10,
		});
	});

	it("returns human-readable output when format is human", async () => {
		const run = runScenario(["exec", "collect-evidence", "--format", "human"]);
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Collected");
		expect(output).toContain("session(s)");
	});
});

describe("aretro exec read-evidence-detail", () => {
	it("requires --payload-path and --json-pointer options", async () => {
		const run = runScenario(["exec", "read-evidence-detail", "--format", "json"]);
		expect(await run.exit).not.toBe(0);
		const stderr = run.stderr.join("");
		expect(stderr).toContain("--payload-path");
		expect(stderr).toContain("--json-pointer");
	});

	it("rejects invalid payload path", async () => {
		const run = runScenario([
			"exec",
			"read-evidence-detail",
			"--payload-path",
			"/nonexistent/path.raw.json",
			"--json-pointer",
			"/data",
			"--format",
			"json",
		]);
		expect(await run.exit).toBe(2);
		const result = parseJsonOutput(run) as { exit_code: number; error_type: string };
		expect(result.exit_code).toBe(2);
		expect(result.error_type).toBe("payload_lookup_failed");
	});

	it("rejects pointers outside payload data", async () => {
		const run = runScenario([
			"exec",
			"read-evidence-detail",
			"--payload-path",
			"/nonexistent/path.raw.json",
			"--json-pointer",
			"/not-data",
			"--format",
			"json",
		]);
		expect(await run.exit).toBe(2);
		const result = parseJsonOutput(run) as { exit_code: number; error_type: string };
		expect(result.exit_code).toBe(2);
		expect(result.error_type).toBe("invalid_request");
	});

	it("rejects non-success and unsupported-schema payload envelopes", async () => {
		const nonSuccessPath = writePayloadEnvelope({ exit_code: 1, message: "nope" }, "non-success");
		const nonSuccess = runScenario([
			"exec",
			"read-evidence-detail",
			"--payload-path",
			nonSuccessPath,
			"--json-pointer",
			"/data",
			"--format",
			"json",
		]);
		expect(await nonSuccess.exit).toBe(2);
		expect(parseJsonOutput(nonSuccess)).toMatchObject({
			exit_code: 2,
			error_type: "payload_lookup_failed",
		});

		const unsupportedSchemaPath = writePayloadEnvelope(
			{ exit_code: 0, data: { schema_version: 2 } },
			"unsupported-schema",
		);
		const unsupportedSchema = runScenario([
			"exec",
			"read-evidence-detail",
			"--payload-path",
			unsupportedSchemaPath,
			"--json-pointer",
			"/data",
			"--format",
			"json",
		]);
		expect(await unsupportedSchema.exit).toBe(2);
		expect(parseJsonOutput(unsupportedSchema)).toMatchObject({
			exit_code: 2,
			error_type: "payload_lookup_failed",
		});
	});
});

function writePayloadEnvelope(envelope: unknown, descriptor: string): string {
	const payloadDir = join(tmpdir(), `aretro-${descriptor}`, "sessions", "smoke", "payloads");
	mkdirSync(payloadDir, { recursive: true });
	const payloadPath = join(payloadDir, `20260101t000000z-0001-${descriptor}.raw.json`);
	writeFileSync(payloadPath, `${JSON.stringify(envelope, null, 2)}\n`);
	return payloadPath;
}
