#!/usr/bin/env node

import { ClinkrGroup } from "@nseng-ai/clinkr";
import { defineCli } from "@nseng-ai/foundation/cli-runtime";

import {
	createLocalNsProjectRequestSchema,
	createLocalNsProjectResultSchema,
	renderCreateLocalNsProject,
	runCreateLocalNsProject,
} from "./commands/create-local-ns-project.ts";
import {
	installLocalNsExtensionRequestSchema,
	installLocalNsExtensionResultSchema,
	renderInstallLocalNsExtension,
	runInstallLocalNsExtension,
} from "./commands/install-local-ns-extension.ts";
import { createRealNsDevContext, type NsDevCliContext, type NsDevCliDeps } from "./context.ts";

export interface CliDeps extends NsDevCliDeps {
	readonly context?: NsDevCliContext;
}

const entry = defineCli<NsDevCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Project-local development workflows for the ns repository.",
	prepareRun: ({ deps, cwd, env, stderr }) => {
		const context =
			deps.context ??
			createRealNsDevContext({
				cwd: deps.cwd ?? cwd,
				env: deps.env ?? env,
				...(deps.homeDir === undefined ? {} : { homeDir: deps.homeDir }),
				...(deps.runCommand === undefined ? {} : { runCommand: deps.runCommand }),
				...(deps.fs === undefined ? {} : { fs: deps.fs }),
				...(deps.clock === undefined ? {} : { clock: deps.clock }),
				status: deps.stderr ?? stderr,
			});
		return { type: "run", context, buildState: undefined };
	},
	configureCli: ({ root }) => {
		root.command({
			name: "create-local-ns-project",
			description:
				"Create a local ns development bootstrap project, install the local @nseng-ai/ns package, commit it, and verify npx ns by default.",
			schema: createLocalNsProjectRequestSchema,
			options: { force: { short: "-f" } },
			resultSchema: createLocalNsProjectResultSchema,
			handler: runCreateLocalNsProject,
			renderHuman: renderCreateLocalNsProject,
		});
		root.command({
			name: "install-local-ns-extension",
			description:
				"Install a local ns extension package into an existing target project through npm tarball semantics.",
			schema: installLocalNsExtensionRequestSchema,
			options: {
				target: { short: "-t" },
				package: { short: "-p" },
				forcePackDir: { short: "-f" },
			},
			resultSchema: installLocalNsExtensionResultSchema,
			handler: runInstallLocalNsExtension,
			renderHuman: renderInstallLocalNsExtension,
		});
	},
});

export const VERSION = entry.version;

export function buildCli(): ClinkrGroup<NsDevCliContext> {
	return entry.buildCli(undefined);
}

export async function runNsDevCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
