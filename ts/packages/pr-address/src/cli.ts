#!/usr/bin/env node

import process from "node:process";

import { emitExit, failure, type ClinkrExit } from "@asdl/clinkr";
import { formatErrorMessage } from "@asdl/core";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";

import { createRealPrAddressContext, type PrAddressContext } from "./context.ts";
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
	const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
	const stderr = deps.stderr ?? ((text: string) => process.stderr.write(text));

	const command = args[0];
	if (command === undefined || command === "--help" || command === "-h") {
		stdout(topLevelHelp());
		return 0;
	}
	if (command === "--version" || command === "-V") {
		stdout(`${VERSION}\n`);
		return 0;
	}
	if (command === "--runtime") {
		stdout(runtimeInfo());
		return 0;
	}

	const requiredDeps: RequiredCliDeps = {
		context: deps.context ?? createRealPrAddressContext(),
		registry: deps.registry ?? createDefaultExecOperationRegistry(),
		cwd: deps.cwd ?? process.cwd(),
		env: deps.env ?? process.env,
		stdin: deps.stdin ?? readProcessStdin,
		stdout,
		stderr,
	};
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
		if (registeredOperation.isRepoContextRequired === true) {
			const preconditionExit = await repoContextPreconditionExit(deps);
			if (preconditionExit !== undefined) {
				return emitExit(preconditionExit, {
					format: hasFormatJson(args) ? "json" : "human",
					io: { stdout: deps.stdout, stderr: deps.stderr },
				});
			}
		}
		const dispatchResult = await registeredOperation.handler({ operation, args: args.slice(1), deps });
		switch (dispatchResult.type) {
			case "exit":
				return emitExit(dispatchResult.exit, {
					format: hasFormatJson(args) ? "json" : "human",
					io: { stdout: deps.stdout, stderr: deps.stderr },
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
		deps.stderr(`Error: ${formatErrorMessage(error)}\n`);
		return 2;
	}
}

/**
 * LBYL precondition for operations that call GitHub: `gh` resolves `owner/repo`
 * from the cwd's git remotes, so running outside a repository fails lazily and
 * confusingly mid-fetch. Fail fast with a clear error instead. The probe is
 * fail-open: a missing git gateway or a probe failure must never block a run
 * that would have succeeded.
 */
async function repoContextPreconditionExit(deps: RequiredCliDeps): Promise<ClinkrExit<unknown> | undefined> {
	const git = deps.context.git;
	if (git === undefined) return undefined;
	const probe = await git.isInsideWorkTree({ cwd: deps.cwd, env: deps.env });
	if (probe.type !== "outside") return undefined;
	return failure("repo_context_required", "pr-address must run inside the target git repository (gh resolves the repo from the current directory).");
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/pr-address bin pr-address -> ts/packages/pr-address/src/cli.ts\n";
}

function topLevelHelp(): string {
	return `Usage: pr-address [--help] [--version] [--runtime] <command>\n\nPR review address operations.\n\nCommands:\n  exec  Operations for the pr-address skill. See 'pr-address exec --help' for the operation list.\n\nOptions:\n  -h, --help     Show this help.\n  -V, --version  Show version.\n  --runtime      Show CLI runtime diagnostics and exit.\n`;
}

function execHelp(): string {
	return `Usage: pr-address exec <operation> [args...]\n\nOperations for the pr-address skill.\n\nCurrent behavior:\n  pr-address exec <operation> [args...] dispatches to TypeScript. The legacy Python pr-address CLI is invoked only for unknown operations and a few invalid-argument shapes (click usage-error rendering), with the same arguments, stdin, stdout, stderr, and exit code.\n\nOperations (all TypeScript-managed):\n  build-resolve-thread-batch-payload\n  build-stack-resolve-thread-payloads\n  classification-template\n  finalize-run\n  get-feedback\n  map-branch-prs\n  plan-feedback\n  prepare-run\n  read-feedback-detail\n  read-feedback-details\n  record-batch-checkpoint\n  reply-to-discussion\n  reply-to-review\n  resolve-thread-batch\n  resolve-thread-with-reply\n  stack-feedback-diff-current\n  stack-feedback-plan\n  stack-feedback-preflight\n  stack-feedback-prep\n  summarize-feedback\n  validate-feedback-classification\n\nExamples:\n  pr-address exec prepare-run --payload-session-id pr-address-demo --format json\n  pr-address exec validate-feedback-classification --format json\n`;
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

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
