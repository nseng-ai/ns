#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createRealPrAddressContext, type PrAddressContext } from "./context.ts";
import { emitClinkrExit } from "./clinkr-envelope.ts";
import { createDefaultExecOperationRegistry, type ExecOperationRegistry } from "./operation-registry.ts";
import { buildOperationSchemaDocument } from "./operation-schemas.ts";

const VERSION = "0.1.0";

export interface CliDeps {
	context?: PrAddressContext | undefined;
	registry?: ExecOperationRegistry | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdin?: (() => Promise<string>) | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

interface RequiredCliDeps {
	context: PrAddressContext;
	registry: ExecOperationRegistry;
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin: () => Promise<string>;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const requiredDeps: RequiredCliDeps = {
		context: deps.context ?? createRealPrAddressContext(),
		registry: deps.registry ?? createDefaultExecOperationRegistry(),
		cwd: deps.cwd ?? process.cwd(),
		env: deps.env ?? process.env,
		stdin: deps.stdin ?? readProcessStdin,
		stdout: deps.stdout ?? ((text: string) => process.stdout.write(text)),
		stderr: deps.stderr ?? ((text: string) => process.stderr.write(text)),
	};

	const command = args[0];
	if (command === undefined || command === "--help" || command === "-h") {
		requiredDeps.stdout(topLevelHelp());
		return 0;
	}
	if (command === "--version" || command === "-V") {
		requiredDeps.stdout(`${VERSION}\n`);
		return 0;
	}
	if (command !== "exec") {
		requiredDeps.stderr(`Unknown command: ${command}\n\n${topLevelHelp()}`);
		return 2;
	}

	return await runExecCommand(args.slice(1), requiredDeps);
}

async function runExecCommand(args: readonly string[], deps: RequiredCliDeps): Promise<number> {
	const operation = args[0];
	if (operation === undefined || operation === "--help" || operation === "-h") {
		deps.stdout(execHelp());
		return 0;
	}

	// Mirrors the legacy CLI's eager `--json-schema` flag: print the operation's
	// input/output JSON Schema document and exit 0 before any argument validation.
	if (args.includes("--json-schema")) {
		const schemaDocument = buildOperationSchemaDocument(operation);
		if (schemaDocument !== undefined) {
			deps.stdout(`${JSON.stringify(schemaDocument, null, 2)}\n`);
			return 0;
		}
	}

	const registeredOperation = deps.registry.get(operation);
	if (registeredOperation !== undefined) {
		const dispatchResult = await registeredOperation.handler({ operation, args: args.slice(1), deps });
		switch (dispatchResult.type) {
			case "exit":
				return emitClinkrExit(dispatchResult.exit, {
					format: hasFormatJson(args) ? "json" : "human",
					stdout: deps.stdout,
					stderr: deps.stderr,
				});
			case "raw-exit":
				return dispatchResult.exitCode;
			case "fallback":
				break;
		}
	}

	try {
		return await deps.context.legacy.run(["exec", ...args], { cwd: deps.cwd, env: deps.env });
	} catch (error) {
		deps.stderr(`Error: ${errorMessage(error)}\n`);
		return 2;
	}
}

function topLevelHelp(): string {
	return `Usage: pr-address [--help] [--version] <command>\n\nPR review address operations.\n\nCommands:\n  exec  Operations for the pr-address skill. See 'pr-address exec --help' for the operation list.\n\nOptions:\n  -h, --help     Show this help.\n  -V, --version  Show version.\n`;
}

function execHelp(): string {
	return `Usage: pr-address exec <operation> [args...]\n\nOperations for the pr-address skill.\n\nCurrent behavior:\n  pr-address exec <operation> [args...] dispatches to TypeScript. The legacy Python pr-address CLI is invoked only for unknown operations and a few invalid-argument shapes (click usage-error rendering), with the same arguments, stdin, stdout, stderr, and exit code.\n\nOperations (all TypeScript-managed):\n  build-resolve-thread-batch-payload\n  build-stack-resolve-thread-payloads\n  classification-template\n  finalize-run\n  get-feedback\n  plan-feedback\n  prepare-run\n  read-feedback-detail\n  read-feedback-details\n  record-batch-checkpoint\n  reply-to-discussion\n  reply-to-review\n  resolve-thread-batch\n  resolve-thread-with-reply\n  stack-feedback-diff-current\n  stack-feedback-plan\n  stack-feedback-prep\n  summarize-feedback\n  validate-feedback-classification\n\nExamples:\n  pr-address exec prepare-run --payload-session-id pr-address-demo --format json\n  pr-address exec validate-feedback-classification --format json\n`;
}

function hasFormatJson(args: readonly string[]): boolean {
	const formatIndex = args.indexOf("--format");
	return formatIndex >= 0 && args[formatIndex + 1] === "json";
}

async function readProcessStdin(): Promise<string> {
	return await new Promise<string>((resolveStdin, reject) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			data += chunk;
		});
		process.stdin.on("error", reject);
		process.stdin.on("end", () => resolveStdin(data));
	});
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function isDirectCliInvocation(metaUrl: string, argvPath: string | undefined): boolean {
	if (argvPath === undefined) return false;

	try {
		const modulePath = realpathSync(fileURLToPath(metaUrl));
		const entryPath = realpathSync(resolve(argvPath));
		return modulePath === entryPath;
	} catch {
		// If either path cannot be resolved, this process is not a direct CLI entrypoint.
		return false;
	}
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
