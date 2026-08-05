#!/usr/bin/env node

import {
	createClinkrApp,
	defineCommand,
	resolveClinkrOutputFormat,
	type ClinkrCommandMetadata,
	type ClinkrComposition,
	type ClinkrContextfulApp,
	type ClinkrScope,
} from "@nseng-ai/clinkr/app";
import {
	defineClinkrAppCli,
	readStdin,
	type ClinkrAppCliBuildInput,
	type ClinkrAppCliPrepareRunInput,
} from "@nseng-ai/foundation/cli-runtime";
import { optionalEntries, optionalEntry, resolveHomeDir } from "@nseng-ai/foundation/primitives";

import { createNsCliInteraction, type NsCliBaseContext } from "./context.ts";
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
	extensionPointCommand,
	extensionPointsCommand,
} from "../extensions/built-in-extension-commands.ts";
import {
	loadNsCommandSourceInventory,
	type LoadNsCommandSourceInventoryOptions,
	type NsCommandSource,
	type NsCommandSourceInventory,
	type PreinstalledNsCommandSourceLoader,
} from "../extensions/source-inventory.ts";
import type {
	NsConfirmPrompt,
	NsExtensionApi,
	NsOutputStream,
	NsProgressPhaseListener,
	NsSelectPrompt,
} from "../sdk/index.ts";
import {
	NS_BUILT_IN_HELP_GROUP,
	NS_EXTENSION_HELP_GROUP,
} from "../extensions/help-presentation.ts";

export type { NsCliBaseContext } from "./context.ts";
export type {
	NsCommandSource,
	NsCommandSourceDiagnostic,
	NsCommandSourceInventory,
	PreinstalledNsCommandSource,
	PreinstalledNsCommandSourceLoader,
} from "../extensions/source-inventory.ts";
export {
	NS_BUILT_IN_HELP_GROUP,
	NS_EXTENSION_HELP_GROUP,
} from "../extensions/help-presentation.ts";

interface NsCliSourceInventoryDeps {
	loadSourceInventory?: (
		options: LoadNsCommandSourceInventoryOptions,
	) => Promise<NsCommandSourceInventory>;
}

export interface NsCliDeps {
	readonly context: NsCliBaseContext;
	readonly cwd?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly stdout?: (text: string) => void;
	readonly stderr?: (text: string) => void;
	readonly readStdin?: () => Promise<string>;
	readonly canEmitAnsi?: boolean;
	readonly entryMetaUrl?: string;
	readonly homeDir?: string;
	readonly onOutput?: (stream: NsOutputStream, text: string) => void;
	readonly onProgress?: NsProgressPhaseListener;
	readonly confirm?: NsConfirmPrompt;
	readonly select?: NsSelectPrompt;
	readonly preinstalledSources?: PreinstalledNsCommandSourceLoader;
	/** Set false when a host composes the SDK point commands into its own extension subtree. */
	readonly includeSdkExtensionCommands?: boolean;
	readonly extensionRegistry?: NsCliSourceInventoryDeps;
}

interface NsCliBuildState {
	readonly inventory: NsCommandSourceInventory;
	readonly includeSdkExtensionCommands: boolean;
}

const entryOptions = {
	metaUrl: new URL("../cli.ts", import.meta.url).href,
	runtime: "typescript" as const,
	description: "ns tools.",
	prepareRun: async ({
		args,
		deps,
		cwd,
		env,
		stdout,
		stderr,
	}: ClinkrAppCliPrepareRunInput<NsCliDeps>) => {
		const base = deps.context;
		if (base === undefined) throw new Error("Ns CLI context is required.");
		const resolvedCwd = deps.cwd ?? base.cwd ?? cwd;
		const resolvedEnv = deps.env ?? base.env ?? env;
		const homeDir = resolveHomeDir(deps.homeDir, resolvedEnv) ?? base.homeDir;
		const inventory = await (
			deps.extensionRegistry?.loadSourceInventory ?? loadNsCommandSourceInventory
		)({
			cwd: resolvedCwd,
			env: resolvedEnv,
			...optionalEntry("homeDir", homeDir),
			...optionalEntry("preinstalledSources", deps.preinstalledSources),
		});
		for (const diagnostic of inventory.diagnostics) {
			stderr(`${diagnostic.severity === "error" ? "Warning: " : ""}${diagnostic.message}\n`);
		}
		const resolvedStdout = deps.stdout ?? base.stdout ?? stdout;
		const resolvedStderr = deps.stderr ?? base.stderr ?? stderr;
		const commandIo = createCliCommandIo({
			stdout: resolvedStdout,
			stderr: resolvedStderr,
			...optionalEntry("onOutput", deps.onOutput ?? base.onOutput),
		});
		const renderCapabilities = {
			...base.renderCapabilities,
			canEmitAnsi: deps.canEmitAnsi ?? base.renderCapabilities.canEmitAnsi,
		};
		const context: NsExtensionApi = {
			cwd: resolvedCwd,
			env: resolvedEnv,
			...optionalEntry("homeDir", homeDir),
			textGenerator: base.textGenerator,
			commandIo,
			progress:
				deps.onProgress === undefined ? noopNsProgress : { isLive: true, phase: deps.onProgress },
			renderCapabilities,
			outputFormat: resolveClinkrOutputFormat(args),
			exec: base.exec.bind(base),
			hasExtension: (packageName) => inventory.extensionPackageNames.has(packageName),
			installedExtensionPackageNames: [...inventory.extensionPackageNames]
				.filter((name) => !inventory.builtInPackageNames.has(name))
				.sort(),
			stdout: resolvedStdout,
			stderr: resolvedStderr,
			stdin: base.stdin ?? readStdin,
			...optionalEntries({
				onOutput: deps.onOutput ?? base.onOutput,
				confirm: deps.confirm ?? base.confirm,
				select: deps.select ?? base.select,
				extensions: base.extensions,
			}),
		};
		return {
			type: "run" as const,
			context,
			buildState: {
				inventory,
				includeSdkExtensionCommands: deps.includeSdkExtensionCommands !== false,
			},
		};
	},
	buildApp: ({ name, version, runtimeInfo, buildState }: ClinkrAppCliBuildInput<NsCliBuildState>) =>
		buildNsApp({
			name,
			version,
			runtimeInfo,
			inventory: buildState.inventory,
			includeSdkExtensionCommands: buildState.includeSdkExtensionCommands,
		}),
};

const entry = defineClinkrAppCli<NsExtensionApi, NsCliDeps, NsCliBuildState>(entryOptions);

export function buildNsApp(options: {
	readonly name?: string;
	readonly version?: string;
	readonly runtimeInfo?: () => string;
	readonly inventory: NsCommandSourceInventory;
	readonly includeSdkExtensionCommands?: boolean;
}): ClinkrContextfulApp<NsExtensionApi> {
	return createClinkrApp<NsExtensionApi>(
		{
			name: options.name ?? "ns",
			requiresContext: true,
			completion: {},
			...optionalEntries({ version: options.version, runtimeInfo: options.runtimeInfo }),
		},
		(composition) =>
			composeNsSources(
				composition,
				options.inventory.sources,
				options.includeSdkExtensionCommands !== false,
			),
	);
}

function composeNsSources(
	composition: ClinkrComposition<NsExtensionApi>,
	sources: readonly NsCommandSource[],
	includeSdkExtensionCommands: boolean,
): void {
	composition.source(
		{
			label: "sdk:built-ins",
			decorateTopLevel: (metadata) => ({
				...metadata,
				helpGroup: NS_BUILT_IN_HELP_GROUP,
				helpOrder: 3,
			}),
		},
		(root) => {
			if (includeSdkExtensionCommands) {
				root.group(
					"extension",
					{ description: "Inspect ns extension metadata.", helpGroup: NS_BUILT_IN_HELP_GROUP },
					composeNsExtensionPointCommands,
				);
			}
			root.group(
				"shell",
				{ description: "Manage shell integration.", helpGroup: NS_BUILT_IN_HELP_GROUP },
				(shell) => {
					shell.command("show", { description: "Print shell integration." }, () =>
						defineCommand<
							NsExtensionApi,
							typeof nsShellShowRequestSchema,
							typeof nsShellShowResultSchema
						>({
							requiresContext: true,
							schema: nsShellShowRequestSchema,
							resultSchema: nsShellShowResultSchema,
							handler: (context, request) =>
								toModernOutcome(runNsShellShow(shellContext(context), request)),
							renderHuman: renderNsShellShow,
						}),
					);
					shell.command("install", { description: "Install shell integration." }, () =>
						defineCommand<
							NsExtensionApi,
							typeof nsShellInstallRequestSchema,
							typeof nsShellInstallResultSchema
						>({
							requiresContext: true,
							schema: nsShellInstallRequestSchema,
							resultSchema: nsShellInstallResultSchema,
							handler: (context, request) =>
								toModernOutcome(runNsShellInstall(shellContext(context), request)),
							renderHuman: renderNsShellInstall,
						}),
					);
				},
			);
		},
	);
	for (const source of sources) {
		if (source.commandDirectory !== undefined) {
			composition.filesystem({
				label: source.label,
				commandDirectory: source.commandDirectory,
				decorateTopLevel: (metadata) => decorateNsTopLevelMetadata(source, metadata),
			});
			continue;
		}
		if (source.compose !== undefined) {
			composition.source(
				{
					label: source.label,
					decorateTopLevel: (metadata) => decorateNsTopLevelMetadata(source, metadata),
				},
				source.compose,
			);
		}
	}
}

function decorateNsTopLevelMetadata(
	source: NsCommandSource,
	metadata: ClinkrCommandMetadata,
): ClinkrCommandMetadata {
	if (source.helpClassification === "built-in") {
		return { ...metadata, helpGroup: NS_BUILT_IN_HELP_GROUP, helpOrder: 3 };
	}
	return {
		...metadata,
		helpGroup: NS_EXTENSION_HELP_GROUP,
		helpOrder: source.origin === "package" ? 0 : 1,
	};
}

export function composeNsExtensionPointCommands(extension: ClinkrScope<NsExtensionApi>): void {
	extension.command(
		"point",
		{ description: "Show one ns point definition and its active source." },
		() => extensionPointCommand,
	);
	extension.command(
		"points",
		{ description: "List defined ns points and their active sources." },
		() => extensionPointsCommand,
	);
}

async function toModernOutcome<T>(
	result: Promise<unknown>,
): Promise<import("@nseng-ai/clinkr/app").CommandOutcome<T>> {
	const value = await result;
	if (typeof value !== "object" || value === null || !("type" in value)) {
		throw new Error("Legacy shell command returned an invalid outcome.");
	}
	const legacy = value as Record<string, unknown>;
	if (legacy.type === "ok") return { status: "success" as const, data: legacy.data as T };
	if (legacy.type === "negative") {
		return {
			status: "negative" as const,
			message: String(legacy.message),
			...optionalEntry("data", legacy.data),
		};
	}
	if (legacy.type === "failure") {
		return {
			status: "failure" as const,
			errorType: String(legacy.errorType),
			message: String(legacy.message),
			...optionalEntry("data", legacy.data),
		};
	}
	return {
		status: "usage-error" as const,
		errorType: "usage-error",
		message: String(legacy.message),
		...optionalEntry("data", legacy.data),
	};
}

function shellContext(context: NsExtensionApi) {
	const stderr = context.stderr ?? (() => {});
	return {
		context,
		cwd: context.cwd,
		env: context.env,
		interaction: createNsCliInteraction({ stderr }),
		stdout: context.stdout ?? (() => {}),
		stderr,
	};
}

export async function runCli(args: readonly string[], deps: NsCliDeps): Promise<number> {
	if (deps.entryMetaUrl === undefined) return await entry.run(args, deps);
	return await defineClinkrAppCli<NsExtensionApi, NsCliDeps, NsCliBuildState>({
		...entryOptions,
		metaUrl: deps.entryMetaUrl,
	}).run(args, deps);
}
