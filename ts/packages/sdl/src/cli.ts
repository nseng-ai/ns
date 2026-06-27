#!/usr/bin/env node

import { z } from "zod";

import {
	ClinkrGroup,
	isClinkrHumanOutputInvocation,
	resolveClinkrInteraction,
	type ClinkrCommandSpec,
} from "@sdl/clinkr";
import { rawCommand } from "@sdl/clinkr/raw";
import { defineCli } from "@sdl/core/cli-entry";
import { readStdinLine } from "@sdl/core/stdin";
import { buildSlotCommandGroup } from "@sdl/slot/command-face";
import { createRealSlotContext, type SlotCliContext } from "@sdl/slot";

import {
	commandDisplayName,
	commandKey,
	commandPathMatches,
	executeSdlCommand,
	listStaticSdlCommandInfos,
	validateSdlClinkrExit,
	type SdlCommandInfo,
	type SdlCommandCliInfo,
	type SdlCommandPath,
} from "./command-registry.ts";
import { createRealSdlCommandContext } from "./context.ts";
import {
	classifyExtensionDiagnosticsForInvocation,
	commandInfosForSelectedCommand,
	formatExtensionErrorDiagnostics,
	formatExtensionWarningDiagnostics,
	loadListingCommandInfos,
	loadSdlCommandCatalog,
	loadSelectedSdlCommand,
} from "./extension-registry.ts";
import type { SdlCommand, SdlConfirmPrompt, SdlExtensionApi, SdlOutputStream } from "sdl-sdk";
import {
	renderSdlShellInstall,
	renderSdlShellShow,
	runSdlShellInstall,
	runSdlShellShow,
	sdlShellInstallRequestSchema,
	sdlShellInstallResultSchema,
	sdlShellShowRequestSchema,
	sdlShellShowResultSchema,
} from "./operations/shell.ts";

export type { SdlCommandInfo } from "./command-registry.ts";

export interface SdlCliDeps {
	context?: SdlExtensionApi | undefined;
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
	selectedCommandPath?: SdlCommandPath | undefined;
}

export interface SdlCliContext extends SlotCliContext {
	context: SdlExtensionApi;
	stdout: (text: string) => void;
}

interface SdlCliBuildState {
	commandInfos: readonly SdlCommandCliInfo[];
	selectedCommand?: SdlCommand | undefined;
	selectedCommandPath?: SdlCommandPath | undefined;
}

const entry = defineCli<SdlCliContext, SdlCliDeps, SdlCliBuildState>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Source Development Lifecycle tools.",
	prepareRun: async ({ args, deps, cwd, env, stdout, stderr, io }) => {
		const injectedContext = deps.context;
		const resolvedStdout = deps.stdout ?? injectedContext?.stdout ?? stdout;
		const resolvedStderr = deps.stderr ?? injectedContext?.stderr ?? stderr;
		const resolvedCwd = deps.cwd ?? injectedContext?.cwd ?? cwd;
		const resolvedEnv = deps.env ?? injectedContext?.env ?? env;
		const commandCatalog = await loadSdlCommandCatalog({
			cwd: resolvedCwd,
			homeDir: deps.homeDir ?? resolvedEnv.HOME,
		});
		const selectedCommandKey = requestedCommandKey(args, commandCatalog.commandInfos);
		const selectedCandidate =
			selectedCommandKey === undefined
				? undefined
				: commandCatalog.candidates.get(selectedCommandKey);
		const diagnosticClassification = classifyExtensionDiagnosticsForInvocation({
			diagnostics: commandCatalog.diagnostics,
			requestedCommandName: selectedCommandKey,
			selectedCandidate,
		});
		if (diagnosticClassification.fatal.length > 0) {
			resolvedStderr(`${formatExtensionErrorDiagnostics(diagnosticClassification.fatal)}\n`);
			return { type: "handled", exitCode: 2 };
		}

		let commandInfos = commandCatalog.commandInfos;
		let listingDiagnostics: typeof diagnosticClassification.warnings = [];
		if (selectedCommandKey === undefined && !isStaticTopLevelMetadataRequest(args)) {
			const loadedListing = await loadListingCommandInfos(commandCatalog);
			commandInfos = loadedListing.commandInfos;
			listingDiagnostics = loadedListing.diagnostics;
		}
		const warnings = [...diagnosticClassification.warnings, ...listingDiagnostics];
		if (warnings.length > 0) {
			resolvedStderr(`${formatExtensionWarningDiagnostics(warnings)}\n`);
		}

		const loadedSelectedCommand =
			selectedCandidate === undefined ? undefined : await loadSelectedSdlCommand(selectedCandidate);
		if (loadedSelectedCommand !== undefined && !loadedSelectedCommand.ok) {
			resolvedStderr(`${formatExtensionErrorDiagnostics([loadedSelectedCommand.diagnostic])}\n`);
			return { type: "handled", exitCode: 2 };
		}
		const selectedCommand = loadedSelectedCommand?.command;
		const selectedSource = loadedSelectedCommand?.source;
		const selectedPath = loadedSelectedCommand?.path;
		commandInfos = commandInfosForSelectedCommand(
			commandInfos,
			selectedCommand === undefined || selectedSource === undefined || selectedPath === undefined
				? undefined
				: { command: selectedCommand, source: selectedSource, path: selectedPath },
		);

		const baseContext =
			injectedContext ?? createRealSdlCommandContext({ cwd: resolvedCwd, env: resolvedEnv });
		const onOutput = deps.onOutput ?? baseContext.onOutput;
		const confirm = deps.confirm ?? baseContext.confirm;
		const contextExtensions = {
			...(baseContext.extensions ?? {}),
			"sdl.clinkr.caps": io.caps,
		};
		const context: SdlExtensionApi = {
			cwd: resolvedCwd,
			env: resolvedEnv,
			textGenerator: baseContext.textGenerator,
			exec: baseContext.exec.bind(baseContext),
			stdout: resolvedStdout,
			stderr: resolvedStderr,
			...(onOutput === undefined ? {} : { onOutput }),
			...(confirm === undefined ? {} : { confirm }),
			extensions: contextExtensions,
		};
		const slotContext = await createRealSlotContext({ cwd: resolvedCwd, env: resolvedEnv });
		const contextWithIO: SdlCliContext = {
			...slotContext,
			context,
			cwd: resolvedCwd,
			env: resolvedEnv,
			stdout: resolvedStdout,
			stderr: resolvedStderr,
			interaction: resolveClinkrInteraction({
				stdin: readStdinLine,
				stderr: resolvedStderr,
			}),
			shouldWriteCdDirective: isClinkrHumanOutputInvocation(args),
		};
		return {
			type: "run",
			context: contextWithIO,
			buildState: { commandInfos, selectedCommand, selectedCommandPath: selectedPath },
		};
	},
	configureCli: ({ root, buildState }) => {
		const slotGroup = buildSlotCommandGroup<SdlCliContext>();
		// The SDL-owned shell group is intentionally mounted at both `sdl slot shell`
		// (back-compat with the historical slot alias) and `sdl shell` (the canonical
		// top-level face). The duplicate help entry is the cost of that compatibility
		// promise, not an accidental double-mount.
		slotGroup.group(buildSdlShellGroup());
		root.group(slotGroup);
		root.group(buildSdlShellGroup());
		const groups = new Map<string, ClinkrGroup<SdlCliContext>>();
		for (const commandInfo of buildState.commandInfos) {
			const parent = groupForCommand(root, groups, commandInfo);
			const selectedCommand =
				buildState.selectedCommandPath !== undefined &&
				commandPathMatches(buildState.selectedCommandPath, commandInfo)
					? buildState.selectedCommand
					: undefined;
			const schema = selectedCommand?.schema ?? z.object({});
			const commandOptions = {
				name: cliLeafCommandName(commandInfo),
				description: commandInfo.fullDescription,
				summary: commandInfo.description,
				schema,
				...(selectedCommand?.positionals === undefined
					? {}
					: { positionals: selectedCommand.positionals }),
			};
			if (selectedCommand?.resultSchema !== undefined) {
				parent.command({
					...commandOptions,
					resultSchema: selectedCommand.resultSchema,
					...(selectedCommand.renderHuman === undefined
						? {}
						: { renderHuman: selectedCommand.renderHuman }),
					...(selectedCommand.renderMarkdown === undefined
						? {}
						: { renderMarkdown: selectedCommand.renderMarkdown }),
					handler: async (ctx, request) => {
						const result = await selectedCommand.run(ctx.context, request);
						return validateSdlClinkrExit(result, selectedCommand.name);
					},
				});
				continue;
			}
			parent.command(
				rawCommand({
					...commandOptions,
					run: async (ctx, request) => {
						const result =
							selectedCommand === undefined
								? {
										ok: false as const,
										exitCode: 2,
										message: `Unknown SDL command: ${commandDisplayName(commandInfo)}`,
									}
								: await executeSdlCommand(ctx.context, selectedCommand, request);
						writeSdlResultOutput(result, ctx);
						return result.ok ? 0 : result.exitCode;
					},
				}),
			);
		}
	},
});

export function buildCli(options: BuildSdlCliOptions = {}): ClinkrGroup<SdlCliContext> {
	return entry.buildCli({
		commandInfos: options.commandInfos ?? listStaticSdlCommandInfos(),
		selectedCommand: options.selectedCommand,
		selectedCommandPath: options.selectedCommandPath,
	});
}

export function listSdlCommands(): SdlCommandInfo[] {
	return listStaticSdlCommandInfos().map(({ group, name, description }) => ({
		...(group === undefined ? {} : { group }),
		name,
		description,
	}));
}

export async function runCli(args: readonly string[], deps: SdlCliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

function requestedCommandKey(
	args: readonly string[],
	commandInfos: readonly SdlCommandCliInfo[],
): string | undefined {
	const firstArg = args[0];
	if (firstArg === undefined || firstArg.startsWith("-")) return undefined;

	const knownGroups = new Set(
		commandInfos.flatMap((commandInfo) =>
			commandInfo.group === undefined ? [] : [commandInfo.group],
		),
	);
	if (!knownGroups.has(firstArg)) return firstArg;

	const secondArg = args[1];
	if (secondArg === undefined || secondArg.startsWith("-")) return undefined;
	if (secondArg === SDL_EXEC_GROUP_NAME) {
		const execCommand = args[2];
		if (execCommand === undefined || execCommand.startsWith("-")) return undefined;
		return commandKey({ group: firstArg, name: execInternalCommandName(execCommand) });
	}
	return commandKey({ group: firstArg, name: secondArg });
}

const SDL_EXEC_GROUP_NAME = "exec";
// Dynamic SDL extensions are one group deep today. A grouped command named
// `exec-<name>` is mounted as hidden `sdl <group> exec <name>` so agent-only
// operations keep the same nested exec contract as first-party Clinkr groups.
const SDL_EXEC_COMMAND_PREFIX = "exec-";

function isGroupedExecCommand(commandInfo: SdlCommandCliInfo): boolean {
	return commandInfo.group !== undefined && commandInfo.name.startsWith(SDL_EXEC_COMMAND_PREFIX);
}

function execInternalCommandName(displayName: string): string {
	return `${SDL_EXEC_COMMAND_PREFIX}${displayName}`;
}

function cliLeafCommandName(commandInfo: SdlCommandCliInfo): string {
	if (!isGroupedExecCommand(commandInfo)) return commandInfo.name;
	return commandInfo.name.slice(SDL_EXEC_COMMAND_PREFIX.length);
}

type ShellCommandSchema = z.ZodObject<{ shell: z.ZodOptional<z.ZodString> }>;

type ShellCommandSpec<T> = Omit<
	ClinkrCommandSpec<SdlCliContext, ShellCommandSchema, T>,
	"name" | "description"
>;

// Keep this shell command face SDL-owned instead of resurrecting the old generic Slot
// builder. The reusable abstraction we expect here is future typed shell contributions
// rendered by SDL inside one managed shell integration, not extension-owned rc-file
// mutation or a Slot-owned command helper.
//
// Intended shell-ownership boundary (target end-state; consolidation deferred):
//   - Slot exposes worktree paths only and stays out of shell-integration concerns.
//   - SDL/core owns wrapper-script generation, the parent-shell integration, and
//     mounting (this group) as one cohesive unit.
// Known deferred drift from that boundary: cd-directive generation still lives in
// Slot's `navigation-result.ts`/`shell/cd-directive.ts`. That is the next consolidation
// step, not a sanctioned long-term split — do not add new shell-integration logic to Slot.
function buildSdlShellGroup(): ClinkrGroup<SdlCliContext> {
	const shell = new ClinkrGroup<SdlCliContext>({
		name: "shell",
		description: "Show or install parent-shell integration.",
	});
	shell.command({
		name: "show",
		description: "Print the parent-shell wrapper script.",
		...withShellOption({
			schema: sdlShellShowRequestSchema,
			resultSchema: sdlShellShowResultSchema,
			handler: runSdlShellShow,
			renderHuman: renderSdlShellShow,
		}),
	});
	shell.command({
		name: "install",
		description: "Install the parent-shell wrapper in the detected or selected rc file.",
		...withShellOption({
			schema: sdlShellInstallRequestSchema,
			resultSchema: sdlShellInstallResultSchema,
			handler: runSdlShellInstall,
			renderHuman: renderSdlShellInstall,
		}),
	});
	return shell;
}

function withShellOption<T>(spec: ShellCommandSpec<T>): ShellCommandSpec<T> {
	return {
		...spec,
		options: { shell: {}, ...(spec.options ?? {}) },
	};
}

function groupForCommand(
	root: ClinkrGroup<SdlCliContext>,
	groups: Map<string, ClinkrGroup<SdlCliContext>>,
	commandInfo: SdlCommandCliInfo,
): ClinkrGroup<SdlCliContext> {
	if (commandInfo.group === undefined) return root;

	const group = topLevelGroupForCommand(root, groups, commandInfo.group);
	if (!isGroupedExecCommand(commandInfo)) return group;

	const execGroupKey = `${commandInfo.group}/${SDL_EXEC_GROUP_NAME}`;
	const existing = groups.get(execGroupKey);
	if (existing !== undefined) return existing;

	const exec = new ClinkrGroup<SdlCliContext>({
		name: SDL_EXEC_GROUP_NAME,
		description: `Skill-invoked SDL ${commandInfo.group} operations.`,
		isHidden: true,
	});
	groups.set(execGroupKey, exec);
	group.group(exec);
	return exec;
}

function topLevelGroupForCommand(
	root: ClinkrGroup<SdlCliContext>,
	groups: Map<string, ClinkrGroup<SdlCliContext>>,
	groupName: string,
): ClinkrGroup<SdlCliContext> {
	const existing = groups.get(groupName);
	if (existing !== undefined) return existing;

	const group = new ClinkrGroup<SdlCliContext>({
		name: groupName,
		description: `SDL ${groupName} commands.`,
	});
	groups.set(groupName, group);
	root.group(group);
	return group;
}

function isStaticTopLevelMetadataRequest(args: readonly string[]): boolean {
	return args.includes("--version") || args.includes("--runtime");
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
