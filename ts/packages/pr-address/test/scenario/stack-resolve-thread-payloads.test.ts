import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";

interface BuildStackResolveThreadPayloadsCase {
	name: string;
	payload_json_template: string;
	expected_exit_code: number;
	expected_envelope_text: string;
}

interface BuildStackResolveThreadPayloadsFixture {
	cases: BuildStackResolveThreadPayloadsCase[];
}

const fixture = JSON.parse(
	await readFile(new URL("../fixtures/stack-orchestration/build-stack-resolve-thread-payloads.json", import.meta.url), "utf8"),
) as BuildStackResolveThreadPayloadsFixture;

interface ManagedRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
}

function runManaged(args: readonly string[]): ManagedRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		exit: runCli(args, {
			context: {},
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			stdin: async () => "",
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}

describe("build-stack-resolve-thread-payloads parity with the Python CLI", () => {
	for (const buildCase of fixture.cases) {
		test(`matches the Python envelope for ${buildCase.name}`, async () => {
			// Payload paths embedded in the stack plan input are inert; the literal
			// {ROOT} placeholder matches the sanitized payload used for generation.
			const run = runManaged(["exec", "build-stack-resolve-thread-payloads", "--payload-json", buildCase.payload_json_template, "--format", "json"]);

			expect(await run.exit).toBe(buildCase.expected_exit_code);
			expect(run.stdout.join("")).toBe(buildCase.expected_envelope_text);
		});
	}

	test("reports invalid_json for malformed payloads", async () => {
		const run = runManaged(["exec", "build-stack-resolve-thread-payloads", "--payload-json", "{", "--format", "json"]);

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string };
		expect(envelope.error_type).toBe("invalid_json");
	});

	test("rejects unknown options as invalid_request", async () => {
		const run = runManaged(["exec", "build-stack-resolve-thread-payloads", "--bogus", "--format", "json"]);

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("--bogus");
	});

	test("serves --json-schema from TypeScript", async () => {
		const stdout: string[] = [];
		const exit = await runCli(["exec", "build-stack-resolve-thread-payloads", "--json-schema"], {
			context: {},
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			stdin: async () => "",
			stdout: (text) => stdout.push(text),
			stderr: () => {},
		});

		expect(exit).toBe(0);
		const document = JSON.parse(stdout.join("")) as Record<string, unknown>;
		expect(Object.keys(document).sort()).toEqual(["input_json_schema", "output_json_schema"]);
	});
});
