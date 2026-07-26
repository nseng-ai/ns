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

type CommandDefinition<TContext> =
	| ClinkrCommandDefinition<TContext, z.ZodObject, unknown>
	| ClinkrRawCommandDefinition<TContext>;

interface CommandModule<TContext> {
	metadata(): ClinkrCommandMetadata;
	command(): Promise<CommandDefinition<TContext>> | CommandDefinition<TContext>;
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
			...(options.version === undefined ? {} : { version: options.version }),
			...(options.runtimeInfo === undefined ? {} : { runtimeInfo: options.runtimeInfo }),
			...(options.completion === undefined ? {} : { completion: options.completion }),
		},
		async (appBuilder) => {
			await addCommandStructure(appBuilder, options.commandDirectory, nodeCommandStructureGateway);
			return await appBuilder.define();
		},
	);
}

async function addCommandStructure<TContext>(
	builder: ClinkrAppBuilder<TContext> | ClinkrGroupBuilder<TContext>,
	directory: string,
	gateway: CommandStructureGateway,
): Promise<void> {
	const entries = await gateway.readDirectory(directory);
	const rootCommand = entries.find((entry) => entry.name === "command.ts" && entry.isFile);
	if (rootCommand !== undefined) {
		const module = await loadCommandModule<TContext>(join(directory, rootCommand.name), gateway);
		module.metadata();
		await builder.defaultCommand(async (commandBuilder) =>
			defineFilesystemCommand(commandBuilder, module, undefined),
		);
	}

	const routeDirectories = entries
		.filter((entry) => entry.isDirectory)
		.toSorted((left, right) => left.name.localeCompare(right.name));
	for (const entry of routeDirectories) {
		await addDirectoryRoute(builder, join(directory, entry.name), entry.name, gateway);
	}
}

async function addDirectoryRoute<TContext>(
	builder: ClinkrAppBuilder<TContext> | ClinkrGroupBuilder<TContext>,
	directory: string,
	name: string,
	gateway: CommandStructureGateway,
): Promise<void> {
	const entries = await gateway.readDirectory(directory);
	const hasGroup = entries.some((entry) => entry.name === "group.ts" && entry.isFile);
	const hasCommand = entries.some((entry) => entry.name === "command.ts" && entry.isFile);
	if (!hasGroup && !hasCommand) {
		throw new Error(`clinkr: command directory '${directory}' must contain group.ts or command.ts`);
	}
	if (hasGroup) {
		const module = await loadGroupModule(join(directory, "group.ts"), gateway);
		const definition = validateGroupDefinition(module.group(), join(directory, "group.ts"));
		builder.group(routeMetadata(name, definition), async (groupBuilder) => {
			await addCommandStructure(groupBuilder, directory, gateway);
			return await groupBuilder.define();
		});
		return;
	}

	const module = await loadCommandModule<TContext>(join(directory, "command.ts"), gateway);
	const metadata = validateCommandMetadata(module.metadata(), join(directory, "command.ts"));
	builder.command(routeMetadata(name, metadata), async (commandBuilder) =>
		defineFilesystemCommand(commandBuilder, module, name),
	);
}

async function defineFilesystemCommand<TContext>(
	builder: ClinkrCommandBuilder<TContext>,
	module: CommandModule<TContext>,
	name: string | undefined,
): Promise<ClinkrCommand<TContext>> {
	const definition = await module.command();
	if (!isObject(definition) || !commandDefinitions.has(definition)) {
		throw new Error("clinkr: command() must return a definition created by defineCommand()");
	}
	if (definition.isRawExit === true) {
		if (name === undefined) return await builder.defineDefault(definition);
		return await builder.define({ ...definition, name });
	}
	if (name === undefined) return await builder.defineDefault(definition);
	return await builder.define({ ...definition, name });
}

async function loadCommandModule<TContext>(
	file: string,
	gateway: CommandStructureGateway,
): Promise<CommandModule<TContext>> {
	const imported = await gateway.importModule(file);
	if (!isObject(imported)) {
		throw new Error(`clinkr: command module '${file}' must export metadata()`);
	}
	const metadata = imported["metadata"];
	const command = imported["command"];
	if (typeof metadata !== "function") {
		throw new Error(`clinkr: command module '${file}' must export metadata()`);
	}
	if (typeof command !== "function") {
		throw new Error(`clinkr: command module '${file}' must export command()`);
	}
	return {
		metadata: () => metadata(),
		command: async () => await command(),
	};
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
