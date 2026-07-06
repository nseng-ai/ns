#!/usr/bin/env node

import { z } from "zod";

import {
	ClinkrGroup,
	clinkrFormatFromArgs,
	ok,
	renderCapabilitiesForTerminal,
	type Caps,
	type ClinkrCommandSpec,
	type ClinkrDynamicCompletionRequest,
} from "@nseng-ai/clinkr";
import { renderCompletionCandidatesNewline } from "@nseng-ai/clinkr/completion";
import { rawCommand } from "@nseng-ai/clinkr/raw";
import { defineCli, readStdin, type CliEntrypointDeps } from "@nseng-ai/foundation/cli-runtime";
import { optionalEntries, optionalEntry } from "@nseng-ai/foundation/primitives";

import {
	buildNsCompletionScript,
	renderNsCompletionScriptResult,
	nsCompletionScriptResultSchema,
} from "./completion.ts";
import {
	createRealNsCommandContext,
	createNsCliInteraction,
	type NsCliContext,
} from "./context.ts";
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
	NsCommand,
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
	executeNsCommand,
	formatUnknownError,
	listStaticNsCommandInfos,
	validateNsClinkrExit,
	type NsCommandInfo,
	type NsCommandCliInfo,
	type NsCommandPath,
} from "../extensions/command-registry.ts";

export type { NsCliContext } from "./context.ts";
export type { NsCommandInfo } from "../extensions/command-registry.ts";
export type {
	PreinstalledNsCommandCatalogEntry,
	PreinstalledNsCommandCatalogLoader,
} from "../extensions/registry.ts";

interface NsCliExtensionRegistryDeps {
	loadCommandCatalog?: (options: LoadNsCommandCatalogOptions) => Promise<NsCommandCatalog>;
	loadSelectedCommand?: (
		candidate: ExtensionCommandCandidate,
	) => Promise<SelectedNsCommandLoadResult>;
}

export interface NsCliDeps extends Pick<CliEntrypointDeps, "cwd" | "env" | "stdout" | "stderr"> {
	context?: NsExtensionApi;
	homeDir?: string;
	onOutput?: (stream: NsOutputStream, text: string) => void;
	onProgress?: NsProgressPhaseListener;
	confirm?: NsConfirmPrompt;
	preinstalledCommandCatalog?: PreinstalledNsCommandCatalogLoader;
	extensionRegistry?: NsCliExtensionRegistryDeps;
}

export interface BuildNsCliOptions {
	commandInfos?: readonly NsCommandCliInfo[];
	selectedCommand?: NsCommand;
	selectedCommandPath?: NsCommandPath;
}

interface NsCliBuildState {
	commandInfos: readonly NsCommandCliInfo[];
	selectedCommand?: NsCommand;
	selectedCommandPath?: NsCommandPath;
}

const entry = defineCli<NsCliContext, NsCliDeps, NsCliBuildState>({
	metaUrl: new URL("../cli.ts", import.meta.url).href,
	runtime: "typescript",
	description: "ns tools.",
	prepareRun: async ({ args, deps, cwd, env, stdout, stderr, io }) => {
		const injectedContext = deps.context;
		const resolvedStdout = deps.stdout ?? injectedContext?.stdout ?? stdout;
		const resolvedStderr = deps.stderr ?? injectedContext?.stderr ?? stderr;
		const resolvedCwd = deps.cwd ?? injectedContext?.cwd ?? cwd;
		const resolvedEnv = deps.env ?? injectedContext?.env ?? env;
		const homeDir = deps.homeDir ?? resolvedEnv.HOME;
		const commandCatalog = await (
			deps.extensionRegistry?.loadCommandCatalog ?? loadNsCommandCatalog
		)({
			cwd: resolvedCwd,
			env: resolvedEnv,
			...optionalEntry("homeDir", homeDir),
			...optionalEntry("preinstalledCommandCatalog", deps.preinstalledCommandCatalog),
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
					onProgress: deps.onProgress,
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
			cwd: resolvedCwd,
			env: resolvedEnv,
			stdout: resolvedStdout,
			stderr: resolvedStderr,
			...optionalEntries({
				injectedContext,
				onOutput: deps.onOutput,
				onProgress: deps.onProgress,
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
		const groups = new Map<string, ClinkrGroup<NsCliContext>>();
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
							completionProvider: (ctx: NsCliContext, request: ClinkrDynamicCompletionRequest) =>
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
						return validateNsClinkrExit(result, selectedCommand.name);
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
										message: `Unknown ns command: ${commandDisplayName(commandInfo)}`,
									}
								: await executeNsCommand(ctx.context, selectedCommand, request);
						writeNsResultOutput(result, ctx);
						return result.ok ? 0 : result.exitCode;
					},
				}),
			);
		}
		root.group(buildNsShellGroup());
		root.group(buildNsCompletionGroup());
	},
});

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

export async function runCli(args: readonly string[], deps: NsCliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

async function handleCompletionResolverInvocation(options: {
	args: readonly string[];
	commandCatalog: NsCommandCatalog;
	loadSelectedCommand?: (
		candidate: ExtensionCommandCandidate,
	) => Promise<SelectedNsCommandLoadResult>;
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	injectedContext?: NsExtensionApi;
	onOutput?: (stream: NsOutputStream, text: string) => void;
	onProgress?: NsProgressPhaseListener;
	confirm?: NsConfirmPrompt;
	caps?: Caps;
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
		cwd: options.cwd,
		env: options.env,
		stdout: options.stdout,
		stderr: options.stderr,
		...optionalEntries({
			injectedContext: options.injectedContext,
			onOutput: options.onOutput,
			onProgress: options.onProgress,
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
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	injectedContext?: NsExtensionApi;
	onOutput?: (stream: NsOutputStream, text: string) => void;
	onProgress?: NsProgressPhaseListener;
	confirm?: NsConfirmPrompt;
	caps?: Caps;
}): Promise<NsCliContext> {
	const baseContext =
		options.injectedContext ?? createRealNsCommandContext({ cwd: options.cwd, env: options.env });
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
	const context: NsExtensionApi = {
		cwd: options.cwd,
		env: options.env,
		textGenerator: baseContext.textGenerator,
		commandIo,
		progress:
			options.onProgress === undefined
				? noopNsProgress
				: { isLive: true, phase: options.onProgress },
		renderCapabilities,
		outputFormat: clinkrFormatFromArgs(options.args),
		exec: baseContext.exec.bind(baseContext),
		stdout: options.stdout,
		stderr: options.stderr,
		stdin,
		...optionalEntries({ onOutput, confirm, extensions: contextExtensions }),
	};
	return {
		context,
		cwd: options.cwd,
		env: options.env,
		interaction: createNsCliInteraction({ stderr: options.stderr }),
		stdout: options.stdout,
		stderr: options.stderr,
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

const NS_EXEC_GROUP_NAME = "exec";
const NS_BUILT_IN_HELP_GROUP = "Built-in Commands:";
const NS_EXTENSION_HELP_GROUP = "Extensions:";
// Dynamic ns extensions are one group deep today. A grouped command named
// `exec-<name>` is mounted as hidden `ns <group> exec <name>` so agent-only
// operations keep the same nested exec contract as preinstalled Clinkr groups.
const NS_EXEC_COMMAND_PREFIX = "exec-";

function isGroupedExecCommand(commandInfo: NsCommandCliInfo): boolean {
	return commandInfo.group !== undefined && commandInfo.name.startsWith(NS_EXEC_COMMAND_PREFIX);
}

function cliLeafCommandName(commandInfo: NsCommandCliInfo): string {
	if (commandInfo.segments !== undefined) return commandLeafName(commandInfo);
	if (!isGroupedExecCommand(commandInfo)) return commandInfo.name;
	return commandInfo.name.slice(NS_EXEC_COMMAND_PREFIX.length);
}

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

function displaySegmentsForCommand(commandInfo: NsCommandCliInfo): readonly string[] {
	if (commandInfo.segments !== undefined) return commandInfo.segments;
	if (!isGroupedExecCommand(commandInfo)) return commandSegments(commandInfo);
	return [commandInfo.group ?? "", NS_EXEC_GROUP_NAME, cliLeafCommandName(commandInfo)].filter(
		(segment) => segment !== "",
	);
}

function pathPrefixMatches(args: readonly string[], path: readonly string[]): boolean {
	return path.every((segment, index) => args[index] === segment);
}

type ShellCommandSchema = z.ZodObject<{ shell: z.ZodOptional<z.ZodString> }>;

type ShellCommandSpec<T> = Omit<
	ClinkrCommandSpec<NsCliContext, ShellCommandSchema, T>,
	"name" | "description"
>;

// Keep this shell command face kernel-owned instead of delegating parent-shell integration
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
): ClinkrGroup<NsCliContext> {
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
		const group = new ClinkrGroup<NsCliContext>({
			name: segment,
			description: groupDescription(parentSegments.slice(0, index + 1), commandInfo),
			...(index === 0 ? { helpGroup: NS_EXTENSION_HELP_GROUP } : {}),
			...(segment === NS_EXEC_GROUP_NAME && isGroupedExecCommand(commandInfo)
				? { isHidden: true }
				: {}),
		});
		groupCache.set(groupKey, group);
		parent.group(group);
		parent = group;
	}
	return parent;
}

function groupDescription(segments: readonly string[], commandInfo: NsCommandCliInfo): string {
	if (segments.at(-1) === NS_EXEC_GROUP_NAME && isGroupedExecCommand(commandInfo)) {
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

function writeNsResultOutput(
	result: { ok: true; message: string } | { ok: false; message: string },
	deps: Pick<NsCliContext, "stdout" | "stderr">,
): void {
	if (result.message === "") return;
	const output = `${result.message}\n`;
	if (result.ok) {
		deps.stdout(output);
		return;
	}
	deps.stderr(output);
}

export const VERSION = entry.version;

await entry.runIfMain({ isImportMetaMain: import.meta.main });
