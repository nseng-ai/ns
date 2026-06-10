import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";
import { afterEach, describe, expect, test } from "vitest";

import { runCli, type CliDeps } from "../../src/cli.ts";
import { failure, negative, ok, exitCodeForExit, toMachineEnvelope } from "@asdl/clinkr";
import { loadJsonInput, readJsonInputText } from "../../src/json-input.ts";
import { createExecOperationRegistry } from "../../src/operation-registry.ts";
import { RealLegacyPrAddressGateway, type ProcessRunRequest } from "../../src/legacy-python.ts";
import { InMemoryLegacyPrAddressGateway } from "../support/in-memory-legacy-pr-address-gateway.ts";

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
	deps?: Pick<CliDeps, "registry" | "stdin">;
}

function runWithFakeLegacy(args: readonly string[], options: RunWithFakeLegacyOptions = {}): CliRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const legacy = new InMemoryLegacyPrAddressGateway(options.exitCodes ?? [0]);
	return {
		exit: runCli(args, {
			context: { legacy },
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			stdin: options.deps?.stdin,
			registry: options.deps?.registry,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
		legacy,
	};
}

describe("pr-address CLI", () => {
	test("prints top-level help and version", async () => {
		const help = runWithFakeLegacy(["--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: pr-address");
		expect(help.stdout.join("")).toContain("--runtime");
		expect(help.stdout.join("")).toContain("exec");
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

	test("rejects unknown top-level commands", async () => {
		const run = runWithFakeLegacy(["bogus"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Unknown command: bogus");
		expect(run.stderr.join("")).toContain("Usage: pr-address");
		expect(run.legacy.calls).toEqual([]);
	});

	test("prints exec help for agent operations", async () => {
		const run = runWithFakeLegacy(["exec", "--help"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Usage: pr-address exec");
		expect(run.stdout.join("")).toContain("dispatches to TypeScript");
		expect(run.stdout.join("")).toContain("prepare-run");
		expect(run.stdout.join("")).toContain("build-stack-resolve-thread-payloads");
		expect(run.legacy.calls).toEqual([]);
	});

	// Every exec operation (including --json-schema routes) now executes in
	// TypeScript; only click usage-error shapes still reach the legacy fallback.
	test("delegates exact exec args to the legacy gateway for usage-error fallback routes", async () => {
		const run = runWithFakeLegacy(["exec", "stack-feedback-prep", "--stdout-mode", "bogus", "--format", "json"], { exitCodes: [7] });

		expect(await run.exit).toBe(7);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("");
		expect(run.legacy.calls).toEqual([
			{
				args: ["exec", "stack-feedback-prep", "--stdout-mode", "bogus", "--format", "json"],
				options: { cwd: "/repo", env: { PATH: "/fake/bin" } },
			},
		]);
	});

	test("preserves arbitrary operation argv shape for fallback-backed routes", async () => {
		const run = runWithFakeLegacy(["exec", "get-feedback", "12", "--payload-mode", "bogus", "--format", "json"], { exitCodes: [0] });

		expect(await run.exit).toBe(0);
		expect(run.legacy.calls.map((call) => call.args)).toEqual([["exec", "get-feedback", "12", "--payload-mode", "bogus", "--format", "json"]]);
	});

	test("preserves nonzero legacy exit codes", async () => {
		const run = runWithFakeLegacy(["exec", "prepare-run", "--payload-mode", "bogus"], { exitCodes: [2] });

		expect(await run.exit).toBe(2);
		expect(run.legacy.calls.map((call) => call.args)).toEqual([["exec", "prepare-run", "--payload-mode", "bogus"]]);
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
		const registry = createExecOperationRegistry([
			{
				name: "echo-json",
				handler: async ({ deps }) => {
					const input = await loadJsonInput({
						optionValue: undefined,
						commandName: "echo-json",
						inputDescription: "payload",
						optionName: "--payload-json",
						schema: z.object({ ok: z.boolean() }),
						stdin: deps.stdin,
					});
					if (input.type === "error") return { type: "exit", exit: failure(input.error.errorType, input.error.message) };
					return { type: "exit", exit: ok(input.value) };
				},
			},
		]);
		const run = runWithFakeLegacy(["exec", "echo-json", "--format", "json"], {
			exitCodes: [0],
			deps: {
				registry,
				stdin: async () => '{"ok":true}',
			},
		});

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join("")).data).toEqual({ ok: true });
		expect(run.stderr.join("")).toBe("");
		expect(run.legacy.calls).toEqual([]);
	});

	test("maps managed Clinkr envelope exits to process exit codes", async () => {
		const registry = createExecOperationRegistry([
			{
				name: "envelope",
				handler: async ({ args }) => {
					if (args[0] === "negative") return { type: "exit", exit: negative("not valid", { valid: false }) };
					return { type: "exit", exit: failure("invalid_request", "bad input") };
				},
			},
		]);

		const negativeRun = runWithFakeLegacy(["exec", "envelope", "negative", "--format", "json"], { exitCodes: [0], deps: { registry } });
		expect(await negativeRun.exit).toBe(1);
		expect(JSON.parse(negativeRun.stdout.join(""))).toEqual({ exit_code: 1, message: "not valid", data: { valid: false } });

		const failureRun = runWithFakeLegacy(["exec", "envelope", "failure", "--format", "json"], { exitCodes: [0], deps: { registry } });
		expect(await failureRun.exit).toBe(2);
		expect(JSON.parse(failureRun.stdout.join(""))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });

		expect(exitCodeForExit(ok({}))).toBe(0);
		expect(toMachineEnvelope(failure("invalid_request", "bad input"))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });
	});
});

describe("pr-address CLI surface pinning", () => {
	const topLevelHelp = `Usage: pr-address [--help] [--version] [--runtime] <command>\n\nPR review address operations.\n\nCommands:\n  exec  Operations for the pr-address skill. See 'pr-address exec --help' for the operation list.\n\nOptions:\n  -h, --help     Show this help.\n  -V, --version  Show version.\n  --runtime      Show CLI runtime diagnostics and exit.\n`;

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

	test("inline --format=json is not recognized by machine-envelope detection", async () => {
		const registry = createExecOperationRegistry([
			{
				name: "envelope",
				handler: async () => ({ type: "exit", exit: failure("invalid_request", "bad input") }),
			},
		]);
		const run = runWithFakeLegacy(["exec", "envelope", "--format=json"], { deps: { registry } });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: bad input\n");
		expect(run.legacy.calls).toEqual([]);
		// PINNED QUIRK (clinkr-migration): pr-address does not accept --format=json inline syntax.
	});

	test("first --format flag wins for machine-envelope detection", async () => {
		const registry = createExecOperationRegistry([
			{
				name: "envelope",
				handler: async () => ({ type: "exit", exit: failure("invalid_request", "bad input") }),
			},
		]);
		const human = runWithFakeLegacy(["exec", "envelope", "--format", "human", "--format", "json"], { deps: { registry } });
		expect(await human.exit).toBe(2);
		expect(human.stdout.join("")).toBe("");
		expect(human.stderr.join("")).toBe("error: bad input\n");

		const json = runWithFakeLegacy(["exec", "envelope", "--format", "json", "--format", "human"], { deps: { registry } });
		expect(await json.exit).toBe(2);
		expect(json.stderr.join("")).toBe("");
		expect(JSON.parse(json.stdout.join(""))).toEqual({ exit_code: 2, error_type: "invalid_request", message: "bad input" });
		// PINNED QUIRK (clinkr-migration): hasFormatJson uses indexOf, so the first --format value wins and --format human is tolerated.
	});

	test("pins indent-2 ensure_ascii machine envelope bytes", async () => {
		const registry = createExecOperationRegistry([
			{
				name: "envelope",
				handler: async () => ({ type: "exit", exit: failure("invalid_request", "bad snowman ☃") }),
			},
		]);
		const run = runWithFakeLegacy(["exec", "envelope", "--format", "json"], { deps: { registry } });

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

		const exit = await gateway.run(["exec", "prepare-run"], { cwd: REPO_ROOT, env: { PATH: "/fake/bin" } });

		expect(exit).toBe(0);
		expect(requests).toEqual([
			{
				command: "uv",
				args: ["run", "--project", REPO_ROOT, "pr-address-py", "exec", "prepare-run"],
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

		const exit = await gateway.run(["exec", "prepare-run"], { cwd: "/", env: { PATH: "/fake/bin" } });

		expect(exit).toBe(3);
		expect(requests).toEqual([
			{
				command: "uvx",
				args: ["--from", "asdl-pr-address==0.1.1", "pr-address", "exec", "prepare-run"],
				cwd: "/",
				env: { PATH: "/fake/bin" },
				stdio: "inherit",
			},
		]);
	});
});
