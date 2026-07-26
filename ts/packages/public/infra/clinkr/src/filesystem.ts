import { readdir } from "node:fs/promises";
import { isAbsolute, join, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import type { ClinkrCommandSpec, RawCommandSpec } from "./group.ts";
import {
	ClinkrApp,
	type ClinkrAppBuilder,
	type ClinkrAppOptions,
	type ClinkrCommand,
	type ClinkrCommandBuilder,
	type ClinkrGroupBuilder,
	type ClinkrRouteMetadata,
} from "./runtime.ts";

const commandDefinitions = new WeakSet<object>();

export interface ClinkrCommandMetadata {
	description?: string;
	/** Short summary for parent help lists. */
	summary?: string;
	/** Parent help section heading. */
	helpGroup?: string;
	aliases?: readonly string[];
	hidden?: boolean;
}

export interface ClinkrGroupDefinition {
	description?: string;
	/** Short summary for parent help lists. */
	summary?: string;
	/** Parent help section heading. */
	helpGroup?: string;
	aliases?: readonly string[];
	hidden?: boolean;
}

export type ClinkrCommandDefinition<
	TContext,
	S extends z.ZodObject,
	TResult,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
> = Omit<
	ClinkrCommandSpec<TContext, S, TResult, TNegative, TFailure, TUsageError>,
	"name" | "description" | "summary" | "helpGroup" | "aliases" | "isHidden"
>;

export type ClinkrRawCommandDefinition<TContext> = Omit<
	RawCommandSpec<TContext>,
	"name" | "description" | "summary" | "helpGroup" | "aliases" | "isHidden"
>;

export interface CreateClinkrAppOptions<TContext = void> extends Omit<
	ClinkrAppOptions<TContext>,
	"moduleUrl"
> {
	/** Absolute directory containing the filesystem-defined command structure. */
	commandDirectory: string;
}

export interface ClinkrCommandStructureRoute {
	readonly type: "command" | "group" | "default";
	readonly path: readonly string[];
	readonly metadata: Readonly<ClinkrRouteMetadata>;
}

export interface AddClinkrCommandStructureOptions<TContext, TFilesystemContext = TContext> {
	readonly include?: (route: ClinkrCommandStructureRoute) => boolean;
	readonly mapContext?: (context: TContext) => TFilesystemContext;
}

type CommandDefinition<TContext> =
	| ClinkrCommandDefinition<TContext, z.ZodObject, unknown>
	| ClinkrRawCommandDefinition<TContext>;

interface MetadataModule {
	metadata(): ClinkrCommandMetadata;
}

interface CommandModule<TContext> {
	command(): Promise<CommandDefinition<TContext>> | CommandDefinition<TContext>;
}

interface CommandPair {
	readonly metadataFile: string;
	readonly commandFile: string;
}

interface GroupModule {
	group(): ClinkrGroupDefinition;
}

interface DirectoryEntry {
	readonly name: string;
	readonly isDirectory: boolean;
	readonly isFile: boolean;
}

interface CommandStructureGateway {
	readDirectory(directory: string): Promise<readonly DirectoryEntry[]>;
	importModule(file: string): Promise<unknown>;
}

const nodeCommandStructureGateway: CommandStructureGateway = {
	async readDirectory(directory) {
		const entries = await readdir(directory, { withFileTypes: true });
		return entries.map((entry) => ({
			name: entry.name,
			isDirectory: entry.isDirectory(),
			isFile: entry.isFile(),
		}));
	},
	async importModule(file) {
		return await import(pathToFileURL(file).href);
	},
};

/**
 * Preserve schema-driven inference while marking a definition as authored for
 * filesystem discovery. Route identity remains owned by its directory.
 */
export function defineCommand<
	TContext = void,
	S extends z.ZodObject = z.ZodObject,
	TResult = unknown,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
>(
	definition: ClinkrCommandDefinition<TContext, S, TResult, TNegative, TFailure, TUsageError>,
): ClinkrCommandDefinition<TContext, S, TResult, TNegative, TFailure, TUsageError> {
	const frozen = Object.freeze({ ...definition });
	commandDefinitions.add(frozen);
	return frozen;
}

/** Create an immutable app from one absolute filesystem command structure. */
export async function createClinkrApp<TContext = void>(
	options: CreateClinkrAppOptions<TContext>,
): Promise<ClinkrApp<TContext>> {
	assertAbsoluteCommandDirectory(options.commandDirectory);
	const moduleUrl = pathToFileURL(`${options.commandDirectory}${sep}`).href;
	return await ClinkrApp.create<TContext>(
		{
			name: options.name,
			moduleUrl,
			...(options.description === undefined ? {} : { description: options.description }),
			...(options.version === undefined ? {} : { version: options.version }),
			...(options.runtimeInfo === undefined ? {} : { runtimeInfo: options.runtimeInfo }),
			...(options.completion === undefined ? {} : { completion: options.completion }),
		},
		async (appBuilder) => {
			await addClinkrCommandStructure(appBuilder, options.commandDirectory);
			return await appBuilder.define();
		},
	);
}

/** Add one absolute filesystem command structure to an app or group builder. */
export async function inspectClinkrCommandStructure(
	commandDirectory: string,
): Promise<readonly ClinkrCommandStructureRoute[]> {
	assertAbsoluteCommandDirectory(commandDirectory);
	const routes: ClinkrCommandStructureRoute[] = [];
	await inspectCommandStructure(commandDirectory, [], routes, nodeCommandStructureGateway);
	return Object.freeze(routes);
}

export async function addClinkrCommandStructure<TContext>(
	builder: ClinkrAppBuilder<TContext> | ClinkrGroupBuilder<TContext>,
	commandDirectory: string,
	options?: AddClinkrCommandStructureOptions<TContext>,
): Promise<void>;
export async function addClinkrCommandStructure<TContext, TFilesystemContext>(
	builder: ClinkrAppBuilder<TContext> | ClinkrGroupBuilder<TContext>,
	commandDirectory: string,
	options: AddClinkrCommandStructureOptions<TContext, TFilesystemContext> & {
		readonly mapContext: (context: TContext) => TFilesystemContext;
	},
): Promise<void>;
export async function addClinkrCommandStructure<TContext, TFilesystemContext = TContext>(
	builder: ClinkrAppBuilder<TContext> | ClinkrGroupBuilder<TContext>,
	commandDirectory: string,
	options: AddClinkrCommandStructureOptions<TContext, TFilesystemContext> = {},
): Promise<void> {
	assertAbsoluteCommandDirectory(commandDirectory);
	if (options.mapContext === undefined) {
		await addCommandStructureWithSameContext(builder, commandDirectory, options.include);
		return;
	}
	await addCommandStructure(builder, commandDirectory, nodeCommandStructureGateway, [], {
		...(options.include === undefined ? {} : { include: options.include }),
		mapContext: options.mapContext,
	});
}

async function addCommandStructureWithSameContext<TContext>(
	builder: ClinkrAppBuilder<TContext> | ClinkrGroupBuilder<TContext>,
	commandDirectory: string,
	include: ((route: ClinkrCommandStructureRoute) => boolean) | undefined,
): Promise<void> {
	await addCommandStructure(builder, commandDirectory, nodeCommandStructureGateway, [], {
		...(include === undefined ? {} : { include }),
		mapContext: identityContext,
	});
}

async function addCommandStructure<TContext, TFilesystemContext>(
	builder: ClinkrAppBuilder<TContext> | ClinkrGroupBuilder<TContext>,
	directory: string,
	gateway: CommandStructureGateway,
	path: readonly string[],
	options: CommandStructureMountOptions<TContext, TFilesystemContext>,
): Promise<void> {
	const entries = await gateway.readDirectory(directory);
	const rootPair = commandPair(directory, entries);
	if (rootPair !== undefined) {
		const metadata = await loadCommandMetadata(rootPair.metadataFile, gateway);
		const route = structureRoute("default", path, path.at(-1) ?? "", metadata);
		if (options.include?.(route) !== false) {
			await builder.defaultCommand(async (commandBuilder) =>
				defineFilesystemCommand(
					commandBuilder,
					rootPair.commandFile,
					gateway,
					undefined,
					options.mapContext,
				),
			);
		}
	}

	const routeDirectories = entries
		.filter((entry) => entry.isDirectory)
		.toSorted((left, right) => left.name.localeCompare(right.name));
	for (const entry of routeDirectories) {
		await addDirectoryRoute(
			builder,
			join(directory, entry.name),
			entry.name,
			gateway,
			[...path, entry.name],
			options,
		);
	}
}

async function addDirectoryRoute<TContext, TFilesystemContext>(
	builder: ClinkrAppBuilder<TContext> | ClinkrGroupBuilder<TContext>,
	directory: string,
	name: string,
	gateway: CommandStructureGateway,
	path: readonly string[],
	options: CommandStructureMountOptions<TContext, TFilesystemContext>,
): Promise<void> {
	const entries = await gateway.readDirectory(directory);
	const hasGroup = entries.some((entry) => entry.name === "group.ts" && entry.isFile);
	const pair = commandPair(directory, entries);
	if (!hasGroup && pair === undefined) {
		throw new Error(
			`clinkr: command directory '${directory}' must contain group.ts or a metadata.ts/command.ts pair`,
		);
	}
	if (hasGroup) {
		const module = await loadGroupModule(join(directory, "group.ts"), gateway);
		const definition = validateGroupDefinition(module.group(), join(directory, "group.ts"));
		const route = structureRoute("group", path, name, definition);
		const includedChildren = await hasIncludedCommandRoute(
			directory,
			path,
			gateway,
			options.include,
		);
		if (options.include?.(route) !== false || includedChildren) {
			builder.group(route.metadata, async (groupBuilder) => {
				await addCommandStructure(groupBuilder, directory, gateway, path, options);
				return await groupBuilder.define();
			});
		}
		return;
	}

	if (pair === undefined) throw new Error(`clinkr: command directory '${directory}' is incomplete`);
	const metadata = await loadCommandMetadata(pair.metadataFile, gateway);
	const route = structureRoute("command", path, name, metadata);
	if (options.include?.(route) === false) return;
	builder.command(route.metadata, async (commandBuilder) =>
		defineFilesystemCommand(commandBuilder, pair.commandFile, gateway, name, options.mapContext),
	);
}

async function defineFilesystemCommand<TContext, TFilesystemContext>(
	builder: ClinkrCommandBuilder<TContext>,
	commandFile: string,
	gateway: CommandStructureGateway,
	name: string | undefined,
	mapContext: (context: TContext) => TFilesystemContext,
): Promise<ClinkrCommand<TContext>> {
	const module = await loadCommandModule<TFilesystemContext>(commandFile, gateway);
	const loadedDefinition = await module.command();
	if (!isObject(loadedDefinition) || !commandDefinitions.has(loadedDefinition)) {
		throw new Error("clinkr: command() must return a definition created by defineCommand()");
	}
	const definition = mapDefinitionContext(loadedDefinition, mapContext);
	if (definition.isRawExit === true) {
		if (name === undefined) return await builder.defineDefault(definition);
		return await builder.define({ ...definition, name });
	}
	if (name === undefined) return await builder.defineDefault(definition);
	return await builder.define({ ...definition, name });
}

type CommandStructureMountOptions<TContext, TFilesystemContext> = Required<
	Pick<AddClinkrCommandStructureOptions<TContext, TFilesystemContext>, "mapContext">
> &
	Pick<AddClinkrCommandStructureOptions<TContext, TFilesystemContext>, "include">;

function identityContext<TContext>(context: TContext): TContext {
	return context;
}

function mapDefinitionContext<TContext, TFilesystemContext>(
	definition: CommandDefinition<TFilesystemContext>,
	mapContext: (context: TContext) => TFilesystemContext,
): CommandDefinition<TContext> {
	if (definition.isRawExit === true) {
		const { completionProvider, ...spec } = definition;
		return {
			...spec,
			run: async (context, invocation) => await definition.run(mapContext(context), invocation),
			...(completionProvider === undefined
				? {}
				: {
						completionProvider: async (context, request) =>
							await completionProvider(mapContext(context), request),
					}),
		};
	}
	const { completionProvider, ...spec } = definition;
	return {
		...spec,
		handler: async (context, request) => await definition.handler(mapContext(context), request),
		...(completionProvider === undefined
			? {}
			: {
					completionProvider: async (context, request) =>
						await completionProvider(mapContext(context), request),
				}),
	};
}

async function inspectCommandStructure(
	directory: string,
	path: readonly string[],
	routes: ClinkrCommandStructureRoute[],
	gateway: CommandStructureGateway,
): Promise<void> {
	const entries = await gateway.readDirectory(directory);
	const rootPair = commandPair(directory, entries);
	if (rootPair !== undefined) {
		routes.push(
			structureRoute(
				"default",
				path,
				path.at(-1) ?? "",
				await loadCommandMetadata(rootPair.metadataFile, gateway),
			),
		);
	}
	const routeDirectories = entries
		.filter((entry) => entry.isDirectory)
		.toSorted((left, right) => left.name.localeCompare(right.name));
	for (const entry of routeDirectories) {
		const childDirectory = join(directory, entry.name);
		const childPath = [...path, entry.name];
		const childEntries = await gateway.readDirectory(childDirectory);
		const hasGroup = childEntries.some((child) => child.name === "group.ts" && child.isFile);
		const pair = commandPair(childDirectory, childEntries);
		if (!hasGroup && pair === undefined) {
			throw new Error(
				`clinkr: command directory '${childDirectory}' must contain group.ts or a metadata.ts/command.ts pair`,
			);
		}
		if (hasGroup) {
			const file = join(childDirectory, "group.ts");
			const module = await loadGroupModule(file, gateway);
			routes.push(
				structureRoute(
					"group",
					childPath,
					entry.name,
					validateGroupDefinition(module.group(), file),
				),
			);
			await inspectCommandStructure(childDirectory, childPath, routes, gateway);
			continue;
		}
		if (pair === undefined)
			throw new Error(`clinkr: command directory '${childDirectory}' is incomplete`);
		routes.push(
			structureRoute(
				"command",
				childPath,
				entry.name,
				await loadCommandMetadata(pair.metadataFile, gateway),
			),
		);
	}
}

async function hasIncludedCommandRoute(
	directory: string,
	path: readonly string[],
	gateway: CommandStructureGateway,
	include: ((route: ClinkrCommandStructureRoute) => boolean) | undefined,
): Promise<boolean> {
	const routes: ClinkrCommandStructureRoute[] = [];
	await inspectCommandStructure(directory, path, routes, gateway);
	if (include === undefined) return true;
	return routes.some((route) => route.type !== "group" && include(route));
}

function structureRoute(
	type: ClinkrCommandStructureRoute["type"],
	path: readonly string[],
	name: string,
	definition: ClinkrCommandMetadata | ClinkrGroupDefinition,
): ClinkrCommandStructureRoute {
	return Object.freeze({
		type,
		path: Object.freeze([...path]),
		metadata: Object.freeze(routeMetadata(name, definition)),
	});
}

function commandPair(
	directory: string,
	entries: readonly DirectoryEntry[],
): CommandPair | undefined {
	const hasMetadata = entries.some((entry) => entry.name === "metadata.ts" && entry.isFile);
	const hasCommand = entries.some((entry) => entry.name === "command.ts" && entry.isFile);
	if (hasMetadata !== hasCommand) {
		const missingFile = hasMetadata ? "command.ts" : "metadata.ts";
		throw new Error(
			`clinkr: command directory '${directory}' has an incomplete command pair; missing ${missingFile}`,
		);
	}
	if (!hasMetadata) return undefined;
	return {
		metadataFile: join(directory, "metadata.ts"),
		commandFile: join(directory, "command.ts"),
	};
}

async function loadCommandMetadata(
	file: string,
	gateway: CommandStructureGateway,
): Promise<ClinkrCommandMetadata> {
	const imported = await gateway.importModule(file);
	if (!isObject(imported) || typeof imported["metadata"] !== "function") {
		throw new Error(`clinkr: metadata module '${file}' must export metadata()`);
	}
	const metadata = imported["metadata"];
	const module: MetadataModule = { metadata: () => metadata() };
	return validateCommandMetadata(module.metadata(), file);
}

async function loadCommandModule<TContext>(
	file: string,
	gateway: CommandStructureGateway,
): Promise<CommandModule<TContext>> {
	const imported = await gateway.importModule(file);
	if (!isObject(imported) || typeof imported["command"] !== "function") {
		throw new Error(`clinkr: command module '${file}' must export command()`);
	}
	const command = imported["command"];
	return { command: async () => await command() };
}

async function loadGroupModule(
	file: string,
	gateway: CommandStructureGateway,
): Promise<GroupModule> {
	const imported = await gateway.importModule(file);
	if (!isObject(imported)) {
		throw new Error(`clinkr: group module '${file}' must export group()`);
	}
	const group = imported["group"];
	if (typeof group !== "function") {
		throw new Error(`clinkr: group module '${file}' must export group()`);
	}
	return { group: () => group() };
}

function validateCommandMetadata(value: unknown, file: string): ClinkrCommandMetadata {
	return validateRouteDefinition(value, file, "metadata");
}

function validateGroupDefinition(value: unknown, file: string): ClinkrGroupDefinition {
	return validateRouteDefinition(value, file, "group");
}

function validateRouteDefinition(
	value: unknown,
	file: string,
	exportName: "metadata" | "group",
): ClinkrCommandMetadata {
	if (!isObject(value)) {
		throw new Error(`clinkr: ${exportName}() in '${file}' must return an object`);
	}
	const allowed = new Set(["description", "summary", "helpGroup", "aliases", "hidden"]);
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) {
			throw new Error(`clinkr: ${exportName}() in '${file}' has unsupported field '${key}'`);
		}
	}
	for (const key of ["description", "summary", "helpGroup"] as const) {
		const field = value[key];
		if (field !== undefined && typeof field !== "string") {
			throw new Error(`clinkr: ${exportName}() in '${file}' has invalid '${key}'`);
		}
	}
	if (value["hidden"] !== undefined && typeof value["hidden"] !== "boolean") {
		throw new Error(`clinkr: ${exportName}() in '${file}' has invalid 'hidden'`);
	}
	if (
		value["aliases"] !== undefined &&
		(!Array.isArray(value["aliases"]) ||
			!value["aliases"].every((alias) => typeof alias === "string"))
	) {
		throw new Error(`clinkr: ${exportName}() in '${file}' has invalid 'aliases'`);
	}
	const description = value["description"];
	const summary = value["summary"];
	const helpGroup = value["helpGroup"];
	const aliases = value["aliases"];
	const hidden = value["hidden"];
	return Object.freeze({
		...(typeof description === "string" ? { description } : {}),
		...(typeof summary === "string" ? { summary } : {}),
		...(typeof helpGroup === "string" ? { helpGroup } : {}),
		...(Array.isArray(aliases)
			? {
					aliases: Object.freeze(
						aliases.filter((alias): alias is string => typeof alias === "string"),
					),
				}
			: {}),
		...(typeof hidden === "boolean" ? { hidden } : {}),
	});
}

function routeMetadata(
	name: string,
	definition: ClinkrCommandMetadata | ClinkrGroupDefinition,
): ClinkrRouteMetadata {
	return {
		name,
		...(definition.description === undefined ? {} : { description: definition.description }),
		...(definition.summary === undefined ? {} : { summary: definition.summary }),
		...(definition.helpGroup === undefined ? {} : { helpGroup: definition.helpGroup }),
		...(definition.aliases === undefined ? {} : { aliases: definition.aliases }),
		...(definition.hidden === undefined ? {} : { isHidden: definition.hidden }),
	};
}

function assertAbsoluteCommandDirectory(commandDirectory: string): void {
	if (!isAbsolute(commandDirectory)) {
		throw new Error(`clinkr: commandDirectory must be absolute, received '${commandDirectory}'`);
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
