#!/usr/bin/env node

import process from "node:process";

import {
	ClinkrGroup,
	createClinkrInteraction,
	resolveIo,
	type ClinkrInteraction,
} from "@asdl/clinkr";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";
import { readStdinLine } from "@asdl/core/stdin";

import { createRealHandoffContext, type HandoffCliContext } from "./context.ts";
import {
	deleteRequestSchema,
	deleteResultSchema,
	renderDelete,
	runDelete,
} from "./operations/delete.ts";
import { gcRequestSchema, gcResultSchema, renderGc, runGc } from "./operations/gc.ts";
import {
	listRequestSchema,
	listResultSchema,
	renderList,
	renderListMarkdown,
	runList,
} from "./operations/list.ts";

export const VERSION = "0.1.0";

interface CliIoDeps {
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	stdin?: (() => Promise<string | null>) | undefined;
	interaction?: ClinkrInteraction | undefined;
}

interface CliContextDeps extends CliIoDeps {
	context: HandoffCliContext;
	cwd?: never;
	env?: never;
}

interface CliRealDeps extends CliIoDeps {
	context?: undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdin?: (() => Promise<string | null>) | undefined;
}

export type CliDeps = CliContextDeps | CliRealDeps;

export function buildCli(): ClinkrGroup<HandoffCliContext> {
	const root = new ClinkrGroup<HandoffCliContext>({
		name: "handoff",
		description: "Work with directed handoff artifacts.",
		version: VERSION,
		runtimeInfo,
	});
	root.command({
		name: "list",
		description:
			"List handoffs. Defaults to the current branch. Pass --all to list across active branches or --include-deleted to include deleted local branches.",
		schema: listRequestSchema,
		resultSchema: listResultSchema,
		handler: runList,
		renderHuman: renderList,
		renderMarkdown: renderListMarkdown,
	});
	root.command({
		name: "delete",
		description: "Delete one handoff by exact slug.",
		schema: deleteRequestSchema,
		positionals: { slug: { position: 0 } },
		options: { force: { short: "-f" } },
		resultSchema: deleteResultSchema,
		handler: runDelete,
		renderHuman: renderDelete,
	});
	root.command({
		name: "gc",
		description: "Delete handoffs whose local branch no longer exists.",
		schema: gcRequestSchema,
		options: { force: { short: "-f" } },
		resultSchema: gcResultSchema,
		handler: runGc,
		renderHuman: renderGc,
	});
	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
	const baseContext = deps.context === undefined ? createContextFromDeps(deps) : deps.context;
	const context: HandoffCliContext = {
		...baseContext,
		interaction:
			deps.interaction ??
			createClinkrInteraction({ stdin: deps.stdin ?? readStdinLine, stderr: io.stderr }),
		stderr: io.stderr,
	};
	return await buildCli().run(args, { context, io });
}

function createContextFromDeps(deps: CliRealDeps): HandoffCliContext {
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;
	return createRealHandoffContext({ cwd, env });
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/handoff bin handoff -> ts/packages/handoff/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
