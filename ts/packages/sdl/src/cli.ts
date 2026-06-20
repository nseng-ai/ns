#!/usr/bin/env node

import { z } from "zod";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { rawCommand } from "@asdl/clinkr/raw";
import { defineCli } from "@asdl/core/cli-entry";

import {
	executeSdlCommand,
	listStaticSdlCommandInfos,
	type SdlCommandInfo,
	type SdlCommandCliInfo,
} from "./command-registry.ts";
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

interface SdlCliBuildState {
	commandInfos: readonly SdlCommandCliInfo[];
	selectedCommand?: SdlCommand | undefined;
}

const entry = defineCli<SdlCliContext, SdlCliDeps, SdlCliBuildState>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Source Development Lifecycle tools.",
	prepareRun: async ({ args, deps, cwd, env, stdout, stderr }) => {
		const injectedContext = deps.context;
		const resolvedStdout = deps.stdout ?? injectedContext?.stdout ?? stdout;
		const resolvedStderr = deps.stderr ?? injectedContext?.stderr ?? stderr;
		const resolvedCwd = deps.cwd ?? injectedContext?.cwd ?? cwd;
		const resolvedEnv = deps.env ?? injectedContext?.env ?? env;
		const commandCatalog = await loadSdlCommandCatalog({
			cwd: resolvedCwd,
			homeDir: deps.homeDir ?? resolvedEnv.HOME,
		});
		const selectedCommandName = requestedCommandName(args);
		const selectedCandidate =
			selectedCommandName === undefined
				? undefined
				: commandCatalog.candidates.get(selectedCommandName);
		const diagnosticClassification = classifyExtensionDiagnosticsForInvocation({
			diagnostics: commandCatalog.diagnostics,
			requestedCommandName: selectedCommandName,
			selectedCandidate,
		});
		if (diagnosticClassification.fatal.length > 0) {
			resolvedStderr(`${formatExtensionErrorDiagnostics(diagnosticClassification.fatal)}\n`);
			return { type: "handled", exitCode: 2 };
		}
		if (diagnosticClassification.warnings.length > 0) {
			resolvedStderr(`${formatExtensionWarningDiagnostics(diagnosticClassification.warnings)}\n`);
		}

		const loadedSelectedCommand =
			selectedCandidate === undefined ? undefined : await loadSelectedSdlCommand(selectedCandidate);
		if (loadedSelectedCommand !== undefined && !loadedSelectedCommand.ok) {
			resolvedStderr(`${formatExtensionErrorDiagnostics([loadedSelectedCommand.diagnostic])}\n`);
			return { type: "handled", exitCode: 2 };
		}
		const selectedCommand = loadedSelectedCommand?.command;
		const selectedSource = loadedSelectedCommand?.source;
		const commandInfos = commandInfosForSelectedCommand(
			commandCatalog.commandInfos,
			selectedCommand === undefined || selectedSource === undefined
				? undefined
				: { command: selectedCommand, source: selectedSource },
		);

		const baseContext = injectedContext ?? createRealSdlCommandContext({ cwd: resolvedCwd, env: resolvedEnv });
		const onOutput = deps.onOutput ?? baseContext.onOutput;
		const confirm = deps.confirm ?? baseContext.confirm;
		const context: SdlContext = {
			cwd: resolvedCwd,
			env: resolvedEnv,
			model: baseContext.model,
			exec: baseContext.exec.bind(baseContext),
			stdout: resolvedStdout,
			stderr: resolvedStderr,
			...(onOutput === undefined ? {} : { onOutput }),
			...(confirm === undefined ? {} : { confirm }),
			...(baseContext.extensions === undefined ? {} : { extensions: baseContext.extensions }),
		};
		const contextWithIO: SdlCliContext = {
			context,
			cwd: resolvedCwd,
			env: resolvedEnv,
			stdout: resolvedStdout,
			stderr: resolvedStderr,
		};
		return {
			type: "run",
			context: contextWithIO,
			buildState: { commandInfos, selectedCommand },
		};
	},
	buildCli: ({ name, description, version, runtimeInfo, buildState }) =>
		buildSdlCli({ name, description, version, runtimeInfo, buildState }),
});

export function buildCli(options: BuildSdlCliOptions = {}): ClinkrGroup<SdlCliContext> {
	return entry.buildCli({
		commandInfos: options.commandInfos ?? listStaticSdlCommandInfos(),
		selectedCommand: options.selectedCommand,
	});
}

function buildSdlCli(input: {
	name: string;
	description: string;
	version: string;
	runtimeInfo: () => string;
	buildState: SdlCliBuildState;
}): ClinkrGroup<SdlCliContext> {
	const group = new ClinkrGroup<SdlCliContext>({
		name: input.name,
		description: input.description,
		version: input.version,
		runtimeInfo: input.runtimeInfo,
	});

	for (const commandInfo of input.buildState.commandInfos) {
		const selectedCommand =
			input.buildState.selectedCommand?.name === commandInfo.name
				? input.buildState.selectedCommand
				: undefined;
		const commandName = commandInfo.name;
		const schema = selectedCommand?.schema ?? z.object({});
		group.command(
			rawCommand({
				name: commandName,
				description: commandInfo.fullDescription,
				summary: commandInfo.description,
				schema,
				...(selectedCommand?.positionals === undefined
					? {}
					: { positionals: selectedCommand.positionals }),
				run: async (ctx, request) => {
					const result =
						selectedCommand === undefined
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
	return await entry.run(args, deps);
}

function requestedCommandName(args: readonly string[]): string | undefined {
	const firstArg = args[0];
	if (firstArg === undefined || firstArg.startsWith("-")) return undefined;
	return firstArg;
}

function writeSdlResultOutput(
	result: { ok: true; message: string } | { ok: false; message: string },
	deps: Pick<SdlCliContext, "stdout" | "stderr">,
): void {
	if (result.message === "") return;
	const output = `${result.message}\n`;
	if (result.ok) {
		deps.stdout(output);
		return;
	}
	deps.stderr(output);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
