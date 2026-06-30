#!/usr/bin/env bun

import { z } from "zod";

import { ClinkrGroup, failure, ok, usageError } from "@sdl/clinkr";
import { defineCli } from "@sdl/cli-runtime";
import type { ExplicitUndefined } from "@sdl/core/primitives";

import { runRealCommand, type CommandRunner } from "./command-runner.ts";
import {
	formatSdlccCmuxReportHuman,
	isSdlccCmuxReportUsageFailure,
	runSdlccCmuxReport,
	sdlccCmuxReportData,
	sdlccCmuxReportFailureData,
	sdlccCmuxReportResultSchema,
} from "./cmux-report.ts";

export interface SdlccCliDeps {
	readonly cwd?: string | undefined;
	readonly env?: ExplicitUndefined<"env-map", Record<string, string | undefined>>;
	readonly runCommand?: CommandRunner | undefined;
	readonly stdout?: ((text: string) => void) | undefined;
	readonly stderr?: ((text: string) => void) | undefined;
	readonly startTui?: (() => Promise<void> | void) | undefined;
}

interface SdlccCliContext {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly runCommand: CommandRunner;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
}

const entry = defineCli<SdlccCliContext, SdlccCliDeps>({
	metaUrl: import.meta.url,
	runtime: "bun",
	description: "Open a full-screen OpenTUI stack map.",
	prepareRun: async ({ args, deps, cwd, env, stdout, stderr }) => {
		const context: SdlccCliContext = {
			cwd: deps.cwd ?? cwd,
			env: deps.env ?? env,
			runCommand: deps.runCommand ?? runRealCommand,
			stdout: deps.stdout ?? stdout,
			stderr: deps.stderr ?? stderr,
		};
		if (args.length === 0) {
			if (deps.startTui !== undefined) {
				await deps.startTui();
			} else {
				await startDefaultTui(context);
			}
			return { type: "handled", exitCode: 0 };
		}
		return { type: "run", context, buildState: undefined };
	},
	configureCli: ({ root }) => {
		const cmuxGroup = new ClinkrGroup<SdlccCliContext>({
			name: "cmux",
			description: "cmux integration helpers for sdlcc.",
		});
		cmuxGroup.command({
			name: "report",
			description: "Report the current git worktree identity to the current cmux surface.",
			summary: "Report branch/worktree identity into cmux surface resume metadata.",
			schema: z.object({}),
			resultSchema: sdlccCmuxReportResultSchema,
			handler: async (ctx) => {
				const result = await runSdlccCmuxReport({
					cwd: ctx.cwd,
					env: ctx.env,
					runCommand: ctx.runCommand,
				});
				if (result.type === "reported") return ok(sdlccCmuxReportData(result.metadata));
				const data = sdlccCmuxReportFailureData(result);
				if (isSdlccCmuxReportUsageFailure(result.code)) return usageError(result.message, data);
				return failure(result.code, result.message, data);
			},
			renderHuman: formatSdlccCmuxReportHuman,
		});
		root.group(cmuxGroup);
	},
});

export function buildCli(): ClinkrGroup<SdlccCliContext> {
	return entry.buildCli(undefined);
}

export async function runSdlccCli(
	args: readonly string[],
	deps: SdlccCliDeps = {},
): Promise<number> {
	return await entry.run(args, deps);
}

async function startDefaultTui(context: SdlccCliContext): Promise<void> {
	const [{ startTabHostTui }, { tabControllers }] = await Promise.all([
		import("./tabs/tab-host-renderer.ts"),
		import("./tabs/registry.ts"),
	]);
	await startTabHostTui({
		controllers: tabControllers,
		deps: { cwd: context.cwd, env: context.env, runCommand: context.runCommand },
	});
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
