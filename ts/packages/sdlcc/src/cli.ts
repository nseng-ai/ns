#!/usr/bin/env bun

import { z } from "zod";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { rawCommand } from "@asdl/clinkr/raw";

import { runRealCommand, type CommandRunner } from "./command-runner.ts";
import {
	formatSdlccCmuxReportHuman,
	formatSdlccCmuxReportJson,
	runSdlccCmuxReport,
} from "./cmux-report.ts";

const VERSION = "0.1.0";

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

export function buildCli(): ClinkrGroup<SdlccCliContext> {
	const root = new ClinkrGroup<SdlccCliContext>({
		name: "sdlcc",
		description: "Open a full-screen OpenTUI stack map.",
		version: VERSION,
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
}

export async function runSdlccCli(
	args: readonly string[],
	deps: SdlccCliDeps = {},
): Promise<number> {
	const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
	const stderr = deps.stderr ?? ((text: string) => process.stderr.write(text));
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;
	const runCommand = deps.runCommand ?? runRealCommand;

	const context: SdlccCliContext = { cwd, env, runCommand, stdout, stderr };

	if (args.length === 0) {
		if (deps.startTui !== undefined) {
			await deps.startTui();
		} else {
			await startDefaultTui(context);
		}
		return 0;
	}

	const io = resolveIo({ stdout, stderr });
	return await buildCli().run(args, { context, io });
}

function runtimeInfo(): string {
	return "runtime: bun\nentry_point: sdlcc bin sdlcc -> ts/packages/sdlcc/src/cli.ts\n";
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

if (import.meta.main) {
	process.exitCode = await runSdlccCli(process.argv.slice(2));
}
