#!/usr/bin/env node

import process from "node:process";

import { z } from "zod";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { rawCommand } from "@asdl/clinkr/raw";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";

import { commandDescription, discoverProjectCommandNames, listSdlCommandInfos, runSdlCommand, type SdlCommandInfo } from "./command-registry.ts";
import { createRealSdlCommandContext } from "./context.ts";
import type { SdlContext } from "./sdk.ts";

export type { SdlCommandInfo } from "./command-registry.ts";

export interface SdlCliDeps {
	context?: SdlContext | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	env?: Record<string, string | undefined> | undefined;
}

export interface BuildSdlCliOptions {
	projectCommandNames?: readonly string[];
}

export interface SdlCliContext {
	context: SdlContext;
	cwd: string;
	env: Record<string, string | undefined>;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

const VERSION = "0.1.0";

export function buildCli(options: BuildSdlCliOptions = {}): ClinkrGroup<SdlCliContext> {
	const group = new ClinkrGroup<SdlCliContext>({
		name: "sdl",
		description: "Source Development Lifecycle tools.",
		version: VERSION,
		runtimeInfo: () => "runtime: typescript\nentry_point: @asdl/sdl bin sdl -> ts/packages/sdl/src/cli.ts\n",
	});

	const commandInfos = listSdlCommandInfos({ projectCommandNames: options.projectCommandNames });
	for (const commandInfo of commandInfos) {
		const commandName = commandInfo.name;
		group.command(
			rawCommand({
				name: commandName,
				description: commandDescription(commandName),
				summary: commandInfo.description,
				schema: z.object({}),
				run: async (ctx) => {
					const result = await runSdlCommand(ctx.context, commandName);
					writeSdlResultOutput(result, ctx);
					return result.ok ? 0 : result.exitCode;
				},
			}),
		);
	}

	return group;
}

export function listSdlCommands(): SdlCommandInfo[] {
	return listSdlCommandInfos();
}

export async function runCli(args: readonly string[], deps: SdlCliDeps = {}): Promise<number> {
	const stdout = deps.stdout ?? ((text: string) => {
		process.stdout.write(text);
	});
	const stderr = deps.stderr ?? ((text: string) => {
		process.stderr.write(text);
	});

	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;
	const discoveredProjectCommands = discoverProjectCommandNames(cwd);
	if (!discoveredProjectCommands.ok) {
		stderr(`${discoveredProjectCommands.message}\n`);
		return 2;
	}

	const context = deps.context ?? createRealSdlCommandContext({ cwd, env });
	const contextWithIO: SdlCliContext = { context, cwd, env, stdout, stderr };
	const io = resolveIo({ stdout, stderr });
	return buildCli({ projectCommandNames: discoveredProjectCommands.names }).run(args, { context: contextWithIO, io });
}

function writeSdlResultOutput(result: { ok: true; message: string } | { ok: false; message: string }, deps: Pick<SdlCliContext, "stdout" | "stderr">): void {
	const output = `${result.message}\n`;
	if (result.ok) {
		deps.stdout(output);
		return;
	}
	deps.stderr(output);
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
