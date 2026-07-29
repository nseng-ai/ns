#!/usr/bin/env node

import { createClinkrApp } from "@nseng-ai/clinkr/app";
import {
	defineClinkrAppCli,
	type ClinkrAppCliEntrypointDeps,
} from "@nseng-ai/foundation/cli-runtime";

import { createRealBrmemContext, type BrmemCliContext } from "../context.ts";
import type { BrmemSourceReader } from "../source-reader.ts";

const entry = defineClinkrAppCli<BrmemCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Manage Branch Memory Entries stored in git refs.",
	prepareRun: ({ deps, cwd, env }) => {
		const context = deps.context ?? createRealBrmemContext({ cwd, env });
		const runContext: BrmemCliContext = {
			...context,
			cwd,
			sourceReader: deps.sourceReader ?? context.sourceReader,
			stderr: deps.stderr ?? context.stderr,
			interaction: deps.interaction ?? context.interaction,
		};
		return { type: "run", context: runContext, buildState: undefined };
	},
	buildApp: ({ name, version, runtimeInfo }) =>
		createClinkrApp<BrmemCliContext>({
			name,
			version,
			runtimeInfo,
			commandDirectory: import.meta.dirname,
			requiresContext: true,
		}),
});

export const VERSION = entry.version;

export interface CliDeps extends ClinkrAppCliEntrypointDeps {
	readonly context?: BrmemCliContext;
	readonly sourceReader?: BrmemSourceReader;
	readonly interaction?: BrmemCliContext["interaction"];
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
