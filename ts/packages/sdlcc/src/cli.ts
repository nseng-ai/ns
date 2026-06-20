#!/usr/bin/env bun

import { z } from "zod";

import { ClinkrGroup } from "@asdl/clinkr";
import { defineCli } from "@asdl/core/cli-entry";
import { rawCommand } from "@asdl/clinkr/raw";

import { runRealCommand, type CommandRunner } from "./command-runner.ts";
import {
	formatSdlccCmuxReportHuman,
	formatSdlccCmuxReportJson,
	runSdlccCmuxReport,
} from "./cmux-report.ts";


export interface SdlccCliDeps {
	readonly cwd?: string | undefined;
	readonly env?: Record<string, string | undefined> | undefined;
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
	buildCli: ({ name, description, version, runtimeInfo }) => {
		const root = new ClinkrGroup<SdlccCliContext>({
			name,
			description,
			version,
			runtimeInfo,
		});

		const cmuxGroup = new ClinkrGroup<SdlccCliContext>({
			name: "cmux",
			description: "cmux integration helpers for sdlcc.",
		});
		cmuxGroup.command(
			rawCommand({
				name: "report",
				description: "Report the current git worktree identity to the current cmux surface.",
				summary: "Report branch/worktree identity into cmux surface resume metadata.",
				schema: z.object({
					json: z
						.boolean()
						.default(false)
						.describe("Emit machine-readable JSON on stdout, including failures."),
				}),
				run: async (ctx, request) => {
					const result = await runSdlccCmuxReport({
						cwd: ctx.cwd,
						env: ctx.env,
						runCommand: ctx.runCommand,
					});
					if (request.json) {
						ctx.stdout(formatSdlccCmuxReportJson(result));
						return result.type === "reported" ? 0 : 1;
					}
					if (result.type === "reported") {
						ctx.stdout(formatSdlccCmuxReportHuman(result));
						return 0;
					}
					ctx.stderr(formatSdlccCmuxReportHuman(result));
					return 1;
				},
			}),
		);
		root.group(cmuxGroup);
		return root;
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
