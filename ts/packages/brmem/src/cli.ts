#!/usr/bin/env node

import process from "node:process";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";

import { createRealBrmemContext, type BrmemCliContext } from "./context.ts";
import type { BrmemSourceReader } from "./source-reader.ts";
import { checkRequestSchema, checkResultSchema, renderCheck, runCheck } from "./operations/check.ts";
import { getRequestSchema, getResultSchema, renderGet, runGet } from "./operations/get.ts";
import { listRequestSchema, listResultSchema, renderList, runList } from "./operations/list.ts";
import {
	copyRequestSchema,
	deleteRequestSchema,
	exportRequestSchema,
	notImplementedHandler,
	notImplementedResultSchema,
	resolvePromptRequestSchema,
} from "./operations/not-implemented.ts";
import { putRequestSchema, putResultSchema, renderPut, runPut } from "./operations/put.ts";

export const VERSION = "0.1.0";

export interface CliDeps {
	context?: BrmemCliContext | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdin?: (() => Promise<string>) | undefined;
	sourceReader?: BrmemSourceReader | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

export function buildCli(): ClinkrGroup<BrmemCliContext> {
	const root = new ClinkrGroup<BrmemCliContext>({
		name: "brmem",
		description: "Manage Branch Memory Entries stored in git refs.",
		version: VERSION,
		runtimeInfo,
	});
	root.command({
		name: "put",
		description: "Write content to a Branch Memory Entry.",
		schema: putRequestSchema,
		positionals: { key: { position: 0 } },
		options: { force: { short: "-f" } },
		resultSchema: putResultSchema,
		handler: runPut,
		renderHuman: renderPut,
	});
	root.command({
		name: "get",
		description: "Read content from a Branch Memory Entry.",
		schema: getRequestSchema,
		positionals: { key: { position: 0 } },
		resultSchema: getResultSchema,
		handler: runGet,
		renderHuman: renderGet,
	});
	root.command({
		name: "delete",
		description: "Delete a Branch Memory Entry.",
		schema: deleteRequestSchema,
		positionals: { key: { position: 0 } },
		resultSchema: notImplementedResultSchema,
		handler: notImplementedHandler("delete"),
	});
	root.command({
		name: "list",
		description:
			"List Branch Memory Entries. Defaults to the current branch; pass --branch to override or --all-branches to include every branch.",
		schema: listRequestSchema,
		resultSchema: listResultSchema,
		handler: runList,
		renderHuman: renderList,
	});
	root.command({
		name: "check",
		description: "Check whether a Branch Memory Entry exists.",
		schema: checkRequestSchema,
		positionals: { key: { position: 0 } },
		resultSchema: checkResultSchema,
		handler: runCheck,
		renderHuman: renderCheck,
	});
	root.command({
		name: "copy",
		description: "Copy Branch Memory Entries between branches.",
		schema: copyRequestSchema,
		resultSchema: notImplementedResultSchema,
		handler: notImplementedHandler("copy"),
	});
	root.command({
		name: "export",
		description: "Export Branch Memory Entries to files.",
		schema: exportRequestSchema,
		positionals: { output_dir: { position: 0 } },
		resultSchema: notImplementedResultSchema,
		handler: notImplementedHandler("export"),
	});
	const execGroup = new ClinkrGroup<BrmemCliContext>({
		name: "exec",
		description: "Commands for use by skills (not interactive users).",
		isHidden: true,
	});
	execGroup.command({
		name: "resolve-prompt",
		description: "Resolve a Branch Memory prompt path.",
		schema: resolvePromptRequestSchema,
		positionals: { prompt: { position: 0 } },
		resultSchema: notImplementedResultSchema,
		handler: notImplementedHandler("exec resolve-prompt"),
	});
	root.group(execGroup);
	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
	const cwd = deps.cwd ?? process.cwd();
	const context = deps.context ?? createRealBrmemContext({ cwd });
	const runContext: BrmemCliContext = {
		...context,
		cwd,
		env: deps.env ?? context.env,
		stdin: deps.stdin ?? context.stdin,
		sourceReader: deps.sourceReader ?? context.sourceReader,
	};
	return await buildCli().run(args, { context: runContext, io });
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/brmem bin brmem -> ts/packages/brmem/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
