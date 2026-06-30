#!/usr/bin/env node

import { ClinkrGroup } from "@sdl/clinkr";
import { defineCli } from "@sdl/cli-runtime";
import { readStdin } from "@sdl/core/stdin";

import { createRealPrAddressContext, type PrAddressContext } from "./context.ts";
import { EXEC_OPERATIONS } from "./exec-commands.ts";
import type { ExecOperation, PrAddressExecContext } from "./exec-operation.ts";
import type { ExplicitUndefined } from "@sdl/core/primitives";

export interface CliDeps {
	context?: PrAddressContext | undefined;
	operations?: readonly ExecOperation[] | undefined;
	cwd?: string | undefined;
	env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	stdin?: (() => Promise<string>) | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

const entry = defineCli<PrAddressExecContext, CliDeps, readonly ExecOperation[]>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "PR review address operations.",
	prepareRun: ({ deps, cwd, env }) => {
		const operations = deps.operations ?? EXEC_OPERATIONS;
		const context = deps.context ?? createRealPrAddressContext();
		const execContext: PrAddressExecContext = {
			context,
			cwd: deps.cwd ?? cwd,
			env: deps.env ?? env,
			stdin: deps.stdin ?? readStdin,
		};
		return { type: "run", context: execContext, buildState: operations };
	},
	configureCli: ({ root, buildState: operations }) => {
		const execGroup = new ClinkrGroup<PrAddressExecContext>({
			name: "exec",
			description: "Operations for the pr-address skill.",
			isHidden: true,
		});
		for (const operation of operations) operation.addTo(execGroup);
		root.group(execGroup);
	},
});

export function buildCli(
	operations: readonly ExecOperation[] = EXEC_OPERATIONS,
): ClinkrGroup<PrAddressExecContext> {
	return entry.buildCli(operations);
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
