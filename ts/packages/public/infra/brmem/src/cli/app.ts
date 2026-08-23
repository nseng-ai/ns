#!/usr/bin/env node

import { addClinkrCommandStructure } from "@nseng-ai/clinkr";
import { defineCli, type CliEntrypointDeps } from "@nseng-ai/foundation/cli-runtime";

import { createRealBrmemContext, type BrmemCliContext } from "../context.ts";
import type { BrmemSourceReader } from "../source-reader.ts";

const entry = defineCli<BrmemCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Manage Branch Memory Entries stored in git refs.",
	prepareRun: ({ deps, cwd, env }) => {
		const context = deps.context ?? createRealBrmemContext({ cwd, env });
		const runContext: BrmemCliContext = {
			...context,
			cwd,
			env: deps.env ?? context.env,
			stdin: deps.stdin ?? context.stdin,
			sourceReader: deps.sourceReader ?? context.sourceReader,
			stderr: deps.stderr ?? context.stderr,
			interaction: deps.interaction ?? context.interaction,
		};
		return { type: "run", context: runContext, buildState: undefined };
	},
	buildCli: async ({ appBuilder }) => {
		await addClinkrCommandStructure(appBuilder, import.meta.dirname);
	},
});

export const VERSION = entry.version;

export interface CliDeps extends CliEntrypointDeps {
	context?: BrmemCliContext;
	stdin?: () => Promise<string>;
	sourceReader?: BrmemSourceReader;
	interaction?: BrmemCliContext["interaction"];
}

export async function buildCli() {
	return await entry.buildCli(undefined);
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
