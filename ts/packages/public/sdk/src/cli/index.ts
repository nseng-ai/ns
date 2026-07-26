#!/usr/bin/env node

import { z } from "zod";

import {
	ClinkrGroup,
	clinkrFormatFromArgs,
	clinkrNameMatchesAutomaticAlias,
	emitExit,
	failure,
	ok,
	type ClinkrApp,
	type ClinkrCommandSpec,
	type ClinkrDynamicCompletionRequest,
	type ClinkrIo,
} from "@nseng-ai/clinkr";
import { renderCompletionCandidatesNewline } from "@nseng-ai/clinkr/completion";
import { rawCommand } from "@nseng-ai/clinkr/raw";
import {
	defineCli,
	readStdin,
	type CliEntrypointDeps,
	type DefineCliOptions,
} from "@nseng-ai/foundation/cli-runtime";
import { optionalEntries, optionalEntry, resolveHomeDir } from "@nseng-ai/foundation/primitives";

import {
	buildNsCompletionScript,
	renderNsCompletionScriptResult,
	nsCompletionScriptResultSchema,
} from "./completion.ts";
import { createNsCliInteraction, type NsCliBaseContext, type NsCliContext } from "./context.ts";
import {
	renderNsShellInstall,
	renderNsShellShow,
	runNsShellInstall,
	runNsShellShow,
	nsShellInstallRequestSchema,
	nsShellInstallResultSchema,
	nsShellShowRequestSchema,
	nsShellShowResultSchema,
} from "./shell.ts";
import { createCliCommandIo, noopNsProgress } from "../runtime/command-io.ts";
import {
	classifyExtensionDiagnosticsForInvocation,
	commandInfosForSelectedCommand,
	formatExtensionErrorDiagnostics,
	formatExtensionWarningDiagnostics,
	loadListingCommandInfos,
	loadNsCommandCatalog,
	loadSelectedNsCommand,
	type ExtensionCommandCandidate,
	type LoadNsCommandCatalogOptions,
	type PreinstalledNsCommandCatalogLoader,
	type SelectedNsCommandLoadResult,
	type NsCommandCatalog,
} from "../extensions/registry.ts";
import type {
	RenderCapabilities,
	DescriptorCommand,
	NsConfirmPrompt,
	NsExtensionApi,
	NsOutputStream,
	NsProgressPhaseListener,
} from "../sdk/index.ts";
import {
	commandDisplayName,
	commandKey,
	commandLeafName,
	commandPathMatches,
	commandSegments,
	listStaticNsCommandInfos,
	type NsCommandInfo,
	type NsCommandCliInfo,
	type NsCommandPath,
} from "../extensions/command-registry.ts";
import type { NsCommand, RawArgvCommand } from "../sdk/command.ts";
import {
	NS_BUILT_IN_HELP_GROUP,
	NS_EXTENSION_HELP_GROUP,
} from "../extensions/help-presentation.ts";

export type { NsCliBaseContext, NsCliContext } from "./context.ts";
export type { NsCommandInfo } from "../extensions/command-registry.ts";
export type {
	PreinstalledNsCommandCatalog,
	PreinstalledNsCommandCatalogEntry,
	PreinstalledNsCommandCatalogLoader,
} from "../extensions/registry.ts";
export {
	extensionDescriptorToPreinstalledCatalog,
	preinstalledNsCommandCatalogFromRegistrations,
} from "../extensions/descriptor-catalog.ts";
export type { PreinstalledNsExtensionRegistration } from "../extensions/descriptor-catalog.ts";

interface NsCliExtensionRegistryDeps {
	loadCommandCatalog?: (options: LoadNsCommandCatalogOptions) => Promise<NsCommandCatalog>;
	loadSelectedCommand?: (
		candidate: ExtensionCommandCandidate,
	) => Promise<SelectedNsCommandLoadResult>;
}

export interface NsCliDeps extends Pick<
	CliEntrypointDeps,
	"cwd" | "env" | "stdout" | "stderr" | "renderCapabilities"
> {
	context: NsCliBaseContext;
	entryMetaUrl?: string;
	homeDir?: string;
	onOutput?: (stream: NsOutputStream, text: string) => void;
	onProgress?: NsProgressPhaseListener;
	confirm?: NsConfirmPrompt;
	preinstalledCommandCatalog?: PreinstalledNsCommandCatalogLoader;
	extensionRegistry?: NsCliExtensionRegistryDeps;
}

export interface BuildNsCliOptions {
	commandInfos?: readonly NsCommandCliInfo[];
	selectedCommand?: DescriptorCommand;
	selectedCommandPath?: NsCommandPath;
}

interface NsCliBuildState {
	commandInfos: readonly NsCommandCliInfo[];
	selectedCommand?: DescriptorCommand;
	selectedCommandPath?: NsCommandPath;
}

interface NsCliCommandContextInput {
	cwd: string;
	env: Record<string, string | undefined>;
	/** Compatibility value exposed to command contexts until the SDK field is retired. */
	homeDir?: string;
}

interface NsCliRawContextInputs {
	deps: Partial<NsCliDeps>;
	injectedContext?: NsCliBaseContext;
	cwd: string;
	env: Record<string, string | undefined>;
}

function resolveNsCliCommandContextInput(options: NsCliRawContextInputs): NsCliCommandContextInput {
	const cwd = options.deps.cwd ?? options.injectedContext?.cwd ?? options.cwd;
	const env = options.deps.env ?? options.injectedContext?.env ?? options.env;
	const homeDir = resolveHomeDir(options.deps.homeDir, env) ?? options.injectedContext?.homeDir;
	return { cwd, env, ...optionalEntry("homeDir", homeDir) };
}

const entryOptions: DefineCliOptions<NsCliContext, NsCliDeps, NsCliBuildState> = {
	metaUrl: new URL("../cli.ts", import.meta.url).href,
	runtime: "typescript",
	name: "ns",
	description: "ns tools.",
	prepareRun: async ({ args, deps, cwd, env, stdout, stderr, io }) => {
		const injectedContext = deps.context;
		const resolvedStdout = deps.stdout ?? injectedContext?.stdout ?? stdout;
		const resolvedStderr = deps.stderr ?? injectedContext?.stderr ?? stderr;
		const renderCapabilities: RenderCapabilities = {
			canEmitAnsi: io.canEmitAnsi === true,
			...optionalEntry("caps", io.caps),
		};
		const commandContext = resolveNsCliCommandContextInput({
			deps,
			...(injectedContext === undefined ? {} : { injectedContext }),
			cwd,
			env,
		});
		const commandCatalog = await (
			deps.extensionRegistry?.loadCommandCatalog ?? loadNsCommandCatalog
		)({
			cwd: commandContext.cwd,
			env: commandContext.env,
			...optionalEntry("xdgHomeDir", commandContext.homeDir),
			...optionalEntry("preinstalledCommandCatalog", deps.preinstalledCommandCatalog),
		});
		if (isCompletionResolverInvocation(args)) {
			return await handleCompletionResolverInvocation({
				args,
				commandCatalog,
				commandContext,
				stdout: resolvedStdout,
				stderr: resolvedStderr,
				renderCapabilities,
				...optionalEntries({
					loadSelectedCommand: deps.extensionRegistry?.loadSelectedCommand,
					injectedContext,
					onOutput: deps.onOutput,
					onProgress: deps.onProgress,
					confirm: deps.confirm,
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
		const requestedGroup =
			selectedCommandKey === undefined
				? requestedGroupSegments(args, commandCatalog.commandInfos)
				: undefined;
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
			const loadedListing = await loadListingCommandInfos(commandCatalog, {
				...optionalEntry("groupSegments", requestedGroup),
			});
			commandInfos = loadedListing.commandInfos;
			listingDiagnostics = loadedListing.diagnostics;
		}
		const warnings = isCompletionScriptRequest
			? []
			: [...diagnosticClassification.warnings, ...listingDiagnostics];
		if (warnings.length > 0) {
			resolvedStderr(`${formatExtensionWarningDiagnostics(warnings)}\n`);
		}

		const selectedCommandResolution = await resolveSelectedNsCommand({
			candidate: selectedCandidate,
			commandInfos,
			...optionalEntry("loadSelectedCommand", deps.extensionRegistry?.loadSelectedCommand),
			stderr: resolvedStderr,
			failureExitCode: 2,
		});
		if (!selectedCommandResolution.ok) return selectedCommandResolution.handled;

		const contextWithIO = await buildNsCliContext({
			args,
			commandContext,
			extensionPackageNames: commandCatalog.extensionPackageNames,
			stdout: resolvedStdout,
			stderr: resolvedStderr,
			renderCapabilities,
			...optionalEntries({
				injectedContext,
				onOutput: deps.onOutput,
				onProgress: deps.onProgress,
				confirm: deps.confirm,
			}),
		});
		return {
			type: "run",
			context: contextWithIO,
			buildState: selectedCommandResolution.resolution,
		};
	},
	buildCli: ({ appBuilder, description, version, runtimeInfo, buildState }) => {
		const root = new ClinkrGroup<NsCliContext>({
			name: "ns",
			description,
			version,
			runtimeInfo,
		});
		const groups = new Map<string, ClinkrGroup<NsCliContext>>();
		const topLevelHelpGroups = resolveTopLevelHelpGroups(buildState.commandInfos);
		for (const commandInfo of buildState.commandInfos) {
			const parent = groupForCommand(root, groups, commandInfo, topLevelHelpGroups);
			const topLevelSegment = commandSegments(commandInfo)[0];
			const helpGroup =
				topLevelSegment === undefined
					? NS_EXTENSION_HELP_GROUP
					: (topLevelHelpGroups.get(topLevelSegment) ?? NS_EXTENSION_HELP_GROUP);
			const selectedCommand =
				buildState.selectedCommandPath !== undefined &&
				commandPathMatches(buildState.selectedCommandPath, commandInfo)
					? buildState.selectedCommand
					: undefined;
			const command =
				selectedCommand === undefined ||
				buildState.selectedCommandPath === undefined ||
				!commandPathMatches(buildState.selectedCommandPath, commandInfo)
					? undefined
					: selectedCommand;
			if (command !== undefined && isNsCommand(command)) {
				const { completionProvider, ...commandSpec } = command;
				parent.command({
					...commandSpec,
					name: commandLeafName(commandInfo),
					description: commandInfo.fullDescription,
					summary: commandInfo.description,
					...(completionProvider === undefined
						? {}
						: {
								completionProvider: (ctx: NsCliContext, request: ClinkrDynamicCompletionRequest) =>
									completionProvider(ctx.context, request),
							}),
					helpGroup,
					handler: async (ctx, request) => await command.handler(ctx.context, request),
				});
				continue;
			}
			parent.command(
				rawCommand({
					name: commandLeafName(commandInfo),
					description: commandInfo.fullDescription,
					summary: commandInfo.description,
					...(command === undefined
						? { schema: placeholderSchema }
						: {
								schema: passthroughSchema,
								positionals: { argv: { position: 0 } },
								shouldPassThrough: true,
							}),
					...optionalEntries({ helpGroup }),
					...(command === undefined || !isRawArgvCommand(command) || command.complete === undefined
						? {}
						: {
								completionProvider: (ctx: NsCliContext, request: ClinkrDynamicCompletionRequest) =>
									command.complete?.(ctx.context, request) ?? [],
							}),
					run: async (ctx, request) => {
						if (command === undefined) {
							const result = failure(
								"unknown-command",
								`Unknown ns command: ${commandDisplayName(commandInfo)}`,
								{ command: commandDisplayName(commandInfo) },
							);
							return emitExit(result, {
								format: ctx.context.outputFormat ?? "human",
								io: clinkrIo(ctx),
							});
						}
						if (!isRawArgvCommand(command)) {
							throw new Error(
								`ns: command ${command.name} was not registered as a rendered command`,
							);
						}
						const result = await command.run(ctx.context, {
							argv: passthroughSchema.parse(request).argv,
							commandPath: commandSegments(commandInfo),
						});
						return emitExit(result, {
							format: ctx.context.outputFormat ?? "human",
							io: clinkrIo(ctx),
						});
					},
				}),
			);
		}
		root.group(buildNsShellGroup());
		root.group(buildNsCompletionGroup());
		appBuilder.importLegacyClinkrGroupForMigration(root);
	},
};

const entry = defineCli(entryOptions);

export async function buildCli(options: BuildNsCliOptions = {}): Promise<ClinkrApp<NsCliContext>> {
	return await entry.buildCli({
		commandInfos: options.commandInfos ?? listStaticNsCommandInfos(),
		...optionalEntries({
			selectedCommand: options.selectedCommand,
			selectedCommandPath: options.selectedCommandPath,
		}),
	});
}

export function listNsCommands(): NsCommandInfo[] {
	return listStaticNsCommandInfos().map(({ group, name, description }) => ({
		...(group === undefined ? {} : { group }),
		name,
		description,
	}));
}

export async function runCli(args: readonly string[], deps: NsCliDeps): Promise<number> {
	if (deps.entryMetaUrl === undefined) return await entry.run(args, deps);
	return await defineCli({ ...entryOptions, metaUrl: deps.entryMetaUrl }).run(args, deps);
}

async function handleCompletionResolverInvocation(options: {
	args: readonly string[];
	commandCatalog: NsCommandCatalog;
	loadSelectedCommand?: (
		candidate: ExtensionCommandCandidate,
	) => Promise<SelectedNsCommandLoadResult>;
	commandContext: NsCliCommandContextInput;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	injectedContext?: NsCliBaseContext;
	onOutput?: (stream: NsOutputStream, text: string) => void;
	onProgress?: NsProgressPhaseListener;
	confirm?: NsConfirmPrompt;
	renderCapabilities: RenderCapabilities;
}): Promise<{ type: "handled"; exitCode: number }> {
	const words = completionResolverWords(options.args);
	const selectedCommandKey = requestedCommandKey(words, options.commandCatalog.commandInfos);
	const selectedCandidate =
		selectedCommandKey === undefined
			? undefined
			: options.commandCatalog.candidates.get(selectedCommandKey);
	const selectedCommandResolution = await resolveSelectedNsCommand({
		candidate: selectedCandidate,
		commandInfos: options.commandCatalog.commandInfos,
		...optionalEntry("loadSelectedCommand", options.loadSelectedCommand),
		stderr: options.stderr,
		failureExitCode: 0,
	});
	if (!selectedCommandResolution.ok) return selectedCommandResolution.handled;
	const context = await buildNsCliContext({
		args: options.args,
		commandContext: options.commandContext,
		extensionPackageNames: options.commandCatalog.extensionPackageNames,
		stdout: options.stdout,
		stderr: options.stderr,
		renderCapabilities: options.renderCapabilities,
		...optionalEntries({
			injectedContext: options.injectedContext,
			onOutput: options.onOutput,
			onProgress: options.onProgress,
			confirm: options.confirm,
		}),
	});
	const app = await buildCli(selectedCommandResolution.resolution);
	const candidates = await app.complete({ words }, { context });
	options.stdout(renderCompletionCandidatesNewline(candidates));
	return { type: "handled", exitCode: 0 };
}

async function resolveSelectedNsCommand(options: {
	candidate: ExtensionCommandCandidate | undefined;
	commandInfos: readonly NsCommandCliInfo[];
	loadSelectedCommand?: (
		candidate: ExtensionCommandCandidate,
	) => Promise<SelectedNsCommandLoadResult>;
	stderr: (text: string) => void;
	failureExitCode: number;
}): Promise<
	| { ok: true; resolution: NsCliBuildState }
	| { ok: false; handled: { type: "handled"; exitCode: number } }
> {
	const selectedCommandLoader = options.loadSelectedCommand ?? loadSelectedNsCommand;
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

async function buildNsCliContext(options: {
	args: readonly string[];
	commandContext: NsCliCommandContextInput;
	extensionPackageNames: ReadonlySet<string>;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	injectedContext?: NsCliBaseContext;
	onOutput?: (stream: NsOutputStream, text: string) => void;
	onProgress?: NsProgressPhaseListener;
	confirm?: NsConfirmPrompt;
	renderCapabilities: RenderCapabilities;
}): Promise<NsCliContext> {
	const baseContext = options.injectedContext;
	if (baseContext === undefined) {
		throw new Error("Ns CLI context is required.");
	}
	const onOutput = options.onOutput ?? baseContext.onOutput;
	const confirm = options.confirm ?? baseContext.confirm;
	const stdin = baseContext.stdin ?? readStdin;
	const contextExtensions = baseContext.extensions;
	const commandIo = createCliCommandIo({
		stdout: options.stdout,
		stderr: options.stderr,
		...optionalEntry("onOutput", onOutput),
	});
	const context: NsExtensionApi = {
		cwd: options.commandContext.cwd,
		env: options.commandContext.env,
		...optionalEntry("homeDir", options.commandContext.homeDir),
		textGenerator: baseContext.textGenerator,
		commandIo,
		progress:
			options.onProgress === undefined
				? noopNsProgress
				: { isLive: true, phase: options.onProgress },
		renderCapabilities: options.renderCapabilities,
		outputFormat: clinkrFormatFromArgs(options.args),
		exec: baseContext.exec.bind(baseContext),
		hasExtension: (packageName) => options.extensionPackageNames.has(packageName),
		stdout: options.stdout,
		stderr: options.stderr,
		stdin,
		...optionalEntries({ onOutput, confirm, extensions: contextExtensions }),
	};
	return {
		context,
		cwd: options.commandContext.cwd,
		env: options.commandContext.env,
		interaction: createNsCliInteraction({ stderr: options.stderr }),
		stdout: options.stdout,
		stderr: options.stderr,
	};
}

function clinkrIo(ctx: NsCliContext): ClinkrIo {
	return {
		stdout: ctx.stdout,
		stderr: ctx.stderr,
		canEmitAnsi: ctx.context.renderCapabilities.canEmitAnsi,
		...optionalEntry("caps", ctx.context.renderCapabilities.caps),
	};
}

function isCompletionResolverInvocation(args: readonly string[]): boolean {
	return args[0] === "completion" && args[1] === NS_EXEC_GROUP_NAME && args[2] === "resolve";
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
	commandInfos: readonly NsCommandCliInfo[],
): string | undefined {
	const commandArgs = commandPathArgs(args);
	if (commandArgs.length === 0) return undefined;

	const candidates = commandInfos
		.map((commandInfo) => ({
			commandInfo,
			displaySegments: commandSegments(commandInfo),
		}))
		.filter(({ displaySegments }) => pathPrefixMatches(commandArgs, displaySegments, commandInfos))
		.sort((left, right) => right.displaySegments.length - left.displaySegments.length);
	const selected = candidates[0];
	if (selected === undefined) return commandArgs[0];
	if (commandArgs.length < selected.displaySegments.length) return undefined;
	return commandKey(selected.commandInfo);
}

const passthroughSchema = z.object({ argv: z.array(z.string()).default([]) });
const placeholderSchema = z.object({});

function requestedGroupSegments(
	args: readonly string[],
	commandInfos: readonly NsCommandCliInfo[],
): readonly string[] | undefined {
	const commandArgs = commandPathArgs(args);
	if (commandArgs.length === 0) return undefined;
	const hasGroup = commandInfos.some((commandInfo) => {
		const segments = commandSegments(commandInfo);
		return (
			commandArgs.length < segments.length && pathPrefixMatches(commandArgs, segments, commandInfos)
		);
	});
	return hasGroup ? commandArgs : undefined;
}

function commandPathArgs(args: readonly string[]): readonly string[] {
	const firstOptionIndex = args.findIndex((arg) => arg.startsWith("-"));
	return firstOptionIndex === -1 ? args : args.slice(0, firstOptionIndex);
}

const NS_EXEC_GROUP_NAME = "exec";
export { NS_BUILT_IN_HELP_GROUP } from "../extensions/help-presentation.ts";

function buildNsCompletionGroup(): ClinkrGroup<NsCliContext> {
	const completion = new ClinkrGroup<NsCliContext>({
		name: "completion",
		description: "Print shell completion setup scripts.",
		helpGroup: NS_BUILT_IN_HELP_GROUP,
	});
	for (const shell of ["bash", "zsh", "fish"] as const) {
		completion.command({
			name: shell,
			description: `Print ${shell} completion setup for ns.`,
			schema: z.object({}),
			resultSchema: nsCompletionScriptResultSchema,
			handler: async () => ok(buildNsCompletionScript(shell)),
			renderHuman: renderNsCompletionScriptResult,
		});
	}
	const exec = new ClinkrGroup<NsCliContext>({
		name: NS_EXEC_GROUP_NAME,
		description: "Shell completion resolver operations.",
		isHidden: true,
	});
	exec.command(
		rawCommand({
			name: "resolve",
			description: "Resolve newline-delimited shell completion candidates.",
			run: async () => 0,
		}),
	);
	completion.group(exec);
	return completion;
}

function pathPrefixMatches(
	args: readonly string[],
	path: readonly string[],
	commandInfos: readonly NsCommandCliInfo[],
): boolean {
	const length = Math.min(args.length, path.length);
	return args
		.slice(0, length)
		.every((segment, index) =>
			pathSegmentMatches(path[index], segment, siblingNamesAtPath(commandInfos, path, index)),
		);
}

function pathSegmentMatches(
	pathSegment: string | undefined,
	argSegment: string,
	siblingNames: ReadonlySet<string>,
): boolean {
	return (
		pathSegment !== undefined &&
		clinkrNameMatchesAutomaticAlias(pathSegment, siblingNames, argSegment)
	);
}

function siblingNamesAtPath(
	commandInfos: readonly NsCommandCliInfo[],
	path: readonly string[],
	index: number,
): ReadonlySet<string> {
	const prefix = path.slice(0, index);
	return new Set(
		commandInfos
			.map((commandInfo) => commandSegments(commandInfo))
			.filter((segments) => pathPrefixEquals(segments, prefix) && segments[index] !== undefined)
			.map((segments) => segments[index] ?? ""),
	);
}

function pathPrefixEquals(path: readonly string[], prefix: readonly string[]): boolean {
	return prefix.every((segment, index) => path[index] === segment);
}

type ShellCommandSchema = z.ZodObject<{ shell: z.ZodOptional<z.ZodString> }>;

type ShellCommandSpec<T> = Omit<
	ClinkrCommandSpec<NsCliContext, ShellCommandSchema, T, T, unknown, unknown>,
	"name" | "description"
>;

// Keep this shell command face SDK-owned instead of delegating parent-shell integration
// to one extension. The reusable abstraction we expect here is future typed shell
// contributions rendered inside one managed shell integration, not extension-owned rc-file
// mutation or command helpers that each install their own wrapper.
function buildNsShellGroup(): ClinkrGroup<NsCliContext> {
	const shell = new ClinkrGroup<NsCliContext>({
		name: "shell",
		description: "Show or install parent-shell integration.",
		helpGroup: NS_BUILT_IN_HELP_GROUP,
	});
	shell.command({
		name: "show",
		description: "Print the parent-shell wrapper script.",
		...withShellOption<z.infer<typeof nsShellShowResultSchema>>({
			schema: nsShellShowRequestSchema,
			resultSchema: nsShellShowResultSchema,
			handler: runNsShellShow,
			renderHuman: (data) => renderNsShellShow(nsShellShowResultSchema.parse(data)),
		}),
	});
	const installSpec: ClinkrCommandSpec<
		NsCliContext,
		typeof nsShellInstallRequestSchema,
		z.infer<typeof nsShellInstallResultSchema>,
		z.infer<typeof nsShellInstallResultSchema>,
		unknown,
		unknown
	> = {
		name: "install",
		description: "Install the parent-shell wrapper in the detected or selected rc file.",
		schema: nsShellInstallRequestSchema,
		options: { shell: { short: "-s" }, yes: { short: "-y" } },
		resultSchema: nsShellInstallResultSchema,
		handler: runNsShellInstall,
		renderHuman: (data) => renderNsShellInstall(nsShellInstallResultSchema.parse(data)),
	};
	shell.command(installSpec);
	return shell;
}

function withShellOption<T>(spec: ShellCommandSpec<T>): ShellCommandSpec<T> {
	return {
		...spec,
		options: { shell: { short: "-s" }, ...(spec.options ?? {}) },
	};
}

function groupForCommand(
	root: ClinkrGroup<NsCliContext>,
	groupCache: Map<string, ClinkrGroup<NsCliContext>>,
	commandInfo: NsCommandCliInfo,
	topLevelHelpGroups: ReadonlyMap<string, string>,
): ClinkrGroup<NsCliContext> {
	const displaySegments = commandSegments(commandInfo);
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
		const currentSegments = parentSegments.slice(0, index + 1);
		const group = new ClinkrGroup<NsCliContext>({
			name: segment,
			description: groupDescription(currentSegments, commandInfo),
			...(index === 0
				? { helpGroup: topLevelHelpGroups.get(segment) ?? NS_EXTENSION_HELP_GROUP }
				: {}),
			...(isHiddenCommandGroup(currentSegments, commandInfo) ? { isHidden: true } : {}),
		});
		groupCache.set(groupKey, group);
		parent.group(group);
		parent = group;
	}
	return parent;
}

function resolveTopLevelHelpGroups(
	commandInfos: readonly NsCommandCliInfo[],
): ReadonlyMap<string, string> {
	const explicitGroupsBySegment = new Map<string, Set<string>>();
	for (const commandInfo of commandInfos) {
		const topLevelSegment = commandSegments(commandInfo)[0];
		if (topLevelSegment === undefined) continue;
		const explicitGroups = explicitGroupsBySegment.get(topLevelSegment) ?? new Set<string>();
		if (commandInfo.helpGroup !== undefined) explicitGroups.add(commandInfo.helpGroup);
		explicitGroupsBySegment.set(topLevelSegment, explicitGroups);
	}
	return new Map(
		[...explicitGroupsBySegment.entries()].map(([segment, explicitGroups]) => {
			if (explicitGroups.has(NS_BUILT_IN_HELP_GROUP)) {
				return [segment, NS_BUILT_IN_HELP_GROUP];
			}
			return [segment, [...explicitGroups].sort()[0] ?? NS_EXTENSION_HELP_GROUP];
		}),
	);
}

function isHiddenCommandGroup(segments: readonly string[], commandInfo: NsCommandCliInfo): boolean {
	if (isExecGroupNode(segments, commandInfo)) return true;
	return commandInfo.hiddenAncestorKeys?.some((hidden) => hidden === segments.join("/")) ?? false;
}

function isExecGroupNode(segments: readonly string[], commandInfo: NsCommandCliInfo): boolean {
	return (
		segments.at(-1) === NS_EXEC_GROUP_NAME &&
		commandInfo.hiddenAncestorKeys?.includes(segments.join("/")) === true
	);
}

function groupDescription(segments: readonly string[], commandInfo: NsCommandCliInfo): string {
	if (isExecGroupNode(segments, commandInfo)) {
		return `Skill-invoked NS ${segments[0] ?? "extension"} operations.`;
	}
	if (segments.length === 1 && commandInfo.groupDescription !== undefined) {
		return commandInfo.groupDescription;
	}
	return `NS ${segments.join(" ")} commands.`;
}

function isStaticTopLevelMetadataRequest(args: readonly string[]): boolean {
	return args.includes("--version") || args.includes("--runtime");
}

function isNsCommand(
	command: DescriptorCommand,
): command is DescriptorCommand & NsCommand<z.ZodObject, unknown> {
	return command.schema instanceof z.ZodObject && typeof command.handler === "function";
}

function isRawArgvCommand(
	command: DescriptorCommand,
): command is DescriptorCommand & RawArgvCommand {
	return !isNsCommand(command) && typeof command.run === "function";
}

export const VERSION = entry.version;

await entry.runIfMain({ isImportMetaMain: import.meta.main });
