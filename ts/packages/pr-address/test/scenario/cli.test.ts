import { z } from "zod";
import { describe, expect, test } from "vitest";

import { exitCodeForExit, failure, negative, ok, toMachineEnvelope } from "@asdl/clinkr";
import { defineExecOperation, type ExecOperation } from "../../src/exec-operation.ts";
import { loadJsonInput } from "../../src/json-input.ts";
import { operationSchemaDocumentNames } from "../../src/operation-schemas/index.ts";
import { EXEC_OPERATION_NAMES } from "../support/operation-names.ts";
import { runScenario } from "../support/run-scenario.ts";

function envelopeOperation(onArgs?: (kind: string | undefined) => void): ExecOperation {
	return defineExecOperation({
		spec: {
			name: "envelope",
			schema: z.object({ kind: z.string().optional() }),
			positionals: { kind: { position: 0 } },
			handler: async (_ctx, request) => {
				onArgs?.(request.kind);
				if (request.kind === "negative") return negative("not valid", { valid: false });
				return failure("invalid_request", "bad input");
			},
		},
	});
}

describe("pr-address CLI", () => {
	test("prints top-level help, version, and runtime", async () => {
		const help = runScenario(["--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: pr-address");
		expect(help.stdout.join("")).toContain("--runtime");

		const version = runScenario(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toBe("0.1.0\n");

		const runtime = runScenario(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toBe(
			"runtime: typescript\nentry_point: @asdl/pr-address bin pr-address -> ts/packages/pr-address/src/cli.ts\n",
		);
	});

	test("hides the exec subgroup from top-level help while keeping it invocable", async () => {
		const help = runScenario(["--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).not.toContain("exec");
	});

	test("prints generated exec help listing only downloader operations", async () => {
		const run = runScenario(["exec", "--help"]);
		expect(await run.exit).toBe(0);
		const helpText = run.stdout.join("");
		expect(helpText).toContain("download-feedback");
		expect(helpText).toContain("map-branch-prs");
		expect(helpText).not.toContain("prepare-run");
		expect(helpText).not.toContain("resolve-thread");
	});

	test("rejects retired exec operations as unknown commands", async () => {
		const run = runScenario(["exec", "prepare-run", "--format", "json"]);
		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toBe("error: unknown command 'prepare-run'\n");
	});

	test("serves retained schema documents locally", async () => {
		for (const operation of ["download-feedback", "map-branch-prs"]) {
			const run = runScenario(["exec", operation, "--json-schema"]);
			expect(await run.exit).toBe(0);
			const payload = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
			expect(Object.keys(payload).sort()).toEqual(["input_json_schema", "output_json_schema"]);
		}
	});

	test("supports injected stdin for managed exec operations", async () => {
		const echoOperation = defineExecOperation({
			spec: {
				name: "echo-json",
				schema: z.object({}),
				handler: async (ctx) => {
					const input = await loadJsonInput({
						optionValue: undefined,
						commandName: "echo-json",
						inputDescription: "payload",
						optionName: "--payload-json",
						schema: z.object({ ok: z.boolean() }),
						stdin: ctx.stdin,
					});
					if (input.type === "error") return failure(input.error.errorType, input.error.message);
					return ok(input.value);
				},
			},
		});
		const run = runScenario(["exec", "echo-json", "--format", "json"], {
			operations: [echoOperation],
			stdin: async () => '{"ok":true}',
		});
		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join("")).data).toEqual({ ok: true });
	});

	test("maps managed Clinkr envelope exits to process exit codes", async () => {
		const operations = [envelopeOperation()];
		const negativeRun = runScenario(["exec", "envelope", "negative", "--format", "json"], {
			operations,
		});
		expect(await negativeRun.exit).toBe(0);
		expect(JSON.parse(negativeRun.stdout.join(""))).toEqual({
			exit_code: 1,
			message: "not valid",
			data: { valid: false },
		});

		const failureRun = runScenario(["exec", "envelope", "failure", "--format", "json"], {
			operations,
		});
		expect(await failureRun.exit).toBe(2);
		expect(JSON.parse(failureRun.stdout.join(""))).toEqual({
			exit_code: 2,
			error_type: "invalid_request",
			message: "bad input",
		});

		expect(exitCodeForExit(ok({}))).toBe(0);
		expect(toMachineEnvelope(failure("invalid_request", "bad input"))).toEqual({
			exit_code: 2,
			error_type: "invalid_request",
			message: "bad input",
		});
	});
});

describe("pr-address exec operation table", () => {
	test("every operation serves a pinned schema document and vice versa (1:1)", () => {
		const tableNames = [...EXEC_OPERATION_NAMES].sort();
		const builderNames = [...operationSchemaDocumentNames()].sort();
		expect(tableNames).toEqual(builderNames);
		expect(tableNames).toEqual(["download-feedback", "map-branch-prs"]);
	});
});
