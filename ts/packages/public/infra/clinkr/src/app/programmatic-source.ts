import type {
	ClinkrCommandDefinition,
	ClinkrCommandMetadata,
	ClinkrGroupDefinition,
} from "./command-definition.ts";
import { createFilesystemSource } from "./filesystem-source.ts";
import { decodeSelectedCommandDefinition, type LoadedSelectedCommand } from "./selected-command.ts";
import {
	canonicalPath,
	type SourceCommand,
	type SourceScope,
	type TopologySource,
	validateCommandMetadata,
	validateGroupDefinition,
	validateRouteName,
	validateSourceLabel,
} from "./topology.ts";
import type { ClinkrRawCommandDefinition } from "../raw/definition.ts";

export type ClinkrDefinitionLoader<TContext> = () =>
	| ClinkrCommandDefinition<TContext>
	| ClinkrRawCommandDefinition<TContext>
	| Promise<ClinkrCommandDefinition<TContext> | ClinkrRawCommandDefinition<TContext>>;

export interface ClinkrFilesystemMountOptions {
	readonly commandDirectory: string;
}

export interface ClinkrScope<TContext> {
	command(
		name: string,
		metadata: ClinkrCommandMetadata,
		loadDefinition: ClinkrDefinitionLoader<TContext>,
	): void;
	group(
		name: string,
		definition: ClinkrGroupDefinition,
		configure: (scope: ClinkrScope<TContext>) => void,
	): void;
	defaultCommand(
		metadata: ClinkrCommandMetadata,
		loadDefinition: ClinkrDefinitionLoader<TContext>,
	): void;
	filesystem(options: ClinkrFilesystemMountOptions): void;
}

export interface ClinkrSourceOptions {
	readonly label: string;
}

export interface ClinkrFilesystemSourceOptions extends ClinkrFilesystemMountOptions {
	readonly label?: string;
}

export interface ClinkrComposition<TContext> {
	source(options: ClinkrSourceOptions, configure: (scope: ClinkrScope<TContext>) => void): void;
	filesystem(options: ClinkrFilesystemSourceOptions): void;
}

interface DeclaredScope<TContext> {
	defaultCommand?: SourceCommand<TContext>;
	readonly commands: Map<string, SourceCommand<TContext>>;
	readonly groups: Map<string, ClinkrGroupDefinition>;
	filesystem?: TopologySource<TContext>;
}

export function composeSources<TContext>(
	configure: (composition: ClinkrComposition<TContext>) => void,
): readonly TopologySource<TContext>[] {
	const sources: TopologySource<TContext>[] = [];
	const labels = new Set<string>();
	let active = true;
	function requireActive(): void {
		if (!active) throw new Error("clinkr: composition builder cannot be used after construction");
	}
	const composition: ClinkrComposition<TContext> = {
		source: (options, configureScope) => {
			requireActive();
			validateSourceLabel(options.label);
			claimLabel(options.label, labels);
			const source = createProgrammaticSource<TContext>(options.label, configureScope);
			sources.push(source);
		},
		filesystem: (options) => {
			requireActive();
			const label = options.label ?? options.commandDirectory;
			validateSourceLabel(label);
			claimLabel(label, labels);
			sources.push(createFilesystemSource<TContext>({ ...options, label }));
		},
	};
	try {
		configure(composition);
	} finally {
		active = false;
	}
	return sources;
}

function claimLabel(label: string, labels: Set<string>): void {
	if (labels.has(label)) throw new Error(`clinkr: duplicate source label ${JSON.stringify(label)}`);
	labels.add(label);
}

function createProgrammaticSource<TContext>(
	label: string,
	configure: (scope: ClinkrScope<TContext>) => void,
): TopologySource<TContext> {
	const scopes = new Map<string, DeclaredScope<TContext>>();
	const root = createDeclaredScope<TContext>();
	const lifetime = { active: true };
	scopes.set(canonicalPath([]), root);
	try {
		configure(createScopeBuilder({ path: [], declared: root, scopes, label, lifetime }));
	} finally {
		lifetime.active = false;
	}
	return {
		label,
		open: async (path) => {
			const scope = scopes.get(canonicalPath(path)) ?? createDeclaredScope<TContext>();
			let mounted = emptyScope<TContext>();
			for (let depth = path.length; depth >= 0; depth -= 1) {
				const ancestor = scopes.get(canonicalPath(path.slice(0, depth)));
				if (ancestor?.filesystem === undefined) continue;
				mounted = await ancestor.filesystem.open(path.slice(depth));
				break;
			}
			return mergeOwnedScope(path, scope, mounted);
		},
	};
}

function createDeclaredScope<TContext>(): DeclaredScope<TContext> {
	return { commands: new Map(), groups: new Map() };
}

interface CreateScopeBuilderOptions<TContext> {
	readonly path: readonly string[];
	readonly declared: DeclaredScope<TContext>;
	readonly scopes: Map<string, DeclaredScope<TContext>>;
	readonly label: string;
	readonly lifetime: { active: boolean };
}

function createScopeBuilder<TContext>(
	options: CreateScopeBuilderOptions<TContext>,
): ClinkrScope<TContext> {
	const { path, declared, scopes, label, lifetime } = options;
	function requireActive(): void {
		if (!lifetime.active)
			throw new Error("clinkr: scope builder cannot be used after construction");
	}
	return {
		command: (name, metadata, loadDefinition) => {
			requireActive();
			const commandPath = [...path, name];
			validateRouteName(name, commandPath);
			validateCommandMetadata(metadata, name, commandPath);
			claimRoute(declared, name, commandPath, label);
			declared.commands.set(name, createCommand(metadata, loadDefinition, commandPath));
		},
		group: (name, definition, configure) => {
			requireActive();
			const groupPath = [...path, name];
			validateRouteName(name, groupPath);
			validateGroupDefinition(definition, name, groupPath);
			claimRoute(declared, name, groupPath, label);
			declared.groups.set(name, snapshotGroupDefinition(definition));
			const child = createDeclaredScope<TContext>();
			scopes.set(canonicalPath(groupPath), child);
			configure(createScopeBuilder({ path: groupPath, declared: child, scopes, label, lifetime }));
		},
		defaultCommand: (metadata, loadDefinition) => {
			requireActive();
			validateCommandMetadata(metadata, path.at(-1), path);
			if (declared.defaultCommand !== undefined)
				throw new Error(
					`clinkr: duplicate command at ${canonicalPath(path)} in source ${JSON.stringify(label)}`,
				);
			declared.defaultCommand = createCommand(metadata, loadDefinition, path);
		},
		filesystem: (options) => {
			requireActive();
			if (declared.filesystem !== undefined)
				throw new Error(
					`clinkr: duplicate filesystem mount at ${canonicalPath(path)} in source ${JSON.stringify(label)}`,
				);
			declared.filesystem = createFilesystemSource<TContext>({
				commandDirectory: options.commandDirectory,
				label,
			});
		},
	};
}

function claimRoute<TContext>(
	scope: DeclaredScope<TContext>,
	name: string,
	path: readonly string[],
	label: string,
): void {
	if (scope.commands.has(name) || scope.groups.has(name)) {
		throw new Error(
			`clinkr: route collision at ${canonicalPath(path)} in source ${JSON.stringify(label)}`,
		);
	}
}

function createCommand<TContext>(
	metadata: ClinkrCommandMetadata,
	loadDefinition: ClinkrDefinitionLoader<TContext>,
	path: readonly string[],
): SourceCommand<TContext> {
	const snapshot = snapshotCommandMetadata(metadata);
	return {
		metadata: snapshot,
		load: async (): Promise<LoadedSelectedCommand<TContext>> => {
			const decoded = decodeSelectedCommandDefinition<TContext>(await loadDefinition());
			if (decoded === undefined)
				throw new Error(`clinkr: malformed command definition at ${canonicalPath(path)}`);
			return { selected: decoded, metadata: snapshot };
		},
	};
}

function snapshotCommandMetadata(metadata: ClinkrCommandMetadata): ClinkrCommandMetadata {
	return Object.freeze({
		description: metadata.description,
		...(metadata.aliases === undefined ? {} : { aliases: Object.freeze([...metadata.aliases]) }),
	});
}

function snapshotGroupDefinition(definition: ClinkrGroupDefinition): ClinkrGroupDefinition {
	return Object.freeze({
		...snapshotCommandMetadata(definition),
		...(definition.summary === undefined ? {} : { summary: definition.summary }),
		...(definition.hidden === undefined ? {} : { hidden: definition.hidden }),
		...(definition.helpGroup === undefined ? {} : { helpGroup: definition.helpGroup }),
	});
}

function emptyScope<TContext>(): SourceScope<TContext> {
	return { commands: new Map(), groups: new Map() };
}

function mergeOwnedScope<TContext>(
	path: readonly string[],
	declared: DeclaredScope<TContext>,
	mounted: SourceScope<TContext>,
): SourceScope<TContext> {
	if (declared.defaultCommand !== undefined && mounted.defaultCommand !== undefined) {
		throw new Error(`clinkr: command collision at ${canonicalPath(path)} within one source`);
	}
	const commands = new Map(mounted.commands);
	const groups = new Map(mounted.groups);
	for (const [name, command] of declared.commands) {
		if (commands.has(name) || groups.has(name))
			throw new Error(
				`clinkr: route collision at ${canonicalPath([...path, name])} within one source`,
			);
		commands.set(name, command);
	}
	for (const [name, group] of declared.groups) {
		if (commands.has(name) || groups.has(name))
			throw new Error(
				`clinkr: route collision at ${canonicalPath([...path, name])} within one source`,
			);
		groups.set(name, { definition: group });
	}
	return {
		...(declared.defaultCommand === undefined && mounted.defaultCommand === undefined
			? {}
			: { defaultCommand: declared.defaultCommand ?? mounted.defaultCommand }),
		commands,
		groups,
	};
}
