#!/usr/bin/env node

import process from "node:process";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { formatErrorMessage } from "@asdl/core";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";

import { createRealPrAddressContext, type PrAddressContext } from "./context.ts";
import { EXEC_OPERATIONS } from "./exec-commands.ts";
import type { ExecOperation, PrAddressExecContext } from "./exec-operation.ts";

const VERSION = "0.1.0";

export interface CliDeps {
	context?: PrAddressContext | undefined;
	operations?: readonly ExecOperation[] | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdin?: (() => Promise<string>) | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

export function buildCli(operations: readonly ExecOperation[] = EXEC_OPERATIONS): ClinkrGroup<PrAddressExecContext> {
	const root = new ClinkrGroup<PrAddressExecContext>({
		name: "pr-address",
		description: "PR review address operations.",
		version: VERSION,
		runtimeInfo,
	});
	const execGroup = new ClinkrGroup<PrAddressExecContext>({
		name: "exec",
		description: "Operations for the pr-address skill.",
		isHidden: true,
	});
	for (const operation of operations) operation.addTo(execGroup);
	root.group(execGroup);
	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
	const operations = deps.operations ?? EXEC_OPERATIONS;
	const context = deps.context ?? createRealPrAddressContext();
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;

	// Pre-clinkr fallback router: genuinely unknown exec operations pass through
	// to the legacy Python CLI verbatim (same args, stdio, and exit code).
	if (args[0] === "exec") {
		const operation = args[1];
		const knownNames = new Set(operations.map((candidate) => candidate.name));
		if (operation !== undefined && !operation.startsWith("-") && !knownNames.has(operation)) {
			try {
				return await context.legacy.run(["exec", ...args.slice(1)], { cwd, env });
			} catch (error) {
				io.stderr(`Error: ${formatErrorMessage(error)}\n`);
				return 2;
			}
		}
	}

	const execContext: PrAddressExecContext = {
		context,
		cwd,
		env,
		stdin: deps.stdin ?? readProcessStdin,
	};
	return await buildCli(operations).run(args, { context: execContext, io });
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/pr-address bin pr-address -> ts/packages/pr-address/src/cli.ts\n";
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
