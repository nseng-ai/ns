import { describe, expect, test } from "vitest";

import type { ExecResult } from "@nseng-ai/foundation/command";
import { loadGraphiteTopology } from "../../src/land/stack/graphite-topology.ts";
import type { LandExecutionApi } from "../../src/land/stack/types.ts";
import { metadataDbJson, metadataSuccessEnvelopeJson, topologyArgs } from "./land-test-helpers.ts";

const ROOT = "/repo";
const DB_PATH = `${ROOT}/.git/.graphite_metadata.db`;

function execResult(overrides: Partial<Extract<ExecResult, { type: "exited" }>> = {}): ExecResult {
	return {
		type: "exited",
		stdout: "",
		stderr: "",
		code: 0,
		signal: null,
		...overrides,
	};
}

async function load(result: ExecResult) {
	const calls: Array<{ command: string; args: string[] }> = [];
	const pi: LandExecutionApi = {
		async exec(command, args) {
			calls.push({ command, args });
			return result;
		},
	};
	const loaded = await loadGraphiteTopology(pi, ROOT, DB_PATH);
	expect(calls).toEqual([{ command: "ns", args: topologyArgs(DB_PATH) }]);
	return loaded;
}

function expectFailureMessage(result: Awaited<ReturnType<typeof load>>): string {
	expect(result.type).toBe("failure");
	if (result.type !== "failure") throw new Error("Expected topology load to fail.");
	expect(result.failure).toMatchObject({
		displayCommand: `ns flow exec read-graphite-branch-metadata --db-path ${DB_PATH} --format json`,
		execResult: expect.any(Object),
	});
	return result.failure.message;
}

describe("Graphite metadata Clinkr envelope decoding", () => {
	test("accepts typed row-array data", async () => {
		const rows = metadataDbJson([
			{ branch: "main", children: ["feature"], trunk: true },
			{ branch: "feature", parent: "main", children: [] },
		]);
		const result = await load(execResult({ stdout: `${metadataSuccessEnvelopeJson(rows)}\n` }));

		expect(result.type).toBe("success");
		if (result.type !== "success") throw new Error("Expected topology load to succeed.");
		expect([...result.value.keys()]).toEqual(["main", "feature"]);
	});

	test.each([
		["serialized-string data", JSON.stringify({ status: "success", exitCode: 0, data: "[]" })],
		["bare array", "[]"],
		["malformed JSON", "not json"],
		["non-object output", "null"],
		[
			"unsuccessful envelope",
			JSON.stringify({
				status: "failure",
				exitCode: 2,
				errorType: "flow-command-failed",
				message: "bad",
			}),
		],
		["missing data", JSON.stringify({ status: "success", exitCode: 0 })],
		["non-array data", JSON.stringify({ status: "success", exitCode: 0, data: {} })],
		["mismatched status", JSON.stringify({ status: "failure", exitCode: 0, data: [] })],
		["mismatched exit code", JSON.stringify({ status: "success", exitCode: 2, data: [] })],
	] as const)("fails closed for %s", async (_case, stdout) => {
		const message = expectFailureMessage(await load(execResult({ stdout })));
		expect(message).toMatch(/unparsable JSON|malformed success envelope/);
	});

	test("preserves topology corruption refusals after envelope decoding", async () => {
		const rows = JSON.stringify([
			{
				branch_name: "feature",
				parent_branch_name: "main",
				children: "not json",
				validation_result: "VALID",
			},
		]);
		const result = await load(execResult({ stdout: metadataSuccessEnvelopeJson(rows) }));
		expect(result.type).toBe("failure");
		if (result.type !== "failure") throw new Error("Expected topology corruption to fail.");
		expect(result.failure.message).toContain("metadata children for feature could not be parsed");
	});

	test.each([
		["missing database", "Error: unable to open database file", "missing or unreadable"],
		[
			"unsupported schema",
			"Error: no such table: branch_metadata",
			"expected branch_metadata schema",
		],
	] as const)("classifies %s from a JSON failure envelope", async (_case, diagnostic, expected) => {
		const stdout = JSON.stringify({
			status: "failure",
			exitCode: 2,
			errorType: "flow-command-failed",
			message: diagnostic,
		});
		const message = expectFailureMessage(await load(execResult({ stdout, code: 2 })));
		expect(message).toContain(expected);
	});
});
