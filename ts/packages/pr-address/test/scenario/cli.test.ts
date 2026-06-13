import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";
import { afterEach, describe, expect, test } from "vitest";

import { exitCodeForExit, failure, negative, ok, toMachineEnvelope } from "@asdl/clinkr";
import { runCli, type CliDeps } from "../../src/cli.ts";
import { EXEC_OPERATION_NAMES, EXEC_OPERATIONS } from "../../src/exec-commands.ts";
import { defineExecOperation, type ExecOperation } from "../../src/exec-operation.ts";
import { loadJsonInput, readJsonInputText } from "../../src/json-input.ts";
import { operationSchemaDocumentNames } from "../../src/operation-schemas/index.ts";
import { RealLegacyPrAddressGateway, type ProcessRunRequest } from "../../src/legacy-python.ts";
import { InMemoryLegacyPrAddressGateway } from "../support/in-memory-legacy-pr-address-gateway.ts";
import { fakePrAddressContext } from "../support/in-memory-pr-address-gateways.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));
const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pr-address-cli-"));
	tempDirs.push(dir);
	return dir;
}

interface CliRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	legacy: InMemoryLegacyPrAddressGateway;
}

interface RunWithFakeLegacyOptions {
	exitCodes?: readonly number[];
	deps?: Pick<CliDeps, "operations" | "stdin">;
}

function runWithFakeLegacy(args: readonly string[], options: RunWithFakeLegacyOptions = {}): CliRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const legacy = new InMemoryLegacyPrAddressGateway(options.exitCodes ?? [0]);
	return {
		exit: runCli(args, {
			context: fakePrAddressContext({ legacy }),
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			stdin: options.deps?.stdin,
			operations: options.deps?.operations,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
		legacy,
	};
}

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
		const help = runWithFakeLegacy(["--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: pr-address");
		expect(help.stdout.join("")).toContain("--runtime");
		expect(help.legacy.calls).toEqual([]);

		const version = runWithFakeLegacy(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toBe("0.1.0\n");
		expect(version.legacy.calls).toEqual([]);

		const runtime = runWithFakeLegacy(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toBe("runtime: typescript\nentry_point: @asdl/pr-address bin pr-address -> ts/packages/pr-address/src/cli.ts\n");
		expect(runtime.legacy.calls).toEqual([]);
	});

	test("hides the exec subgroup from top-level help while keeping it invocable", async () => {
		// PINNED CLINKR SEMANTICS: the hidden exec subgroup is omitted from
		// top-level help (Python parity); `pr-address exec --help` still works.
		const help = runWithFakeLegacy(["--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).not.toContain("exec");
	});

	test("rejects unknown top-level commands with a commander usage error", async () => {
		const run = runWithFakeLegacy(["bogus"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: unknown command 'bogus'\n");
		expect(run.legacy.calls).toEqual([]);
	});

	test("prints generated exec help listing every operation", async () => {
		const run = runWithFakeLegacy(["exec", "--help"]);

		expect(await run.exit).toBe(0);
		const helpText = run.stdout.join("");
		expect(helpText).toContain("Usage: pr-address exec");
		expect(helpText).toContain("Operations for the pr-address skill.");
		for (const name of EXEC_OPERATION_NAMES) {
			expect(helpText).toContain(name);
		}
		expect(run.legacy.calls).toEqual([]);

		const bare = runWithFakeLegacy(["exec"]);
		expect(await bare.exit).toBe(0);
		expect(bare.stdout.join("")).toBe(helpText);
	});

	test("delegates genuinely unknown exec operations to the legacy gateway verbatim", async () => {
		const run = runWithFakeLegacy(["exec", "totally-unknown-op", "12", "--whatever", "x"], { exitCodes: [7] });

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
		const run = runWithFakeLegacy(["exec", "another-unknown-op"], { exitCodes: [2] });

		expect(await run.exit).toBe(2);
		expect(run.legacy.calls.map((call) => call.args)).toEqual([["exec", "another-unknown-op"]]);
	});

	test("rejects bogus enum option values as usage errors without the legacy CLI", async () => {
		// PINNED CLINKR SEMANTICS: value-based fallback is collapsed — bogus
		// --payload-mode values are strict-enum commander usage errors, not
		// legacy click rendering.
		const run = runWithFakeLegacy(["exec", "get-feedback", "12", "--payload-mode", "bogus", "--format", "json"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe(
			"error: option '--payload-mode <value>' argument 'bogus' is invalid. Allowed choices are inline, payload.\n",
		);
		expect(run.legacy.calls).toEqual([]);
	});

	test("serves managed classification-template schema locally without invoking legacy", async () => {
		const run = runWithFakeLegacy(["exec", "classification-template", "--json-schema"]);

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
		const run = runWithFakeLegacy(["exec", "classification-template", "--format", "json"], {
			exitCodes: [0],
			deps: { stdin: async () => JSON.stringify(manifest) },
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
		const run = runWithFakeLegacy(["exec", "echo-json", "--format", "json"], {
			exitCodes: [0],
			deps: {
				operations: [echoOperation],
				stdin: async () => '{"ok":true}',
			},
		});

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join("")).data).toEqual({ ok: true });
		expect(run.stderr.join("")).toBe("");
		expect(run.legacy.calls).toEqual([]);
	});

	test("maps managed Clinkr envelope exits to process exit codes", async () => {
		const operations = [envelopeOperation()];

		const negativeRun = runWithFakeLegacy(["exec", "envelope", "negative", "--format", "json"], { exitCodes: [0], deps: { operations } });
		expect(await negativeRun.exit).toBe(1);
		expect(JSON.parse(negativeRun.stdout.join(""))).toEqual({ exit_code: 1, message: "not valid", data: { valid: false } });

		const failureRun = runWithFakeLegacy(["exec", "envelope", "failure", "--format", "json"], { exitCodes: [0], deps: { operations } });
		expect(await failureRun.exit).toBe(2);
		expect(JSON.parse(failureRun.stdout.join(""))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });

		expect(exitCodeForExit(ok({}))).toBe(0);
		expect(toMachineEnvelope(failure("invalid_request", "bad input"))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });
	});

	test("strictly rejects non-decimal integer forms through the real CLI path", async () => {
		// PINNED CLINKR SEMANTICS: strict-int rejection is a raw commander usage
		// error (stderr, exit 2), never a machine envelope — click parity.
		for (const value of ["1e2", "0x10", "12.5", "12abc"]) {
			const prRun = runWithFakeLegacy(["exec", "get-feedback", value, "--format=json"]);
			expect(await prRun.exit).toBe(2);
			expect(prRun.stdout.join("")).toBe("");
			expect(prRun.stderr.join("")).toContain("expected an integer");
			expect(prRun.legacy.calls).toEqual([]);

			const bodyCharsRun = runWithFakeLegacy(["exec", "summarize-feedback", "123", "--body-chars", value, "--format=json"]);
			expect(await bodyCharsRun.exit).toBe(2);
			expect(bodyCharsRun.stdout.join("")).toBe("");
			expect(bodyCharsRun.stderr.join("")).toContain("expected an integer");
			expect(bodyCharsRun.legacy.calls).toEqual([]);
		}
	});

	test("accepts plain decimal integers before reaching later gateway validation", async () => {
		const prRun = runWithFakeLegacy(["exec", "get-feedback", "123", "--format=json"]);
		expect(await prRun.exit).toBe(2);
		expect(JSON.parse(prRun.stdout.join(""))).toMatchObject({ error_type: "payload_session_required" });

		const bodyCharsRun = runWithFakeLegacy(["exec", "summarize-feedback", "123", "--body-chars", "12", "--format=json"]);
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
		const run = runWithFakeLegacy(args);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(topLevelHelp);
		expect(run.stderr.join("")).toBe("");
		expect(run.legacy.calls).toEqual([]);
	});

	test("pins -V output", async () => {
		const run = runWithFakeLegacy(["-V"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("0.1.0\n");
		expect(run.stderr.join("")).toBe("");
		expect(run.legacy.calls).toEqual([]);
	});

	test("--format json and --format=json select machine-envelope output", async () => {
		const spacedRun = runWithFakeLegacy(["exec", "envelope", "--format", "json"], { deps: { operations: [envelopeOperation()] } });
		const inlineRun = runWithFakeLegacy(["exec", "envelope", "--format=json"], { deps: { operations: [envelopeOperation()] } });

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
		const json = runWithFakeLegacy(["exec", "envelope", "--format", "human", "--format", "json"], { deps: { operations: [envelopeOperation()] } });
		expect(await json.exit).toBe(2);
		expect(json.stderr.join("")).toBe("");
		expect(JSON.parse(json.stdout.join(""))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });

		const human = runWithFakeLegacy(["exec", "envelope", "--format", "json", "--format", "human"], { deps: { operations: [envelopeOperation()] } });
		expect(await human.exit).toBe(2);
		expect(human.stdout.join("")).toBe("");
		expect(human.stderr.join("")).toBe("error: bad input\n");
	});

	test("--format markdown and md render through the human channel", async () => {
		for (const value of ["markdown", "md"]) {
			const run = runWithFakeLegacy(["exec", "envelope", "--format", value], { deps: { operations: [envelopeOperation()] } });
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
		const run = runWithFakeLegacy(["exec", "envelope", "--format", "json"], { deps: { operations: [snowmanOperation] } });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe('{\n  "exit_code": 2,\n  "error_type": "invalid_request",\n  "message": "bad snowman \\u2603"\n}\n');
		expect(run.stderr.join("")).toBe("");
		expect(run.legacy.calls).toEqual([]);
	});
});

describe("JSON input source helpers", () => {
	test("loads stdin, inline JSON, and file JSON", async () => {
		const schema = z.object({ value: z.string() });
		const stdinResult = await loadJsonInput({
			optionValue: undefined,
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema,
			stdin: async () => '{"value":"stdin"}',
		});
		expect(stdinResult).toEqual({ type: "ok", value: { value: "stdin" } });

		const inlineResult = await loadJsonInput({
			optionValue: '{"value":"inline"}',
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema,
			stdin: async () => "",
		});
		expect(inlineResult).toEqual({ type: "ok", value: { value: "inline" } });

		const tempDir = await makeTempDir();
		const payloadPath = join(tempDir, "payload.json");
		await writeFile(payloadPath, '{"value":"file"}', "utf8");
		const fileResult = await loadJsonInput({
			optionValue: undefined,
			filePath: payloadPath,
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			fileOptionName: "--payload-file",
			schema,
			stdin: async () => "",
		});
		expect(fileResult).toEqual({ type: "ok", value: { value: "file" } });
	});

	test("reports source conflicts, empty input, invalid JSON, missing files, and schema errors", async () => {
		const schema = z.object({ value: z.string() });
		const conflict = await readJsonInputText({
			optionValue: "{}",
			filePath: "/tmp/payload.json",
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			fileOptionName: "--payload-file",
			stdin: async () => "",
		});
		expect(conflict).toEqual({
			type: "error",
			error: {
				errorType: "invalid_request",
				message: "demo accepts only one payload source; do not pass both --payload-json and --payload-file.",
			},
		});

		const empty = await readJsonInputText({
			optionValue: "   ",
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			stdin: async () => "unused",
		});
		expect(empty.type).toBe("error");
		if (empty.type === "error") expect(empty.error.errorType).toBe("invalid_request");

		const invalidJson = await loadJsonInput({
			optionValue: "{",
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema,
			stdin: async () => "",
		});
		expect(invalidJson.type).toBe("error");
		if (invalidJson.type === "error") expect(invalidJson.error.errorType).toBe("invalid_json");

		const missingFile = await readJsonInputText({
			optionValue: undefined,
			filePath: "/tmp/definitely-missing-pr-address-payload.json",
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			fileOptionName: "--payload-file",
			stdin: async () => "",
		});
		expect(missingFile.type).toBe("error");
		if (missingFile.type === "error") expect(missingFile.error.errorType).toBe("invalid_request");

		const schemaError = await loadJsonInput({
			optionValue: '{"value": 3}',
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema,
			stdin: async () => "",
		});
		expect(schemaError.type).toBe("error");
		if (schemaError.type === "error") expect(schemaError.error.errorType).toBe("invalid_request");
	});
});

describe("legacy Python fallback routing", () => {
	test("uses local uv project command when a legacy checkout marker is present", async () => {
		const requests: ProcessRunRequest[] = [];
		const gateway = new RealLegacyPrAddressGateway({
			runProcess: async (request) => {
				requests.push(request);
				return 0;
			},
		});

		const exit = await gateway.run(["exec", "unknown-op"], { cwd: REPO_ROOT, env: { PATH: "/fake/bin" } });

		expect(exit).toBe(0);
		expect(requests).toEqual([
			{
				command: "uv",
				args: ["run", "--project", REPO_ROOT, "pr-address-py", "exec", "unknown-op"],
				cwd: REPO_ROOT,
				env: { PATH: "/fake/bin" },
				stdio: "inherit",
			},
		]);
	});

	test("uses pinned uvx fallback outside a legacy checkout", async () => {
		const requests: ProcessRunRequest[] = [];
		const gateway = new RealLegacyPrAddressGateway({
			runProcess: async (request) => {
				requests.push(request);
				return 3;
			},
		});

		const exit = await gateway.run(["exec", "unknown-op"], { cwd: "/", env: { PATH: "/fake/bin" } });

		expect(exit).toBe(3);
		expect(requests).toEqual([
			{
				command: "uvx",
				args: ["--from", "asdl-pr-address==0.1.1", "pr-address", "exec", "unknown-op"],
				cwd: "/",
				env: { PATH: "/fake/bin" },
				stdio: "inherit",
			},
		]);
	});
});
