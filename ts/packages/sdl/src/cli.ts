#!/usr/bin/env node

import process from "node:process";

import { z } from "zod";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { rawCommand } from "@asdl/clinkr/raw";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";

import { executeSdlCommand, listStaticSdlCommandInfos, type SdlCommandInfo, type SdlCommandCliInfo } from "./command-registry.ts";
import { createRealSdlCommandContext } from "./context.ts";
import {
	classifyExtensionDiagnosticsForInvocation,
	commandInfosForSelectedCommand,
	formatExtensionErrorDiagnostics,
	formatExtensionWarningDiagnostics,
	loadSdlCommandCatalog,
	loadSelectedSdlCommand,
} from "./extension-registry.ts";
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
					const result = selectedCommand === undefined
						? { ok: false as const, exitCode: 2, message: `Unknown SDL command: ${commandName}` }
						: await executeSdlCommand(ctx.context, selectedCommand, request);
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
	const commandCatalog = await loadSdlCommandCatalog({ cwd, env, homeDir: deps.homeDir ?? env.HOME });
	const selectedCommandName = requestedCommandName(args);
	const selectedCandidate = selectedCommandName === undefined ? undefined : commandCatalog.candidates.get(selectedCommandName);
	const diagnosticClassification = classifyExtensionDiagnosticsForInvocation({
		diagnostics: commandCatalog.diagnostics,
		requestedCommandName: selectedCommandName,
		selectedCandidate,
	});
	if (diagnosticClassification.fatal.length > 0) {
		stderr(`${formatExtensionErrorDiagnostics(diagnosticClassification.fatal)}\n`);
		return 2;
	}
	if (diagnosticClassification.warnings.length > 0) {
		stderr(`${formatExtensionWarningDiagnostics(diagnosticClassification.warnings)}\n`);
	}

	const loadedSelectedCommand = selectedCandidate === undefined ? undefined : await loadSelectedSdlCommand(selectedCandidate);
	if (loadedSelectedCommand !== undefined && !loadedSelectedCommand.ok) {
		stderr(`${formatExtensionErrorDiagnostics([loadedSelectedCommand.diagnostic])}\n`);
		return 2;
	}
	const selectedCommand = loadedSelectedCommand?.command;
	const selectedSource = loadedSelectedCommand?.source;
	const commandInfos = commandInfosForSelectedCommand(
		commandCatalog.commandInfos,
		selectedCommand === undefined || selectedSource === undefined ? undefined : { command: selectedCommand, source: selectedSource },
	);

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
	return buildCli({ commandInfos, selectedCommand }).run(args, { context: contextWithIO, io });
}

function requestedCommandName(args: readonly string[]): string | undefined {
	const firstArg = args[0];
	if (firstArg === undefined || firstArg.startsWith("-")) return undefined;
	return firstArg;
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
