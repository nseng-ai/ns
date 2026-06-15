import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";
import { describe, expect, test } from "vitest";

import { exitCodeForExit, failure, negative, ok, toMachineEnvelope } from "@asdl/clinkr";
import { EXEC_OPERATIONS } from "../../src/exec-commands.ts";
import { defineExecOperation, type ExecOperation } from "../../src/exec-operation.ts";
import { loadJsonInput } from "../../src/json-input.ts";
import { operationSchemaDocumentNames } from "../../src/operation-schemas/index.ts";
import { PayloadStore } from "../../src/payload-store.ts";
import { prArtifactDescriptor } from "../../src/session-artifacts.ts";
import { EXEC_OPERATION_NAMES } from "../support/operation-names.ts";
import { fixedClock, runScenario } from "../support/run-scenario.ts";

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
		expect(runtime.stdout.join("")).toBe("runtime: typescript\nentry_point: @asdl/pr-address bin pr-address -> ts/packages/pr-address/src/cli.ts\n");
	});

	test("hides the exec subgroup from top-level help while keeping it invocable", async () => {
		// PINNED CLINKR SEMANTICS: the hidden exec subgroup is omitted from
		// top-level help (Python parity); `pr-address exec --help` still works.
		const help = runScenario(["--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).not.toContain("exec");
	});

	test("rejects unknown top-level commands with a commander usage error", async () => {
		const run = runScenario(["bogus"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: unknown command 'bogus'\n");
	});

	test("prints generated exec help listing every operation", async () => {
		const run = runScenario(["exec", "--help"]);

		expect(await run.exit).toBe(0);
		const helpText = run.stdout.join("");
		expect(helpText).toContain("Usage: pr-address exec");
		expect(helpText).toContain("Operations for the pr-address skill.");
		for (const name of EXEC_OPERATION_NAMES) {
			expect(helpText).toContain(name);
		}

		const bare = runScenario(["exec"]);
		expect(await bare.exit).toBe(0);
		expect(bare.stdout.join("")).toBe(helpText);
	});

	test("rejects genuinely unknown exec operations with a clinkr usage error", async () => {
		const run = runScenario(["exec", "totally-unknown-op", "12", "--whatever", "x"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: unknown command 'totally-unknown-op'\n");
	});

	test("rejects bogus enum option values as usage errors without the legacy CLI", async () => {
		// PINNED CLINKR SEMANTICS: value-based fallback is collapsed — bogus
		// --payload-mode values are strict-enum commander usage errors, not
		// legacy click rendering.
		const run = runScenario(["exec", "get-feedback", "12", "--payload-mode", "bogus", "--format", "json"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe(
			"error: option '--payload-mode <value>' argument 'bogus' is invalid. Allowed choices are inline, payload.\n",
		);
	});

	test("serves managed classification-template schema locally without invoking legacy", async () => {
		const run = runScenario(["exec", "classification-template", "--json-schema"]);

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		const payload = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
		expect(Object.keys(payload).sort()).toEqual(["input_json_schema", "output_json_schema"]);
		expect(JSON.stringify(payload.input_json_schema)).toContain("pr_number");
		expect(JSON.stringify(payload.input_json_schema)).not.toContain("manifest_json");
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
		const root = join(await mkdtemp(join(tmpdir(), "pr-address-cli-")), "payload-root");
		const sessionId = "classification-template-cli";
		const store = await PayloadStore.open({ root, sessionId, clock: fixedClock("2026-06-09T08:30:00Z") });
		if (store.type !== "ok") throw new Error(store.message);
		const artifact = await store.value.writeJsonArtifact({ descriptor: prArtifactDescriptor({ prNumber: 42, kind: "manifest" }), role: "summary", payload: manifest });
		if (artifact.type !== "ok") throw new Error(artifact.message);
		const run = runScenario(["exec", "classification-template", "--pr-number", "42", "--format", "json", "--stdout-mode", "full"], {
			env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: sessionId },
		});

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join("")).data).toMatchObject({ manifest_kind: "get_feedback", pr_number: 42 });
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
		expect(run.stderr.join("")).toBe("");
	});

	test("maps managed Clinkr envelope exits to process exit codes", async () => {
		const operations = [envelopeOperation()];

		const negativeRun = runScenario(["exec", "envelope", "negative", "--format", "json"], { operations });
		expect(await negativeRun.exit).toBe(1);
		expect(JSON.parse(negativeRun.stdout.join(""))).toEqual({ exit_code: 1, message: "not valid", data: { valid: false } });

		const failureRun = runScenario(["exec", "envelope", "failure", "--format", "json"], { operations });
		expect(await failureRun.exit).toBe(2);
		expect(JSON.parse(failureRun.stdout.join(""))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });

		expect(exitCodeForExit(ok({}))).toBe(0);
		expect(toMachineEnvelope(failure("invalid_request", "bad input"))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });
	});

	test("strictly rejects non-decimal integer forms through the real CLI path", async () => {
		// PINNED CLINKR SEMANTICS: strict-int rejection is a raw commander usage
		// error (stderr, exit 2), never a machine envelope — click parity.
		for (const value of ["1e2", "0x10", "12.5", "12abc"]) {
			const prRun = runScenario(["exec", "get-feedback", value, "--format=json"]);
			expect(await prRun.exit).toBe(2);
			expect(prRun.stdout.join("")).toBe("");
			expect(prRun.stderr.join("")).toContain("expected an integer");

			const bodyCharsRun = runScenario(["exec", "summarize-feedback", "123", "--body-chars", value, "--format=json"]);
			expect(await bodyCharsRun.exit).toBe(2);
			expect(bodyCharsRun.stdout.join("")).toBe("");
			expect(bodyCharsRun.stderr.join("")).toContain("expected an integer");
		}
	});

	test("accepts plain decimal integers before reaching later gateway validation", async () => {
		const prRun = runScenario(["exec", "get-feedback", "123", "--format=json"]);
		expect(await prRun.exit).toBe(2);
		expect(JSON.parse(prRun.stdout.join(""))).toMatchObject({ error_type: "harness_session_required" });

		const bodyCharsRun = runScenario(["exec", "summarize-feedback", "123", "--body-chars", "12", "--format=json", "--stdout-mode", "full"]);
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
		expect(tableNames).toEqual([
			"build-resolve-thread-batch-payload",
			"build-stack-resolve-thread-payloads",
			"classification-template",
			"finalize-run",
			"get-feedback",
			"map-branch-prs",
			"plan-feedback",
			"prepare-run",
			"read-feedback-detail",
			"read-feedback-details",
			"read-thread-bodies",
			"record-batch-checkpoint",
			"reply-to-discussion",
			"reply-to-review",
			"resolve-thread-batch",
			"resolve-thread-with-reply",
			"stack-feedback-diff-current",
			"stack-feedback-plan",
			"stack-feedback-preflight",
			"stack-feedback-prep",
			"stack-feedback-thread-state",
			"summarize-feedback",
			"validate-feedback-classification",
			"verify-stack-batch-current",
		]);
	});

	test("EXEC_OPERATIONS table is sorted alphabetically", () => {
		const names = EXEC_OPERATIONS.map((op) => op.name);
		const sortedNames = [...names].sort();
		expect(names).toEqual(sortedNames);
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
		const run = runScenario(args);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(topLevelHelp);
		expect(run.stderr.join("")).toBe("");
	});

	test("pins -V output", async () => {
		const run = runScenario(["-V"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("0.1.0\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("--format json and --format=json select machine-envelope output", async () => {
		const spacedRun = runScenario(["exec", "envelope", "--format", "json"], { operations: [envelopeOperation()] });
		const inlineRun = runScenario(["exec", "envelope", "--format=json"], { operations: [envelopeOperation()] });

		expect(await spacedRun.exit).toBe(2);
		expect(await inlineRun.exit).toBe(2);
		expect(JSON.parse(spacedRun.stdout.join(""))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });
		expect(JSON.parse(inlineRun.stdout.join(""))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });
		expect(spacedRun.stderr.join("")).toBe("");
		expect(inlineRun.stderr.join("")).toBe("");
	});

	test("repeated --format flags are last-wins", async () => {
		// PINNED CLINKR SEMANTICS: commander last-wins, matching the Python CLI
		// (probed: `--format human --format json` emits the JSON envelope).
		const json = runScenario(["exec", "envelope", "--format", "human", "--format", "json"], { operations: [envelopeOperation()] });
		expect(await json.exit).toBe(2);
		expect(json.stderr.join("")).toBe("");
		expect(JSON.parse(json.stdout.join(""))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });

		const human = runScenario(["exec", "envelope", "--format", "json", "--format", "human"], { operations: [envelopeOperation()] });
		expect(await human.exit).toBe(2);
		expect(human.stdout.join("")).toBe("");
		expect(human.stderr.join("")).toBe("error: bad input\n");
	});

	test("--format markdown and md render through the human channel", async () => {
		for (const value of ["markdown", "md"]) {
			const run = runScenario(["exec", "envelope", "--format", value], { operations: [envelopeOperation()] });
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
		const run = runScenario(["exec", "envelope", "--format", "json"], { operations: [snowmanOperation] });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe('{\n  "exit_code": 2,\n  "error_type": "invalid_request",\n  "message": "bad snowman \\u2603"\n}\n');
		expect(run.stderr.join("")).toBe("");
	});
});
