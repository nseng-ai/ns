#!/usr/bin/env bun

import { z } from "zod";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { rawCommand } from "@asdl/clinkr/raw";

import { startDefaultApp } from "./app-renderer.ts";
import { runRealCommand, type CommandRunner } from "./command-runner.ts";
import { formatSdlccCmuxReportHuman, formatSdlccCmuxReportJson, runSdlccCmuxReport } from "./cmux-report.ts";
import { stackMapTabModule } from "./stack-map-tab.ts";
import { createTabController } from "./tabs/tab-controller.ts";
import { startTabHostTui } from "./tabs/tab-host-renderer.ts";

const VERSION = "0.1.0";

export interface SdlccCliDeps {
	readonly cwd?: string | undefined;
	readonly env?: Record<string, string | undefined> | undefined;
	readonly runCommand?: CommandRunner | undefined;
	readonly stdout?: ((text: string) => void) | undefined;
	readonly stderr?: ((text: string) => void) | undefined;
	readonly startApp?: (() => Promise<void> | void) | undefined;
	readonly startStackMap?: (() => Promise<void> | void) | undefined;
	readonly startTui?: (() => Promise<void> | void) | undefined;
}

interface SdlccCliContext {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly runCommand: CommandRunner;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	readonly startApp: () => Promise<void> | void;
	readonly startStackMap: () => Promise<void> | void;
}

export function buildCli(): ClinkrGroup<SdlccCliContext> {
	const root = new ClinkrGroup<SdlccCliContext>({ name: "sdlcc", description: "Open the dashboard-first OpenTUI app shell.", version: VERSION, runtimeInfo });
	root.command(rawCommand({ name: "stack-map", description: "Open the direct stack-map TUI fallback.", summary: "Open the legacy direct stack-map path.", schema: z.object({}), run: async (ctx) => { await ctx.startStackMap(); return 0; } }));
	const cmuxGroup = new ClinkrGroup<SdlccCliContext>({ name: "cmux", description: "cmux integration helpers for sdlcc." });
	cmuxGroup.command(rawCommand({ name: "report", description: "Report the current git worktree identity to the current cmux surface.", summary: "Report branch/worktree identity into cmux surface resume metadata.", schema: z.object({ json: z.boolean().default(false).describe("Emit machine-readable JSON on stdout, including failures.") }), run: async (ctx, request) => { const result = await runSdlccCmuxReport({ cwd: ctx.cwd, env: ctx.env, runCommand: ctx.runCommand }); if (request.json) { ctx.stdout(formatSdlccCmuxReportJson(result)); return result.type === "reported" ? 0 : 1; } if (result.type === "reported") { ctx.stdout(formatSdlccCmuxReportHuman(result)); return 0; } ctx.stderr(formatSdlccCmuxReportHuman(result)); return 1; } }));
	root.group(cmuxGroup);
	return root;
}

export async function runSdlccCli(args: readonly string[], deps: SdlccCliDeps = {}): Promise<number> {
	const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
	const stderr = deps.stderr ?? ((text: string) => process.stderr.write(text));
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;
	const runCommand = deps.runCommand ?? runRealCommand;
	const startApp = deps.startApp ?? deps.startTui ?? startDefaultApp;
	const startStackMap = deps.startStackMap ?? (async () => startTabHostTui({ controllers: [createTabController(stackMapTabModule)], deps: { cwd, env, runCommand } }));
	if (args.length === 0) { await startApp(); return 0; }
	const io = resolveIo({ stdout, stderr });
	return await buildCli().run(args, { context: { cwd, env, runCommand, stdout, stderr, startApp, startStackMap }, io });
}

function runtimeInfo(): string {
	return "runtime: bun\nentry_point: sdlcc bin sdlcc -> ts/packages/sdlcc/src/cli.ts\n";
}


if (import.meta.main) {
	process.exitCode = await runSdlccCli(process.argv.slice(2));
}
