import { z } from "zod";
import { describe, expect, test } from "vitest";

import { exitCodeForExit, failure, negative, ok, toMachineEnvelope } from "@asdl/clinkr";
import { EXEC_OPERATION_NAMES, EXEC_OPERATIONS } from "../../src/exec-commands.ts";
import { defineExecOperation, type ExecOperation } from "../../src/exec-operation.ts";
import { loadJsonInput } from "../../src/json-input.ts";
import { operationSchemaDocumentNames } from "../../src/operation-schemas/index.ts";
import { runScenarioWithLegacy } from "../support/run-scenario.ts";

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
		const help = runScenarioWithLegacy(["--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: pr-address");
		expect(help.stdout.join("")).toContain("--runtime");
		expect(help.legacy.calls).toEqual([]);

		const version = runScenarioWithLegacy(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toBe("0.1.0\n");
		expect(version.legacy.calls).toEqual([]);

		const runtime = runScenarioWithLegacy(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toBe("runtime: typescript\nentry_point: @asdl/pr-address bin pr-address -> ts/packages/pr-address/src/cli.ts\n");
		expect(runtime.legacy.calls).toEqual([]);
	});

	test("hides the exec subgroup from top-level help while keeping it invocable", async () => {
		// PINNED CLINKR SEMANTICS: the hidden exec subgroup is omitted from
		// top-level help (Python parity); `pr-address exec --help` still works.
		const help = runScenarioWithLegacy(["--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).not.toContain("exec");
	});

	test("rejects unknown top-level commands with a commander usage error", async () => {
		const run = runScenarioWithLegacy(["bogus"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: unknown command 'bogus'\n");
		expect(run.legacy.calls).toEqual([]);
	});

	test("prints generated exec help listing every operation", async () => {
		const run = runScenarioWithLegacy(["exec", "--help"]);

		expect(await run.exit).toBe(0);
		const helpText = run.stdout.join("");
		expect(helpText).toContain("Usage: pr-address exec");
		expect(helpText).toContain("Operations for the pr-address skill.");
		for (const name of EXEC_OPERATION_NAMES) {
			expect(helpText).toContain(name);
		}
		expect(run.legacy.calls).toEqual([]);

		const bare = runScenarioWithLegacy(["exec"]);
		expect(await bare.exit).toBe(0);
		expect(bare.stdout.join("")).toBe(helpText);
	});

	test("delegates genuinely unknown exec operations to the legacy gateway verbatim", async () => {
		const run = runScenarioWithLegacy(["exec", "totally-unknown-op", "12", "--whatever", "x"], { legacyExitCodes: [7] });

		expect(await run.exit).toBe(7);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("");
		expect(run.legacy.calls).toEqual([
			{
				args: ["exec", "totally-unknown-op", "12", "--whatever", "x"],
				options: { cwd: "/repo", env: { PATH: "/fake/bin" } },
			},
		]);
	});

	test("preserves nonzero legacy exit codes for unknown operations", async () => {
		const run = runScenarioWithLegacy(["exec", "another-unknown-op"], { legacyExitCodes: [2] });

		expect(await run.exit).toBe(2);
		expect(run.legacy.calls.map((call) => call.args)).toEqual([["exec", "another-unknown-op"]]);
	});

	test("rejects bogus enum option values as usage errors without the legacy CLI", async () => {
		// PINNED CLINKR SEMANTICS: value-based fallback is collapsed — bogus
		// --payload-mode values are strict-enum commander usage errors, not
		// legacy click rendering.
		const run = runScenarioWithLegacy(["exec", "get-feedback", "12", "--payload-mode", "bogus", "--format", "json"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe(
			"error: option '--payload-mode <value>' argument 'bogus' is invalid. Allowed choices are inline, payload.\n",
		);
		expect(run.legacy.calls).toEqual([]);
	});

	test("serves managed classification-template schema locally without invoking legacy", async () => {
		const run = runScenarioWithLegacy(["exec", "classification-template", "--json-schema"]);

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.legacy.calls).toEqual([]);
		const payload = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
		expect(Object.keys(payload).sort()).toEqual(["input_json_schema", "output_json_schema"]);
		expect(JSON.stringify(payload.input_json_schema)).toContain("manifest_json");
		expect(JSON.stringify(payload.output_json_schema)).toContain("classification_template");
	});

	test("serves managed classification-template execution locally", async () => {
		const manifest = {
			payload_reference: { payload_path: "payload.json" },
			pr_number: 42,
			reviews: [],
			review_threads: [],
			discussion_comments: [],
		};
		const run = runScenarioWithLegacy(["exec", "classification-template", "--format", "json"], {
			legacyExitCodes: [0],
			stdin: async () => JSON.stringify(manifest),
		});

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join("")).data).toMatchObject({ manifest_kind: "get_feedback", pr_number: 42 });
		expect(run.legacy.calls).toEqual([]);
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
		const run = runScenarioWithLegacy(["exec", "echo-json", "--format", "json"], {
			legacyExitCodes: [0],
			operations: [echoOperation],
			stdin: async () => '{"ok":true}',
		});

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join("")).data).toEqual({ ok: true });
		expect(run.stderr.join("")).toBe("");
		expect(run.legacy.calls).toEqual([]);
	});

	test("maps managed Clinkr envelope exits to process exit codes", async () => {
		const operations = [envelopeOperation()];

		const negativeRun = runScenarioWithLegacy(["exec", "envelope", "negative", "--format", "json"], { legacyExitCodes: [0], operations });
		expect(await negativeRun.exit).toBe(1);
		expect(JSON.parse(negativeRun.stdout.join(""))).toEqual({ exit_code: 1, message: "not valid", data: { valid: false } });

		const failureRun = runScenarioWithLegacy(["exec", "envelope", "failure", "--format", "json"], { legacyExitCodes: [0], operations });
		expect(await failureRun.exit).toBe(2);
		expect(JSON.parse(failureRun.stdout.join(""))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });

		expect(exitCodeForExit(ok({}))).toBe(0);
		expect(toMachineEnvelope(failure("invalid_request", "bad input"))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });
	});

	test("strictly rejects non-decimal integer forms through the real CLI path", async () => {
		// PINNED CLINKR SEMANTICS: strict-int rejection is a raw commander usage
		// error (stderr, exit 2), never a machine envelope — click parity.
		for (const value of ["1e2", "0x10", "12.5", "12abc"]) {
			const prRun = runScenarioWithLegacy(["exec", "get-feedback", value, "--format=json"]);
			expect(await prRun.exit).toBe(2);
			expect(prRun.stdout.join("")).toBe("");
			expect(prRun.stderr.join("")).toContain("expected an integer");
			expect(prRun.legacy.calls).toEqual([]);

			const bodyCharsRun = runScenarioWithLegacy(["exec", "summarize-feedback", "123", "--body-chars", value, "--format=json"]);
			expect(await bodyCharsRun.exit).toBe(2);
			expect(bodyCharsRun.stdout.join("")).toBe("");
			expect(bodyCharsRun.stderr.join("")).toContain("expected an integer");
			expect(bodyCharsRun.legacy.calls).toEqual([]);
		}
	});

	test("accepts plain decimal integers before reaching later gateway validation", async () => {
		const prRun = runScenarioWithLegacy(["exec", "get-feedback", "123", "--format=json"]);
		expect(await prRun.exit).toBe(2);
		expect(JSON.parse(prRun.stdout.join(""))).toMatchObject({ error_type: "payload_session_required" });

		const bodyCharsRun = runScenarioWithLegacy(["exec", "summarize-feedback", "123", "--body-chars", "12", "--format=json"]);
		expect(await bodyCharsRun.exit).toBe(1);
		const bodyCharsEnvelope = JSON.parse(bodyCharsRun.stdout.join("")) as { exit_code: number; message: string };
		expect(bodyCharsEnvelope.exit_code).toBe(1);
		expect(bodyCharsEnvelope.message).toContain("No PR found for PR 123");
	});
});

describe("pr-address exec operation table", () => {
	test("every operation serves a pinned schema document and vice versa (1:1)", () => {
		const tableNames = [...EXEC_OPERATION_NAMES].sort();
		const builderNames = [...operationSchemaDocumentNames()].sort();
		expect(tableNames).toEqual(builderNames);
		expect(EXEC_OPERATIONS).toHaveLength(21);
	});
});

describe("pr-address CLI surface pinning", () => {
	const topLevelHelp = [
		"Usage: pr-address [options] [command]",
		"",
		"PR review address operations.",
		"",
		"Options:",
		"  -V, --version  Show the package version.",
		"  --runtime      Show CLI runtime diagnostics and exit.",
		"  -h, --help     display help for command",
		"",
	].join("\n");

	test.each([[[]], [["-h"]], [["--help"]]])("pins top-level help bytes for %j", async (args) => {
		const run = runScenarioWithLegacy(args);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(topLevelHelp);
		expect(run.stderr.join("")).toBe("");
		expect(run.legacy.calls).toEqual([]);
	});

	test("pins -V output", async () => {
		const run = runScenarioWithLegacy(["-V"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("0.1.0\n");
		expect(run.stderr.join("")).toBe("");
		expect(run.legacy.calls).toEqual([]);
	});

	test("--format json and --format=json select machine-envelope output", async () => {
		const spacedRun = runScenarioWithLegacy(["exec", "envelope", "--format", "json"], { operations: [envelopeOperation()] });
		const inlineRun = runScenarioWithLegacy(["exec", "envelope", "--format=json"], { operations: [envelopeOperation()] });

		expect(await spacedRun.exit).toBe(2);
		expect(await inlineRun.exit).toBe(2);
		expect(JSON.parse(spacedRun.stdout.join(""))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });
		expect(JSON.parse(inlineRun.stdout.join(""))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });
		expect(spacedRun.stderr.join("")).toBe("");
		expect(inlineRun.stderr.join("")).toBe("");
		expect(spacedRun.legacy.calls).toEqual([]);
		expect(inlineRun.legacy.calls).toEqual([]);
	});

	test("repeated --format flags are last-wins", async () => {
		// PINNED CLINKR SEMANTICS: commander last-wins, matching the Python CLI
		// (probed: `--format human --format json` emits the JSON envelope).
		const json = runScenarioWithLegacy(["exec", "envelope", "--format", "human", "--format", "json"], { operations: [envelopeOperation()] });
		expect(await json.exit).toBe(2);
		expect(json.stderr.join("")).toBe("");
		expect(JSON.parse(json.stdout.join(""))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });

		const human = runScenarioWithLegacy(["exec", "envelope", "--format", "json", "--format", "human"], { operations: [envelopeOperation()] });
		expect(await human.exit).toBe(2);
		expect(human.stdout.join("")).toBe("");
		expect(human.stderr.join("")).toBe("error: bad input\n");
	});

	test("--format markdown and md render through the human channel", async () => {
		for (const value of ["markdown", "md"]) {
			const run = runScenarioWithLegacy(["exec", "envelope", "--format", value], { operations: [envelopeOperation()] });
			expect(await run.exit).toBe(2);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).toBe("error: bad input\n");
		}
	});

	test("pins indent-2 ensure_ascii machine envelope bytes", async () => {
		const snowmanOperation = defineExecOperation({
			spec: {
				name: "envelope",
				schema: z.object({}),
				handler: async () => failure("invalid_request", "bad snowman ☃"),
			},
		});
		const run = runScenarioWithLegacy(["exec", "envelope", "--format", "json"], { operations: [snowmanOperation] });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe('{\n  "exit_code": 2,\n  "error_type": "invalid_request",\n  "message": "bad snowman \\u2603"\n}\n');
		expect(run.stderr.join("")).toBe("");
		expect(run.legacy.calls).toEqual([]);
	});
});
