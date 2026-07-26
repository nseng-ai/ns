#!/usr/bin/env node

import { ClinkrGroup } from "@nseng-ai/clinkr";
import { z } from "zod";
import { defineCli, type CliEntrypointDeps } from "@nseng-ai/foundation/cli-runtime";

import { createRealBrmemContext, type BrmemCliContext } from "./context.ts";
import type { BrmemSourceReader } from "./source-reader.ts";
import {
	checkRequestSchema,
	checkResultSchema,
	renderCheck,
	runCheck,
} from "./operations/check.ts";
import { copyRequestSchema, copyResultSchema, renderCopy, runCopy } from "./operations/copy.ts";
import {
	deleteRequestSchema,
	deleteResultSchema,
	renderDelete,
	runDelete,
} from "./operations/delete.ts";
import {
	exportRequestSchema,
	exportResultSchema,
	renderExport,
	runExport,
} from "./operations/export.ts";
import { getRequestSchema, getResultSchema, renderGet, runGet } from "./operations/get.ts";
import { gcRequestSchema, gcResultSchema, renderGc, runGc } from "./operations/gc.ts";
import { listRequestSchema, listResultSchema, renderList, runList } from "./operations/list.ts";
import { putRequestSchema, putResultSchema, renderPut, runPut } from "./operations/put.ts";
import {
	resolvePromptRequestSchema,
	resolvePromptResultSchema,
	renderResolvePrompt,
	runResolvePrompt,
} from "./operations/resolve-prompt.ts";
import {
	renderSetupGit,
	runSetupGit,
	setupGitRequestSchema,
	setupGitResultSchema,
} from "./operations/setup-git.ts";

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
	buildCli: ({ appBuilder, name }) => {
		const root = new ClinkrGroup<BrmemCliContext>({ name });
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
			options: { yes: { short: "-y" } },
			resultSchema: deleteResultSchema,
			usageErrorSchema: z.unknown(),
			handler: runDelete,
			renderHuman: renderDelete,
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
			options: { require: { short: "-r" } },
			resultSchema: checkResultSchema,
			handler: runCheck,
			renderHuman: renderCheck,
		});
		root.command({
			name: "copy",
			description: "Copy Branch Memory Entries between branches.",
			schema: copyRequestSchema,
			resultSchema: copyResultSchema,
			handler: runCopy,
			renderHuman: renderCopy,
		});
		root.command({
			name: "export",
			description: "Export Branch Memory Entries to files.",
			schema: exportRequestSchema,
			resultSchema: exportResultSchema,
			handler: runExport,
			renderHuman: renderExport,
		});
		root.command({
			name: "gc",
			description: "Garbage-collect Branch Memory Snapshots for missing local branches.",
			schema: gcRequestSchema,
			options: { yes: { short: "-y" } },
			resultSchema: gcResultSchema,
			handler: runGc,
			renderHuman: renderGc,
		});
		root.command({
			name: "setup-git",
			description: "Configure Git push/fetch refspecs for Branch Memory Snapshot Refs.",
			schema: setupGitRequestSchema,
			resultSchema: setupGitResultSchema,
			handler: runSetupGit,
			renderHuman: renderSetupGit,
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
			positionals: { name: { position: 0 } },
			resultSchema: resolvePromptResultSchema,
			handler: runResolvePrompt,
			renderHuman: renderResolvePrompt,
		});
		root.group(execGroup);
		appBuilder.importLegacyClinkrGroupForMigration(root);
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
