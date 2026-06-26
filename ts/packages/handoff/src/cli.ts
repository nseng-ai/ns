#!/usr/bin/env node

import { ClinkrGroup, resolveClinkrInteraction, type ClinkrInteraction } from "@sdl/clinkr";
import { defineCli } from "@sdl/core/cli-entry";
import { readStdinLine } from "@sdl/core/stdin";

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

const entry = defineCli<HandoffCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Work with directed handoff artifacts.",
	prepareRun: ({ deps, cwd, env, io }) => {
		const baseContext = deps.context ?? createContextFromDeps({ cwd, env });
		const context: HandoffCliContext = {
			...baseContext,
			interaction: resolveClinkrInteraction({
				interaction: deps.interaction,
				stdin: deps.stdin ?? readStdinLine,
				stderr: io.stderr,
				injectedStdin: deps.stdin,
			}),
			stderr: io.stderr,
		};
		return { type: "run", context, buildState: undefined };
	},
	configureCli: ({ root }) => {
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
			options: { yes: { short: "-y" } },
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
	},
});

export function buildCli(): ClinkrGroup<HandoffCliContext> {
	return entry.buildCli(undefined);
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

export const VERSION = entry.version;

function createContextFromDeps(deps: Pick<CliRealDeps, "cwd" | "env">): HandoffCliContext {
	return createRealHandoffContext({ cwd: deps.cwd, env: deps.env });
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
