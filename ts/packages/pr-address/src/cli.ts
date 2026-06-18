#!/usr/bin/env node

import process from "node:process";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";
import { readStdin } from "@asdl/core/stdin";

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

export function buildCli(
	operations: readonly ExecOperation[] = EXEC_OPERATIONS,
): ClinkrGroup<PrAddressExecContext> {
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

	const execContext: PrAddressExecContext = {
		context,
		cwd,
		env,
		stdin: deps.stdin ?? readStdin,
	};
	return await buildCli(operations).run(args, { context: execContext, io });
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/pr-address bin pr-address -> ts/packages/pr-address/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
