#!/usr/bin/env node

import { ClinkrGroup } from "@nseng-ai/clinkr";
import { defineCli, readStdin, type CliEntrypointDeps } from "@nseng-ai/foundation/cli-runtime";

import { createRealPrAddressContext, type PrAddressContext } from "./context.ts";
import { EXEC_OPERATIONS } from "./exec-commands.ts";
import type { ExecOperation, PrAddressExecContext } from "./exec-operation.ts";
export interface CliDeps extends CliEntrypointDeps {
	context?: PrAddressContext;
	operations?: readonly ExecOperation[];
	stdin?: () => Promise<string>;
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
	buildCli: ({ appBuilder, name, buildState: operations }) => {
		const root = new ClinkrGroup<PrAddressExecContext>({ name });
		const execGroup = new ClinkrGroup<PrAddressExecContext>({
			name: "exec",
			description: "Operations for the pr-address skill.",
			isHidden: true,
		});
		for (const operation of operations) operation.addTo(execGroup);
		root.group(execGroup);
		appBuilder.importLegacyClinkrGroupForMigration(root);
	},
});

export async function buildCli(operations: readonly ExecOperation[] = EXEC_OPERATIONS) {
	return await entry.buildCli(operations);
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
