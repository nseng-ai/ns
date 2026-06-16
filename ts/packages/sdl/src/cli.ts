#!/usr/bin/env node

import process from "node:process";

import { z } from "zod";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { rawCommand } from "@asdl/clinkr/raw";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";

import { executeSdlCommand, listStaticSdlCommandInfos, type SdlCommandInfo, type SdlCommandCliInfo } from "./command-registry.ts";
import { createRealSdlCommandContext } from "./context.ts";
import { formatExtensionErrorDiagnostics, hasExtensionErrors, loadExtensions } from "./extension-registry.ts";
import type { SdlCommand, SdlConfirmPrompt, SdlContext, SdlOutputStream } from "./sdk.ts";

export type { SdlCommandInfo } from "./command-registry.ts";

export interface SdlCliDeps {
	context?: SdlContext | undefined;
	cwd?: string | undefined;
	homeDir?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	onOutput?: ((stream: SdlOutputStream, text: string) => void) | undefined;
	confirm?: SdlConfirmPrompt | undefined;
	env?: Record<string, string | undefined> | undefined;
}

export interface BuildSdlCliOptions {
	commandInfos?: readonly SdlCommandCliInfo[] | undefined;
	commands?: ReadonlyMap<string, SdlCommand> | undefined;
	selectedCommand?: SdlCommand | undefined;
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

	const commandInfos = options.commandInfos ?? listStaticSdlCommandInfos();
	for (const commandInfo of commandInfos) {
		const selectedCommand = options.selectedCommand?.name === commandInfo.name ? options.selectedCommand : undefined;
		const commandName = commandInfo.name;
		const schema = selectedCommand?.schema ?? z.object({});
		group.command(
			rawCommand({
				name: commandName,
				description: commandInfo.fullDescription,
				summary: commandInfo.description,
				schema,
				...(selectedCommand?.positionals === undefined ? {} : { positionals: selectedCommand.positionals }),
				run: async (ctx, request) => {
					const command = selectedCommand ?? options.commands?.get(commandName);
					const result = command === undefined
						? { ok: false as const, exitCode: 2, message: `Unknown SDL command: ${commandName}` }
						: await executeSdlCommand(ctx.context, command, request);
					writeSdlResultOutput(result, ctx);
					return result.ok ? 0 : result.exitCode;
				},
			}),
		);
	}

	return group;
}

export function listSdlCommands(): SdlCommandInfo[] {
	return listStaticSdlCommandInfos().map(({ name, description }) => ({ name, description }));
}

export async function runCli(args: readonly string[], deps: SdlCliDeps = {}): Promise<number> {
	const injectedContext = deps.context;
	const stdout = deps.stdout ?? injectedContext?.stdout ?? ((text: string) => {
		process.stdout.write(text);
	});
	const stderr = deps.stderr ?? injectedContext?.stderr ?? ((text: string) => {
		process.stderr.write(text);
	});

	const cwd = deps.cwd ?? injectedContext?.cwd ?? process.cwd();
	const env = deps.env ?? injectedContext?.env ?? process.env;
	const loadedExtensions = await loadExtensions({ cwd, env, homeDir: deps.homeDir ?? env.HOME });
	if (hasExtensionErrors(loadedExtensions.diagnostics)) {
		stderr(`${formatExtensionErrorDiagnostics(loadedExtensions.diagnostics)}\n`);
		return 2;
	}

	const selectedCommandName = selectCommandName(args, loadedExtensions.commandInfos);
	const selectedCommand = selectedCommandName === undefined ? undefined : loadedExtensions.commands.get(selectedCommandName);

	const baseContext = injectedContext ?? createRealSdlCommandContext({ cwd, env });
	const onOutput = deps.onOutput ?? baseContext.onOutput;
	const confirm = deps.confirm ?? baseContext.confirm;
	const context: SdlContext = {
		cwd,
		env,
		model: baseContext.model,
		exec: baseContext.exec.bind(baseContext),
		stdout,
		stderr,
		...(onOutput === undefined ? {} : { onOutput }),
		...(confirm === undefined ? {} : { confirm }),
		...(baseContext.extensions === undefined ? {} : { extensions: baseContext.extensions }),
	};
	const contextWithIO: SdlCliContext = { context, cwd, env, stdout, stderr };
	const io = resolveIo({ stdout, stderr });
	return buildCli({ commandInfos: loadedExtensions.commandInfos, commands: loadedExtensions.commands, selectedCommand }).run(args, { context: contextWithIO, io });
}

function selectCommandName(args: readonly string[], commandInfos: readonly SdlCommandInfo[]): string | undefined {
	const firstArg = args[0];
	if (firstArg === undefined || firstArg.startsWith("-")) return undefined;
	const names = new Set(commandInfos.map((command) => command.name));
	return names.has(firstArg) ? firstArg : undefined;
}

function writeSdlResultOutput(result: { ok: true; message: string } | { ok: false; message: string }, deps: Pick<SdlCliContext, "stdout" | "stderr">): void {
	if (result.message === "") return;
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
