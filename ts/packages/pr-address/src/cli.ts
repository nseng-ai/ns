#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createRealPrAddressContext, type PrAddressContext } from "./context.ts";

const VERSION = "0.1.0";

export interface CliDeps {
	context?: PrAddressContext | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

interface RequiredCliDeps {
	context: PrAddressContext;
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const requiredDeps: RequiredCliDeps = {
		context: deps.context ?? createRealPrAddressContext(),
		cwd: deps.cwd ?? process.cwd(),
		env: deps.env ?? process.env,
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

	try {
		return await deps.context.legacy.run(["exec", ...args], { cwd: deps.cwd, env: deps.env });
	} catch (error) {
		deps.stderr(`Error: ${errorMessage(error)}\n`);
		return 2;
	}
}

function topLevelHelp(): string {
	return `Usage: pr-address [--help] [--version] <command>\n\nPR review address operations. This TypeScript package is currently a migration scaffold.\n\nOptions:\n  -h, --help     Show this help.\n  -V, --version  Show version.\n`;
}

function execHelp(): string {
	return `Usage: pr-address exec <operation> [args...]\n\nHidden operations for the pr-address skill. This scaffold preserves the operation boundary while individual operations are ported.\n\nCurrent behavior:\n  pr-address exec <operation> [args...] delegates directly to the legacy Python pr-address CLI with the same arguments, stdin, stdout, stderr, and exit code.\n\nOperations currently compatibility-backed by legacy Python:\n  add-issue-comment\n  add-reaction\n  add-review-thread-reply\n  build-resolve-thread-batch-payload\n  build-stack-resolve-thread-payloads\n  classification-template\n  finalize-run\n  get-discussion-comments\n  get-feedback\n  get-pr-for-branch\n  get-review-comments\n  get-reviews\n  plan-feedback\n  prepare-run\n  read-feedback-detail\n  read-feedback-details\n  record-batch-checkpoint\n  reply-to-discussion\n  reply-to-review\n  resolve-thread\n  resolve-thread-batch\n  resolve-thread-with-reply\n  stack-feedback-diff-current\n  stack-feedback-plan\n  stack-feedback-prep\n  summarize-feedback\n  unresolve-thread\n  validate-feedback-classification\n\nExamples:\n  pr-address exec prepare-run --payload-session-id pr-address-demo --format json\n  pr-address exec validate-feedback-classification --format json\n`;
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
		return false;
	}
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
