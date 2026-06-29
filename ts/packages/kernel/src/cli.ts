#!/usr/bin/env node

import { z } from "zod";

import {
	CLINKR_CAPS_EXTENSION_KEY,
	ClinkrGroup,
	isClinkrHumanOutputInvocation,
	ok,
	type Caps,
	type ClinkrCommandSpec,
	type ClinkrDynamicCompletionRequest,
} from "@sdl/clinkr";
import { renderCompletionCandidatesNewline } from "@sdl/clinkr/completion";
import { rawCommand } from "@sdl/clinkr/raw";
import { defineCli } from "@sdl/core/cli-entry";
import { readStdin } from "@sdl/core/stdin";
import { buildSlotCommandGroup } from "@sdl/slot/command-face";
import { createRealSlotContext, type SlotCliContext } from "@sdl/slot";

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
	type SdlCommandCatalog,
} from "./extension-registry.ts";
import type { SdlCommand, SdlConfirmPrompt, SdlExtensionApi, SdlOutputStream } from "sdl-sdk";
import {
	buildSdlCompletionScript,
	renderSdlCompletionScriptResult,
	sdlCompletionScriptResultSchema,
} from "./operations/completion.ts";
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
		if (isCompletionResolverInvocation(args)) {
			return await handleCompletionResolverInvocation({
				args,
				commandCatalog,
				cwd: resolvedCwd,
				env: resolvedEnv,
				stdout: resolvedStdout,
				stderr: resolvedStderr,
				injectedContext,
				onOutput: deps.onOutput,
				confirm: deps.confirm,
				caps: io.caps,
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

		const contextWithIO = await buildSdlCliContext({
			args,
			cwd: resolvedCwd,
			env: resolvedEnv,
			stdout: resolvedStdout,
			stderr: resolvedStderr,
			injectedContext,
			onOutput: deps.onOutput,
			confirm: deps.confirm,
			caps: io.caps,
		});
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
		root.group(buildSdlCompletionGroup());
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

async function handleCompletionResolverInvocation(options: {
	args: readonly string[];
	commandCatalog: SdlCommandCatalog;
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	injectedContext?: SdlExtensionApi | undefined;
	onOutput?: ((stream: SdlOutputStream, text: string) => void) | undefined;
	confirm?: SdlConfirmPrompt | undefined;
	caps?: Caps | undefined;
}): Promise<{ type: "handled"; exitCode: number }> {
	const words = completionResolverWords(options.args);
	const selectedCommandKey = requestedCompletedCommandKey(
		words,
		options.commandCatalog.commandInfos,
	);
	const selectedCandidate =
		selectedCommandKey === undefined
			? undefined
			: options.commandCatalog.candidates.get(selectedCommandKey);
	const loadedSelectedCommand =
		selectedCandidate === undefined ? undefined : await loadSelectedSdlCommand(selectedCandidate);
	if (loadedSelectedCommand !== undefined && !loadedSelectedCommand.ok) {
		options.stderr(`${formatExtensionErrorDiagnostics([loadedSelectedCommand.diagnostic])}\n`);
		return { type: "handled", exitCode: 0 };
	}
	const selectedCommand = loadedSelectedCommand?.command;
	const selectedSource = loadedSelectedCommand?.source;
	const selectedPath = loadedSelectedCommand?.path;
	const commandInfos = commandInfosForSelectedCommand(
		options.commandCatalog.commandInfos,
		selectedCommand === undefined || selectedSource === undefined || selectedPath === undefined
			? undefined
			: { command: selectedCommand, source: selectedSource, path: selectedPath },
	);
	const context = await buildSdlCliContext({
		args: options.args,
		cwd: options.cwd,
		env: options.env,
		stdout: options.stdout,
		stderr: options.stderr,
		injectedContext: options.injectedContext,
		onOutput: options.onOutput,
		confirm: options.confirm,
		caps: options.caps,
	});
	const candidates = await buildCli({
		commandInfos,
		...(selectedCommand === undefined ? {} : { selectedCommand }),
		...(selectedPath === undefined ? {} : { selectedCommandPath: selectedPath }),
	}).completeAsync(
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

async function buildSdlCliContext(options: {
	args: readonly string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	injectedContext?: SdlExtensionApi | undefined;
	onOutput?: ((stream: SdlOutputStream, text: string) => void) | undefined;
	confirm?: SdlConfirmPrompt | undefined;
	caps?: Caps | undefined;
}): Promise<SdlCliContext> {
	const baseContext =
		options.injectedContext ?? createRealSdlCommandContext({ cwd: options.cwd, env: options.env });
	const onOutput = options.onOutput ?? baseContext.onOutput;
	const confirm = options.confirm ?? baseContext.confirm;
	const stdin = baseContext.stdin ?? readStdin;
	const contextExtensions = {
		...(baseContext.extensions ?? {}),
		...(options.caps === undefined ? {} : { [CLINKR_CAPS_EXTENSION_KEY]: options.caps }),
	};
	const context: SdlExtensionApi = {
		cwd: options.cwd,
		env: options.env,
		textGenerator: baseContext.textGenerator,
		exec: baseContext.exec.bind(baseContext),
		stdout: options.stdout,
		stderr: options.stderr,
		stdin,
		...(onOutput === undefined ? {} : { onOutput }),
		...(confirm === undefined ? {} : { confirm }),
		extensions: contextExtensions,
	};
	const slotContext = await createRealSlotContext({
		cwd: options.cwd,
		env: options.env,
		...(options.caps === undefined ? {} : { caps: options.caps }),
	});
	return {
		...slotContext,
		context,
		cwd: options.cwd,
		env: options.env,
		stdout: options.stdout,
		stderr: options.stderr,
		interaction: slotContext.interaction,
		shouldWriteCdDirective: isClinkrHumanOutputInvocation(options.args),
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

function requestedCompletedCommandKey(
	words: readonly string[],
	commandInfos: readonly SdlCommandCliInfo[],
): string | undefined {
	const firstWord = words[0];
	if (firstWord === undefined || firstWord === "" || firstWord.startsWith("-")) return undefined;
	const directCommand = commandInfos.find(
		(commandInfo) => commandInfo.group === undefined && commandInfo.name === firstWord,
	);
	if (directCommand !== undefined) return directCommand.name;

	const groupedCommands = commandInfos.filter((commandInfo) => commandInfo.group === firstWord);
	if (groupedCommands.length === 0) return undefined;
	const secondWord = words[1];
	if (secondWord === undefined || secondWord === "" || secondWord.startsWith("-")) return undefined;
	if (secondWord === SDL_EXEC_GROUP_NAME) {
		const execCommand = words[2];
		if (execCommand === undefined || execCommand === "" || execCommand.startsWith("-")) {
			return undefined;
		}
		const key = commandKey({ group: firstWord, name: execInternalCommandName(execCommand) });
		return optionsIncludesCommandKey(groupedCommands, key) ? key : undefined;
	}
	const key = commandKey({ group: firstWord, name: secondWord });
	return optionsIncludesCommandKey(groupedCommands, key) ? key : undefined;
}

function optionsIncludesCommandKey(
	commandInfos: readonly SdlCommandCliInfo[],
	key: string,
): boolean {
	return commandInfos.some((commandInfo) => commandKey(commandInfo) === key);
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
// Dynamic SDL extensions are one group deep today. A grouped command named
// `exec-<name>` is mounted as hidden `sdl <group> exec <name>` so agent-only
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

function execInternalCommandName(displayName: string): string {
	return `${SDL_EXEC_COMMAND_PREFIX}${displayName}`;
}

function buildSdlCompletionGroup(): ClinkrGroup<SdlCliContext> {
	const completion = new ClinkrGroup<SdlCliContext>({
		name: "completion",
		description: "Print shell completion setup scripts.",
	});
	for (const shell of ["bash", "zsh", "fish"] as const) {
		completion.command({
			name: shell,
			description: `Print ${shell} completion setup for sdl.`,
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
		options: { shell: {}, yes: { short: "-y" } },
		resultSchema: sdlShellInstallResultSchema,
		handler: runSdlShellInstall,
		renderHuman: renderSdlShellInstall,
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
