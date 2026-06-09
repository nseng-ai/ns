import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import type { LegacyPrAddressGateway } from "../../src/legacy-python.ts";
import { InMemoryLegacyPrAddressGateway } from "../support/in-memory-legacy-pr-address-gateway.ts";

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
	const legacy: LegacyPrAddressGateway = {
		run: async () => {
			throw new Error("unexpected legacy fallback");
		},
	};
	return {
		exit: runCli(args, {
			context: { legacy },
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

	test("delegates --json-schema to the legacy CLI", async () => {
		const stdout: string[] = [];
		const legacy = new InMemoryLegacyPrAddressGateway([0]);
		const exit = await runCli(["exec", "build-stack-resolve-thread-payloads", "--json-schema"], {
			context: { legacy },
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			stdin: async () => "",
			stdout: (text) => stdout.push(text),
			stderr: () => {},
		});

		expect(exit).toBe(0);
		expect(legacy.calls.map((call) => call.args)).toEqual([["exec", "build-stack-resolve-thread-payloads", "--json-schema"]]);
	});
});
