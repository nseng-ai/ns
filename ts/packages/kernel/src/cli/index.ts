#!/usr/bin/env node

import { z } from "zod";

import {
	ClinkrGroup,
	clinkrFormatFromArgs,
	isClinkrHumanOutputInvocation,
	ok,
	renderCapabilitiesForTerminal,
	type Caps,
	type ClinkrCommandSpec,
	type ClinkrDynamicCompletionRequest,
} from "@sdl/clinkr";
import { renderCompletionCandidatesNewline } from "@sdl/clinkr/completion";
import { rawCommand } from "@sdl/clinkr/raw";
import { defineCli, readStdin, type CliEntrypointDeps } from "@sdl/core/cli-runtime";
import { optionalEntries, optionalEntry } from "@sdl/core/primitives";
import { createRealSlotContext } from "@sdl/slot/api";

import {
	buildSdlCompletionScript,
	renderSdlCompletionScriptResult,
	sdlCompletionScriptResultSchema,
} from "./completion.ts";
import { createRealSdlCommandContext, type SdlCliContext } from "./context.ts";
import {
	renderSdlShellInstall,
	renderSdlShellShow,
	runSdlShellInstall,
	runSdlShellShow,
	sdlShellInstallRequestSchema,
	sdlShellInstallResultSchema,
	sdlShellShowRequestSchema,
	sdlShellShowResultSchema,
} from "./shell.ts";
import { createCliCommandIo, noopSdlProgress } from "../runtime/command-io.ts";
import {
	classifyExtensionDiagnosticsForInvocation,
	commandInfosForSelectedCommand,
	formatExtensionErrorDiagnostics,
	formatExtensionWarningDiagnostics,
	loadListingCommandInfos,
	loadSdlCommandCatalog,
	loadSelectedSdlCommand,
	type ExtensionCommandCandidate,
	type SelectedSdlCommandLoadResult,
	type SdlCommandCatalog,
} from "../extensions/registry.ts";
import type {
	RenderCapabilities,
	SdlCommand,
	SdlConfirmPrompt,
	SdlExtensionApi,
	SdlOutputStream,
} from "../sdk/index.ts";
import {
	commandDisplayName,
	commandKey,
	commandLeafName,
	commandPathMatches,
	commandSegments,
	executeSdlCommand,
	formatUnknownError,
	listStaticSdlCommandInfos,
	validateSdlClinkrExit,
	type SdlCommandInfo,
	type SdlCommandCliInfo,
	type SdlCommandPath,
} from "../extensions/command-registry.ts";

export type { SdlCliContext } from "./context.ts";
export type { SdlCommandInfo } from "../extensions/command-registry.ts";

interface SdlCliExtensionRegistryDeps {
	loadCommandCatalog?: (options: { cwd: string; homeDir?: string }) => Promise<SdlCommandCatalog>;
	loadSelectedCommand?: (
		candidate: ExtensionCommandCandidate,
	) => Promise<SelectedSdlCommandLoadResult>;
}

export interface SdlCliDeps extends Pick<CliEntrypointDeps, "cwd" | "env" | "stdout" | "stderr"> {
	context?: SdlExtensionApi;
	homeDir?: string;
	onOutput?: (stream: SdlOutputStream, text: string) => void;
	confirm?: SdlConfirmPrompt;
	extensionRegistry?: SdlCliExtensionRegistryDeps;
}

export interface BuildSdlCliOptions {
	commandInfos?: readonly SdlCommandCliInfo[];
	selectedCommand?: SdlCommand;
	selectedCommandPath?: SdlCommandPath;
}

interface SdlCliBuildState {
	commandInfos: readonly SdlCommandCliInfo[];
	selectedCommand?: SdlCommand;
	selectedCommandPath?: SdlCommandPath;
}

const entry = defineCli<SdlCliContext, SdlCliDeps, SdlCliBuildState>({
	metaUrl: new URL("../cli.ts", import.meta.url).href,
	runtime: "typescript",
	description: "Source Development Lifecycle tools.",
	prepareRun: async ({ args, deps, cwd, env, stdout, stderr, io }) => {
		const injectedContext = deps.context;
		const resolvedStdout = deps.stdout ?? injectedContext?.stdout ?? stdout;
		const resolvedStderr = deps.stderr ?? injectedContext?.stderr ?? stderr;
		const resolvedCwd = deps.cwd ?? injectedContext?.cwd ?? cwd;
		const resolvedEnv = deps.env ?? injectedContext?.env ?? env;
		const homeDir = deps.homeDir ?? resolvedEnv.HOME;
		const commandCatalog = await (
			deps.extensionRegistry?.loadCommandCatalog ?? loadSdlCommandCatalog
		)({
			cwd: resolvedCwd,
			...optionalEntry("homeDir", homeDir),
		});
		if (isCompletionResolverInvocation(args)) {
			return await handleCompletionResolverInvocation({
				args,
				commandCatalog,
				cwd: resolvedCwd,
				env: resolvedEnv,
				stdout: resolvedStdout,
				stderr: resolvedStderr,
				...optionalEntries({
					loadSelectedCommand: deps.extensionRegistry?.loadSelectedCommand,
					injectedContext,
					onOutput: deps.onOutput,
					confirm: deps.confirm,
					caps: io.caps,
				}),
			});
		}
		const isCompletionScriptRequest = isCompletionScriptInvocation(args);
		const selectedCommandKey = isCompletionScriptRequest
			? undefined
			: requestedCommandKey(args, commandCatalog.commandInfos);
		const selectedCandidate =
			selectedCommandKey === undefined
				? undefined
				: commandCatalog.candidates.get(selectedCommandKey);
		const diagnosticClassification = classifyExtensionDiagnosticsForInvocation({
			diagnostics: commandCatalog.diagnostics,
			requestedCommandName: selectedCommandKey,
			selectedCandidate,
		});
		if (!isCompletionScriptRequest && diagnosticClassification.fatal.length > 0) {
			resolvedStderr(`${formatExtensionErrorDiagnostics(diagnosticClassification.fatal)}\n`);
			return { type: "handled", exitCode: 2 };
		}

		let commandInfos = commandCatalog.commandInfos;
		let listingDiagnostics: typeof diagnosticClassification.warnings = [];
		if (
			!isCompletionScriptRequest &&
			selectedCommandKey === undefined &&
			!isStaticTopLevelMetadataRequest(args)
		) {
			const loadedListing = await loadListingCommandInfos(commandCatalog);
			commandInfos = loadedListing.commandInfos;
			listingDiagnostics = loadedListing.diagnostics;
		}
		const warnings = isCompletionScriptRequest
			? []
			: [...diagnosticClassification.warnings, ...listingDiagnostics];
		if (warnings.length > 0) {
			resolvedStderr(`${formatExtensionWarningDiagnostics(warnings)}\n`);
		}

		const selectedCommandResolution = await resolveSelectedSdlCommand({
			candidate: selectedCandidate,
			commandInfos,
			...optionalEntry("loadSelectedCommand", deps.extensionRegistry?.loadSelectedCommand),
			stderr: resolvedStderr,
			failureExitCode: 2,
		});
		if (!selectedCommandResolution.ok) return selectedCommandResolution.handled;

		const contextWithIO = await buildSdlCliContext({
			args,
			cwd: resolvedCwd,
			env: resolvedEnv,
			stdout: resolvedStdout,
			stderr: resolvedStderr,
			...optionalEntries({
				injectedContext,
				onOutput: deps.onOutput,
				confirm: deps.confirm,
				caps: io.caps,
			}),
		});
		return {
			type: "run",
			context: contextWithIO,
			buildState: selectedCommandResolution.resolution,
		};
	},
	configureCli: ({ root, buildState }) => {
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
				...(selectedCommand?.options === undefined ? {} : { options: selectedCommand.options }),
				...(selectedCommand?.completionProvider === undefined
					? {}
					: {
							completionProvider: (ctx: SdlCliContext, request: ClinkrDynamicCompletionRequest) =>
								selectedCommand.completionProvider?.(ctx.context, request) ?? [],
						}),
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
		root.group(buildSdlShellGroup());
		root.group(buildSdlCompletionGroup());
	},
});

export function buildCli(options: BuildSdlCliOptions = {}): ClinkrGroup<SdlCliContext> {
	return entry.buildCli({
		commandInfos: options.commandInfos ?? listStaticSdlCommandInfos(),
		...optionalEntries({
			selectedCommand: options.selectedCommand,
			selectedCommandPath: options.selectedCommandPath,
		}),
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

async function handleCompletionResolverInvocation(options: {
	args: readonly string[];
	commandCatalog: SdlCommandCatalog;
	loadSelectedCommand?: (
		candidate: ExtensionCommandCandidate,
	) => Promise<SelectedSdlCommandLoadResult>;
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	injectedContext?: SdlExtensionApi;
	onOutput?: (stream: SdlOutputStream, text: string) => void;
	confirm?: SdlConfirmPrompt;
	caps?: Caps;
}): Promise<{ type: "handled"; exitCode: number }> {
	const words = completionResolverWords(options.args);
	const selectedCommandKey = requestedCommandKey(words, options.commandCatalog.commandInfos);
	const selectedCandidate =
		selectedCommandKey === undefined
			? undefined
			: options.commandCatalog.candidates.get(selectedCommandKey);
	const selectedCommandResolution = await resolveSelectedSdlCommand({
		candidate: selectedCandidate,
		commandInfos: options.commandCatalog.commandInfos,
		...optionalEntry("loadSelectedCommand", options.loadSelectedCommand),
		stderr: options.stderr,
		failureExitCode: 0,
	});
	if (!selectedCommandResolution.ok) return selectedCommandResolution.handled;
	const context = await buildSdlCliContext({
		args: options.args,
		cwd: options.cwd,
		env: options.env,
		stdout: options.stdout,
		stderr: options.stderr,
		...optionalEntries({
			injectedContext: options.injectedContext,
			onOutput: options.onOutput,
			confirm: options.confirm,
			caps: options.caps,
		}),
	});
	const candidates = await buildCli(selectedCommandResolution.resolution).completeAsync(
		{ words },
		{
			context,
			onDynamicCompletionError: (error) => {
				options.stderr(`completion provider failed: ${formatUnknownError(error)}\n`);
			},
		},
	);
	options.stdout(renderCompletionCandidatesNewline(candidates));
	return { type: "handled", exitCode: 0 };
}

async function resolveSelectedSdlCommand(options: {
	candidate: ExtensionCommandCandidate | undefined;
	commandInfos: readonly SdlCommandCliInfo[];
	loadSelectedCommand?: (
		candidate: ExtensionCommandCandidate,
	) => Promise<SelectedSdlCommandLoadResult>;
	stderr: (text: string) => void;
	failureExitCode: number;
}): Promise<
	| { ok: true; resolution: SdlCliBuildState }
	| { ok: false; handled: { type: "handled"; exitCode: number } }
> {
	const selectedCommandLoader = options.loadSelectedCommand ?? loadSelectedSdlCommand;
	const loadedSelectedCommand =
		options.candidate === undefined ? undefined : await selectedCommandLoader(options.candidate);
	if (loadedSelectedCommand !== undefined && !loadedSelectedCommand.ok) {
		options.stderr(`${formatExtensionErrorDiagnostics([loadedSelectedCommand.diagnostic])}\n`);
		return { ok: false, handled: { type: "handled", exitCode: options.failureExitCode } };
	}
	const selectedCommand = loadedSelectedCommand?.command;
	const selectedSource = loadedSelectedCommand?.source;
	const selectedPath = loadedSelectedCommand?.path;
	const commandInfos = commandInfosForSelectedCommand(
		options.commandInfos,
		selectedCommand === undefined || selectedSource === undefined || selectedPath === undefined
			? undefined
			: { command: selectedCommand, source: selectedSource, path: selectedPath },
	);
	return {
		ok: true,
		resolution: {
			commandInfos,
			...optionalEntries({ selectedCommand, selectedCommandPath: selectedPath }),
		},
	};
}

async function buildSdlCliContext(options: {
	args: readonly string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	injectedContext?: SdlExtensionApi;
	onOutput?: (stream: SdlOutputStream, text: string) => void;
	confirm?: SdlConfirmPrompt;
	caps?: Caps;
}): Promise<SdlCliContext> {
	const baseContext =
		options.injectedContext ?? createRealSdlCommandContext({ cwd: options.cwd, env: options.env });
	const onOutput = options.onOutput ?? baseContext.onOutput;
	const confirm = options.confirm ?? baseContext.confirm;
	const stdin = baseContext.stdin ?? readStdin;
	const renderCapabilities: RenderCapabilities = renderCapabilitiesForTerminal(options.caps);
	const contextExtensions = baseContext.extensions;
	const commandIo = createCliCommandIo({
		stdout: options.stdout,
		stderr: options.stderr,
		...optionalEntry("onOutput", onOutput),
	});
	const context: SdlExtensionApi = {
		cwd: options.cwd,
		env: options.env,
		textGenerator: baseContext.textGenerator,
		commandIo,
		progress: noopSdlProgress,
		renderCapabilities,
		outputFormat: clinkrFormatFromArgs(options.args),
		exec: baseContext.exec.bind(baseContext),
		stdout: options.stdout,
		stderr: options.stderr,
		stdin,
		...optionalEntries({ onOutput, confirm, extensions: contextExtensions }),
	};
	const slotContext = await createRealSlotContext({
		cwd: options.cwd,
		env: options.env,
		stderr: options.stderr,
		...optionalEntry("extensions", contextExtensions),
		renderCapabilities,
		shouldWriteCdDirective: isClinkrHumanOutputInvocation(options.args),
	});
	return {
		...slotContext,
		context,
		cwd: options.cwd,
		env: options.env,
		stdout: options.stdout,
		stderr: options.stderr,
	};
}

function isCompletionResolverInvocation(args: readonly string[]): boolean {
	return args[0] === "completion" && args[1] === SDL_EXEC_GROUP_NAME && args[2] === "resolve";
}

function isCompletionScriptInvocation(args: readonly string[]): boolean {
	return args[0] === "completion" && ["bash", "zsh", "fish"].includes(args[1] ?? "");
}

function completionResolverWords(args: readonly string[]): readonly string[] {
	const resolverArgs = args.slice(3);
	if (resolverArgs[0] !== "--") return resolverArgs;
	return resolverArgs.slice(1);
}

function requestedCommandKey(
	args: readonly string[],
	commandInfos: readonly SdlCommandCliInfo[],
): string | undefined {
	const commandArgs = args.filter((arg) => !arg.startsWith("-"));
	if (commandArgs.length === 0) return undefined;

	const candidates = commandInfos
		.map((commandInfo) => ({
			commandInfo,
			displaySegments: displaySegmentsForCommand(commandInfo),
		}))
		.filter(({ displaySegments }) => pathPrefixMatches(commandArgs, displaySegments))
		.sort((left, right) => right.displaySegments.length - left.displaySegments.length);
	const selected = candidates[0];
	if (selected === undefined) return commandArgs[0];
	if (commandArgs.length < selected.displaySegments.length) return undefined;
	return commandKey(selected.commandInfo);
}

const SDL_EXEC_GROUP_NAME = "exec";
const SDL_BUILT_IN_HELP_GROUP = "Built-in Commands:";
const SDL_EXTENSION_HELP_GROUP = "Extensions:";
// Dynamic SDL extensions are one group deep today. A grouped command named
// `exec-<name>` is mounted as hidden `ji <group> exec <name>` so agent-only
// operations keep the same nested exec contract as first-party Clinkr groups.
const SDL_EXEC_COMMAND_PREFIX = "exec-";

function isGroupedExecCommand(commandInfo: SdlCommandCliInfo): boolean {
	return commandInfo.group !== undefined && commandInfo.name.startsWith(SDL_EXEC_COMMAND_PREFIX);
}

function cliLeafCommandName(commandInfo: SdlCommandCliInfo): string {
	if (commandInfo.segments !== undefined) return commandLeafName(commandInfo);
	if (!isGroupedExecCommand(commandInfo)) return commandInfo.name;
	return commandInfo.name.slice(SDL_EXEC_COMMAND_PREFIX.length);
}

function buildSdlCompletionGroup(): ClinkrGroup<SdlCliContext> {
	const completion = new ClinkrGroup<SdlCliContext>({
		name: "completion",
		description: "Print shell completion setup scripts.",
		helpGroup: SDL_BUILT_IN_HELP_GROUP,
	});
	for (const shell of ["bash", "zsh", "fish"] as const) {
		completion.command({
			name: shell,
			description: `Print ${shell} completion setup for ji.`,
			schema: z.object({}),
			resultSchema: sdlCompletionScriptResultSchema,
			handler: async () => ok(buildSdlCompletionScript(shell)),
			renderHuman: renderSdlCompletionScriptResult,
		});
	}
	const exec = new ClinkrGroup<SdlCliContext>({
		name: SDL_EXEC_GROUP_NAME,
		description: "Shell completion resolver operations.",
		isHidden: true,
	});
	exec.command(
		rawCommand({
			name: "resolve",
			description: "Resolve newline-delimited shell completion candidates.",
			schema: z.object({ words: z.array(z.string()).default([]) }),
			positionals: { words: { position: 0 } },
			run: async () => 0,
		}),
	);
	completion.group(exec);
	return completion;
}

function displaySegmentsForCommand(commandInfo: SdlCommandCliInfo): readonly string[] {
	if (commandInfo.segments !== undefined) return commandInfo.segments;
	if (!isGroupedExecCommand(commandInfo)) return commandSegments(commandInfo);
	return [commandInfo.group ?? "", SDL_EXEC_GROUP_NAME, cliLeafCommandName(commandInfo)].filter(
		(segment) => segment !== "",
	);
}

function pathPrefixMatches(args: readonly string[], path: readonly string[]): boolean {
	return path.every((segment, index) => args[index] === segment);
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
		helpGroup: SDL_BUILT_IN_HELP_GROUP,
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
		schema: sdlShellInstallRequestSchema,
		options: { shell: { short: "-s" }, yes: { short: "-y" } },
		resultSchema: sdlShellInstallResultSchema,
		handler: runSdlShellInstall,
		renderHuman: renderSdlShellInstall,
	});
	return shell;
}

function withShellOption<T>(spec: ShellCommandSpec<T>): ShellCommandSpec<T> {
	return {
		...spec,
		options: { shell: { short: "-s" }, ...(spec.options ?? {}) },
	};
}

function groupForCommand(
	root: ClinkrGroup<SdlCliContext>,
	groupCache: Map<string, ClinkrGroup<SdlCliContext>>,
	commandInfo: SdlCommandCliInfo,
): ClinkrGroup<SdlCliContext> {
	const displaySegments = displaySegmentsForCommand(commandInfo);
	const parentSegments = displaySegments.slice(0, -1);
	let parent = root;
	for (let index = 0; index < parentSegments.length; index += 1) {
		const segment = parentSegments[index];
		if (segment === undefined) continue;
		const groupKey = parentSegments.slice(0, index + 1).join("/");
		const existing = groupCache.get(groupKey);
		if (existing !== undefined) {
			parent = existing;
			continue;
		}
		const group = new ClinkrGroup<SdlCliContext>({
			name: segment,
			description: groupDescription(parentSegments.slice(0, index + 1), commandInfo),
			...(index === 0 ? { helpGroup: SDL_EXTENSION_HELP_GROUP } : {}),
			...(segment === SDL_EXEC_GROUP_NAME && isGroupedExecCommand(commandInfo)
				? { isHidden: true }
				: {}),
		});
		groupCache.set(groupKey, group);
		parent.group(group);
		parent = group;
	}
	return parent;
}

function groupDescription(segments: readonly string[], commandInfo: SdlCommandCliInfo): string {
	if (segments.at(-1) === SDL_EXEC_GROUP_NAME && isGroupedExecCommand(commandInfo)) {
		return `Skill-invoked SDL ${segments[0] ?? "extension"} operations.`;
	}
	if (segments.length === 1 && commandInfo.groupDescription !== undefined) {
		return commandInfo.groupDescription;
	}
	return `SDL ${segments.join(" ")} commands.`;
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
