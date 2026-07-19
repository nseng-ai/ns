#!/usr/bin/env node

import { z } from "zod";

import {
	clinkrSpecForRun,
	createCatalogView,
	createCommandProgressPhaseRenderer,
	createUnavailableInteraction,
	isClinkrRun,
	type CommandInteraction,
} from "../command/index.ts";
import { isComposableCommand } from "../command/command.ts";
import {
	ClinkrGroup,
	clinkrFormatFromArgs,
	clinkrNameMatchesAutomaticAlias,
	emitExit,
	failure,
	ok,
	type ClinkrCommandSpec,
	type ClinkrDynamicCompletionRequest,
	resolveRenderCapabilities,
	type ClinkrIo,
} from "@nseng-ai/clinkr";
import {
	createStdoutStreamWriter,
	createStreamSink,
	systemStreamClock,
	type StreamSinkDeps,
} from "@nseng-ai/clinkr/stream";
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
	CommandExit,
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
	extensionCommandFailedExit,
	listStaticNsCommandInfos,
	validateCommandExit,
	type NsCommandInfo,
	type NsCommandCliInfo,
	type NsCommandPath,
} from "../extensions/command-registry.ts";
import { parsedSpecForCommand } from "../sdk/command.ts";
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
	/** Lazily materializes a selected descriptor command after its module is loaded. */
	bindSelectedCommand?: (command: DescriptorCommand) => DescriptorCommand;
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
					bindSelectedCommand: deps.bindSelectedCommand,
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
			...optionalEntry("bindSelectedCommand", deps.bindSelectedCommand),
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
	buildCli: ({ description, version, runtimeInfo, buildState }) => {
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
			if (command !== undefined && isComposableCommand(command) && isClinkrRun(command.run)) {
				const spec = clinkrSpecForRun(command.run);
				parent.command({
					name: commandLeafName(commandInfo),
					description: commandInfo.fullDescription,
					summary: commandInfo.description,
					schema: spec.schema,
					resultSchema: spec.resultSchema,
					...(spec.positionals === undefined ? {} : { positionals: spec.positionals }),
					...(spec.options === undefined ? {} : { options: spec.options }),
					...(spec.renderHuman === undefined ? {} : { renderHuman: spec.renderHuman }),
					...(spec.renderMarkdown === undefined ? {} : { renderMarkdown: spec.renderMarkdown }),
					...(spec.completions === undefined
						? {}
						: {
								completionProvider: (ctx: NsCliContext, request: ClinkrDynamicCompletionRequest) =>
									spec.completions?.({ cwd: ctx.cwd, ns: { catalog: ctx.catalog } }, request) ?? [],
							}),
					helpGroup,
					handler: async (ctx, request) => {
						const caps = resolveRenderCapabilities(ctx.context.renderCapabilities);
						const renderer = createCommandProgressPhaseRenderer({
							caps,
							sink: createStreamSink(caps, commandProgressStreamDeps(ctx, caps.isTty)),
							forward: {
								isLive: ctx.context.progress.isLive,
								emit: ctx.context.progress.phase,
							},
						});
						let result: CommandExit;
						try {
							result = validateCommandExit(
								await cpComposableRun(command)(
									{
										ns: { catalog: ctx.catalog },
										cwd: ctx.cwd,
										events: {
											isLive: ctx.context.progress.isLive,
											emit: renderer.emit,
										},
										interact: ctx.commandInteraction,
										caps: ctx.context.renderCapabilities,
										...optionalEntry("format", ctx.context.outputFormat),
									},
									request,
								),
								command.name,
							);
						} catch (error) {
							result = extensionCommandFailedExit(command.name, error);
						}
						try {
							await renderer.finish({ isFailed: result.type !== "ok" });
							return result;
						} catch (error) {
							return extensionCommandFailedExit(command.name, error);
						} finally {
							await renderer.stop();
						}
					},
				});
				continue;
			}
			const legacyCommand =
				command === undefined || isComposableCommand(command)
					? undefined
					: legacyRawCommand(command);
			const parsedCommandSpec =
				legacyCommand === undefined ? undefined : parsedSpecForCommand(legacyCommand);
			if (command !== undefined && parsedCommandSpec !== undefined) {
				parent.command({
					name: commandLeafName(commandInfo),
					description: commandInfo.fullDescription,
					summary: commandInfo.description,
					schema: parsedCommandSpec.schema,
					...(parsedCommandSpec.resultSchema === undefined
						? {}
						: { resultSchema: parsedCommandSpec.resultSchema }),
					...(parsedCommandSpec.positionals === undefined
						? {}
						: { positionals: parsedCommandSpec.positionals }),
					...(parsedCommandSpec.options === undefined
						? {}
						: { options: parsedCommandSpec.options }),
					...(parsedCommandSpec.renderHuman === undefined
						? {}
						: { renderHuman: parsedCommandSpec.renderHuman }),
					...(parsedCommandSpec.renderMarkdown === undefined
						? {}
						: { renderMarkdown: parsedCommandSpec.renderMarkdown }),
					...(parsedCommandSpec.completionProvider === undefined
						? {}
						: {
								completionProvider: (ctx: NsCliContext, request: ClinkrDynamicCompletionRequest) =>
									parsedCommandSpec.completionProvider?.(ctx.context, request) ?? [],
							}),
					helpGroup,
					handler: async (ctx, request) => {
						try {
							return validateCommandExit(
								await parsedCommandSpec.run(ctx.context, request),
								command.name,
							);
						} catch (error) {
							return extensionCommandFailedExit(command.name, error);
						}
					},
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
					...(legacyCommand?.complete === undefined
						? {}
						: {
								completionProvider: (ctx: NsCliContext, request: ClinkrDynamicCompletionRequest) =>
									legacyCommand.complete?.(ctx.context, request) ?? [],
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
						if (legacyCommand === undefined) {
							return emitExit(
								failure("invalid-command", `Command ${command.name} is not executable.`),
								{ format: ctx.context.outputFormat ?? "human", io: clinkrIo(ctx) },
							);
						}
						const result = await runPassthroughCommand(
							ctx,
							legacyCommand,
							passthroughSchema.parse(request).argv,
							commandInfo,
						);
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
		return root;
	},
};

const entry = defineCli(entryOptions);

export function buildCli(options: BuildNsCliOptions = {}): ClinkrGroup<NsCliContext> {
	return entry.buildCli({
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
	bindSelectedCommand?: (command: DescriptorCommand) => DescriptorCommand;
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
		...optionalEntry("bindSelectedCommand", options.bindSelectedCommand),
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
	const candidates = await buildCli(selectedCommandResolution.resolution).completeAsync(
		{ words },
		{
			context,
			onDynamicCompletionError: () => {},
		},
	);
	options.stdout(renderCompletionCandidatesNewline(candidates));
	return { type: "handled", exitCode: 0 };
}

async function resolveSelectedNsCommand(options: {
	candidate: ExtensionCommandCandidate | undefined;
	commandInfos: readonly NsCommandCliInfo[];
	loadSelectedCommand?: (
		candidate: ExtensionCommandCandidate,
	) => Promise<SelectedNsCommandLoadResult>;
	bindSelectedCommand?: (command: DescriptorCommand) => DescriptorCommand;
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
	const loadedCommand = loadedSelectedCommand?.command;
	const selectedCommand =
		loadedCommand === undefined
			? undefined
			: (options.bindSelectedCommand?.(loadedCommand) ?? loadedCommand);
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
		catalog: createCatalogView(options.extensionPackageNames),
		commandInteraction: createCommandInteraction(confirm),
		cwd: options.commandContext.cwd,
		env: options.commandContext.env,
		interaction: createNsCliInteraction({ stderr: options.stderr }),
		stdout: options.stdout,
		stderr: options.stderr,
	};
}

function createCommandInteraction(confirm: NsConfirmPrompt | undefined): CommandInteraction {
	if (confirm === undefined) return createUnavailableInteraction();
	return {
		confirm: async (request) => {
			const approved = await confirm("ns command", request.message, {
				defaultAnswer: request.defaultChoice === "confirm" ? "yes" : "no",
			});
			return approved ? { type: "confirmed" } : { type: "declined" };
		},
		select: async () => ({ type: "unavailable" }),
	};
}

function commandProgressStreamDeps(ctx: NsCliContext, isTty: boolean): StreamSinkDeps {
	if (isTty) {
		return { writer: createStdoutStreamWriter(), clock: systemStreamClock };
	}
	const write = (text: string) => {
		if (ctx.context.onOutput !== undefined) ctx.context.onOutput("stderr", text);
		else ctx.stderr(text);
	};
	return {
		writer: { write, redraw() {}, done() {} },
		onOutput: (line) => write(`${line}\n`),
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
			schema: z.object({ words: z.array(z.string()).default([]) }),
			positionals: { words: { position: 0 } },
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
	ClinkrCommandSpec<NsCliContext, ShellCommandSchema, T>,
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
		...withShellOption({
			schema: nsShellShowRequestSchema,
			resultSchema: nsShellShowResultSchema,
			handler: runNsShellShow,
			renderHuman: renderNsShellShow,
		}),
	});
	shell.command({
		name: "install",
		description: "Install the parent-shell wrapper in the detected or selected rc file.",
		schema: nsShellInstallRequestSchema,
		options: { shell: { short: "-s" }, yes: { short: "-y" } },
		resultSchema: nsShellInstallResultSchema,
		handler: runNsShellInstall,
		renderHuman: renderNsShellInstall,
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

function legacyRawCommand(command: DescriptorCommand): import("../sdk/command.ts").RawArgvCommand {
	if (isComposableCommand(command)) throw new Error(`Command ${command.name} is composable.`);
	return command as import("../sdk/command.ts").RawArgvCommand;
}

function cpComposableRun(
	command: import("../command/command.ts").DefinedCommand<(...args: never[]) => unknown>,
) {
	if (!isClinkrRun(command.run)) {
		throw new Error(`Composable command ${command.name} run does not carry clinkr metadata.`);
	}
	return command.run;
}

async function runPassthroughCommand(
	ctx: NsCliContext,
	command: import("../sdk/command.ts").RawArgvCommand,
	argv: readonly string[],
	path: NsCommandPath,
): Promise<CommandExit> {
	try {
		const result = await command.run(ctx.context, {
			argv,
			commandPath: commandSegments(path),
		});
		return validateCommandExit(result, command.name);
	} catch (error) {
		return extensionCommandFailedExit(command.name, error);
	}
}

export const VERSION = entry.version;

await entry.runIfMain({ isImportMetaMain: import.meta.main });
