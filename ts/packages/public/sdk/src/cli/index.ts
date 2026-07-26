#!/usr/bin/env node

import { z } from "zod";

import {
	addClinkrCommandStructure,
	ClinkrGroup,
	clinkrFormatFromArgs,
	emitExit,
	ok,
	type ClinkrApp,
	type ClinkrAppBuilder,
	type ClinkrCommandBuilder,
	type ClinkrCommandSpec,
	type ClinkrGroupBuilder,
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
	formatExtensionErrorDiagnostics,
	formatExtensionWarningDiagnostics,
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
	commandKey,
	commandLeafName,
	commandPathMatches,
	commandSegments,
	listBuiltInNsCommandCandidates,
	listStaticNsCommandInfos,
	toCommandCliInfo,
	type FilesystemNsCommandCandidate,
	type NsCommandInfo,
	type NsCommandCliInfo,
} from "../extensions/command-registry.ts";
import type { NsCommand, NsCommandCompletionProvider, RawArgvCommand } from "../sdk/command.ts";
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
}

interface NsCliBuildState {
	commandCatalog: NsCommandCatalog;
	stderr: (text: string) => void;
	failedLoads: string[];
	loadSelectedCommand?: (
		candidate: ExtensionCommandCandidate,
	) => Promise<SelectedNsCommandLoadResult>;
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
		if (!isCompletionScriptRequest) {
			const selectionApp = await entry.buildCli({
				commandCatalog,
				stderr: resolvedStderr,
				failedLoads: [],
				...optionalEntry("loadSelectedCommand", deps.extensionRegistry?.loadSelectedCommand),
			});
			const selection = await selectionApp.selectRoute(args);
			const selectedCommandKey = selection.path.length === 0 ? undefined : selection.path.join("/");
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
			if (diagnosticClassification.warnings.length > 0) {
				resolvedStderr(`${formatExtensionWarningDiagnostics(diagnosticClassification.warnings)}\n`);
			}
		}

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
			buildState: {
				commandCatalog,
				stderr: resolvedStderr,
				failedLoads: [],
				...optionalEntry("loadSelectedCommand", deps.extensionRegistry?.loadSelectedCommand),
			},
		};
	},
	buildCli: async ({ appBuilder, description, version, runtimeInfo, buildState }) => {
		const builtIns = new ClinkrGroup<NsCliContext>({
			name: "ns",
			description,
			version,
			runtimeInfo,
		});
		builtIns.group(buildNsShellGroup());
		builtIns.group(buildNsCompletionGroup());
		appBuilder.importLegacyClinkrGroupForMigration(builtIns);

		const mountedFilesystemCandidates = filesystemCandidates(buildState.commandCatalog);
		const ordinaryCandidates = [...buildState.commandCatalog.candidates.values()].filter(
			(candidate) => !("commandDirectory" in candidate),
		);
		await addCatalogRoutes(appBuilder, ordinaryCandidates, buildState);
		for (const commandDirectory of new Set(
			mountedFilesystemCandidates.map((candidate) => candidate.commandDirectory),
		)) {
			const includedKeys = new Set(
				mountedFilesystemCandidates
					.filter((candidate) => candidate.commandDirectory === commandDirectory)
					.map((candidate) => candidate.filesystemPath.join("/")),
			);
			await addClinkrCommandStructure<NsCliContext, NsExtensionApi>(appBuilder, commandDirectory, {
				include: (route) => route.type === "group" || includedKeys.has(route.path.join("/")),
				mapContext: (context) => context.context,
			});
		}
	},
};

async function addCatalogRoutes(
	builder: ClinkrAppBuilder<NsCliContext> | ClinkrGroupBuilder<NsCliContext>,
	candidates: readonly ExtensionCommandCandidate[],
	buildState: NsCliBuildState,
	prefix: readonly string[] = [],
): Promise<void> {
	const childNames = new Set(
		candidates
			.map((candidate) => commandSegments(candidate)[prefix.length])
			.filter((segment): segment is string => segment !== undefined),
	);
	const topLevelHelpGroups = resolveTopLevelHelpGroups(buildState.commandCatalog.commandInfos);
	for (const name of [...childNames].sort()) {
		const path = [...prefix, name];
		const matching = candidates.filter((candidate) =>
			path.every((segment, index) => commandSegments(candidate)[index] === segment),
		);
		const leaf = matching.find((candidate) => commandSegments(candidate).length === path.length);
		if (leaf !== undefined) {
			builder.command(
				catalogRouteMetadata(leaf, topLevelHelpGroups),
				async (commandBuilder) => await buildCatalogCommand(commandBuilder, leaf, buildState),
			);
			continue;
		}
		const representative = matching[0];
		if (representative === undefined) continue;
		builder.group(
			{
				name,
				description: groupDescription(path, representative),
				...(prefix.length === 0
					? { helpGroup: topLevelHelpGroups.get(name) ?? NS_EXTENSION_HELP_GROUP }
					: {}),
				...(isHiddenCommandGroup(path, representative) ? { isHidden: true } : {}),
			},
			async (groupBuilder) => {
				await addCatalogRoutes(groupBuilder, matching, buildState, path);
				return await groupBuilder.define();
			},
		);
	}
}

function catalogRouteMetadata(
	candidate: ExtensionCommandCandidate,
	topLevelHelpGroups: ReadonlyMap<string, string>,
) {
	const topLevelSegment = commandSegments(candidate)[0];
	return {
		name: commandLeafName(candidate),
		summary: candidate.description,
		helpGroup:
			topLevelSegment === undefined
				? NS_EXTENSION_HELP_GROUP
				: (topLevelHelpGroups.get(topLevelSegment) ?? NS_EXTENSION_HELP_GROUP),
	};
}

async function buildCatalogCommand(
	commandBuilder: ClinkrCommandBuilder<NsCliContext>,
	candidate: ExtensionCommandCandidate,
	buildState: NsCliBuildState,
) {
	const loaded = await (buildState.loadSelectedCommand ?? loadSelectedNsCommand)(candidate);
	if (!loaded.ok) {
		buildState.stderr(`${formatExtensionErrorDiagnostics([loaded.diagnostic])}\n`);
		buildState.failedLoads.push(commandKey(candidate));
		return await commandBuilder.define({
			name: commandLeafName(candidate),
			isRawExit: true,
			run: async () => 2,
		});
	}
	const command = loaded.command;
	if (isLegacyRenderedCommand(command)) {
		return await commandBuilder.define({
			name: commandLeafName(candidate),
			description: command.description,
			summary: command.summary,
			schema: command.schema,
			...(command.completionProvider === undefined
				? {}
				: {
						completionProvider: (ctx, request) =>
							command.completionProvider?.(ctx.context, request) ?? [],
					}),
			handler: async (ctx, request) => await command.run(ctx.context, request),
			renderHuman: (data) => (typeof data === "string" ? data : JSON.stringify(data, null, 2)),
		});
	}
	if (isNsCommand(command)) {
		const { completionProvider, ...commandSpec } = command;
		return await commandBuilder.define({
			...commandSpec,
			name: commandLeafName(candidate),
			description: command.description,
			summary: command.summary,
			...(completionProvider === undefined
				? {}
				: {
						completionProvider: (ctx, request) => completionProvider(ctx.context, request),
					}),
			handler: async (ctx, request) => await command.handler(ctx.context, request),
		});
	}
	if (command.schema !== undefined) {
		const message = `Invalid ns descriptor command ${candidate.source.label}: command schema must be a Zod object schema from @nseng-ai/sdk.`;
		buildState.stderr(`${message}\n`);
		buildState.failedLoads.push(commandKey(candidate));
		return await commandBuilder.define({
			name: commandLeafName(candidate),
			isRawExit: true,
			run: async () => 2,
		});
	}
	if (!isRawArgvCommand(command)) {
		throw new Error(`ns: command ${command.name} was not registered as a rendered command`);
	}
	return await commandBuilder.define({
		name: commandLeafName(candidate),
		description: command.description,
		summary: command.summary,
		isRawExit: true,
		...(command.complete === undefined
			? {}
			: {
					completionProvider: (ctx, request) => command.complete?.(ctx.context, request) ?? [],
				}),
		run: async (ctx, invocation) => {
			const result = await command.run(ctx.context, {
				argv: invocation.argv,
				commandPath: commandSegments(candidate),
			});
			return emitExit(result, {
				format: ctx.context.outputFormat ?? "human",
				io: invocation.io,
			});
		},
	});
}

const entry = defineCli(entryOptions);

export async function buildCli(options: BuildNsCliOptions = {}): Promise<ClinkrApp<NsCliContext>> {
	const candidates = listBuiltInNsCommandCandidates().filter((candidate) =>
		(options.commandInfos ?? listStaticNsCommandInfos()).some((info) =>
			commandPathMatches(info, candidate),
		),
	);
	return await entry.buildCli({
		commandCatalog: {
			candidates: new Map(candidates.map((candidate) => [commandKey(candidate), candidate])),
			commandInfos: candidates.map(toCommandCliInfo),
			diagnostics: [],
			extensionPackageNames: new Set(),
		},
		stderr: () => {},
		failedLoads: [],
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
	const buildState: NsCliBuildState = {
		commandCatalog: options.commandCatalog,
		stderr: options.stderr,
		failedLoads: [],
		...optionalEntry("loadSelectedCommand", options.loadSelectedCommand),
	};
	const app = await entry.buildCli(buildState);
	const candidates = await app.complete({ words }, { context });
	if (buildState.failedLoads.length === 0) {
		options.stdout(renderCompletionCandidatesNewline(candidates));
	}
	return { type: "handled", exitCode: 0 };
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

function filesystemCandidates(catalog: NsCommandCatalog): readonly FilesystemNsCommandCandidate[] {
	return [...catalog.candidates.values()].filter(
		(candidate): candidate is FilesystemNsCommandCandidate => "commandDirectory" in candidate,
	);
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

type LegacyRenderedCommand = Omit<DescriptorCommand, "run" | "completionProvider"> & {
	readonly schema: z.ZodObject;
	readonly run: (
		ctx: NsExtensionApi,
		request: unknown,
	) => ReturnType<NonNullable<DescriptorCommand["run"]>>;
	readonly completionProvider?: NsCommandCompletionProvider;
};

function isLegacyRenderedCommand(command: DescriptorCommand): command is LegacyRenderedCommand {
	return isZodObjectSchema(command.schema) && typeof command.run === "function";
}

function isNsCommand(
	command: DescriptorCommand,
): command is DescriptorCommand & NsCommand<z.ZodObject, unknown> {
	return command.schema !== undefined && typeof command.handler === "function";
}

function isZodObjectSchema(value: unknown): value is z.ZodObject {
	if (value instanceof z.ZodObject) return true;
	if (typeof value !== "object" || value === null) return false;
	return (
		"shape" in value &&
		typeof value.shape === "object" &&
		"parse" in value &&
		typeof value.parse === "function"
	);
}

function isRawArgvCommand(
	command: DescriptorCommand,
): command is DescriptorCommand & RawArgvCommand {
	return !isNsCommand(command) && typeof command.run === "function";
}

export const VERSION = entry.version;

await entry.runIfMain({ isImportMetaMain: import.meta.main });
