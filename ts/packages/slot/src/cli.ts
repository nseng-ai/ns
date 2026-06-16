#!/usr/bin/env node

import process from "node:process";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";

import { createRealSlotContext, type SlotCliContext } from "./context.ts";
import { listRequestSchema, listResultSchema, renderList, runList } from "./operations/list.ts";

export const VERSION = "0.1.0";

export interface CliDeps {
	context?: SlotCliContext | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

export function buildCli(): ClinkrGroup<SlotCliContext> {
	const root = new ClinkrGroup<SlotCliContext>({
		name: "slot",
		description: "Manage the pool of Git-worktree-backed slots.",
		version: VERSION,
		runtimeInfo,
	});
	root.command({
		name: "list",
		description: "List worktree pool slots derived from Git worktree state.",
		schema: listRequestSchema,
		resultSchema: listResultSchema,
		handler: runList,
		renderHuman: renderList,
	});
	root.command({
		name: "ls",
		description: "Alias for list.",
		schema: listRequestSchema,
		resultSchema: listResultSchema,
		handler: runList,
		renderHuman: renderList,
	});
	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;
	const context = deps.context ?? await createRealSlotContext({ cwd, env });
	const runContext: SlotCliContext = { ...context, cwd, env: deps.env ?? context.env };
	return await buildCli().run(args, { context: runContext, io });
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/slot bin slot -> ts/packages/slot/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
