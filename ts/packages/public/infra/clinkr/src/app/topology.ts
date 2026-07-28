import type { ClinkrGroupDefinition } from "./command-definition.ts";
import type { LoadedSelectedCommand } from "./selected-command.ts";

export interface SourceCommand<TContext> {
	readonly metadata: LoadedSelectedCommand<TContext>["metadata"];
	readonly load: () => Promise<LoadedSelectedCommand<TContext>>;
}

export interface SourceGroup {
	readonly definition: ClinkrGroupDefinition;
}

export interface SourceScope<TContext> {
	readonly defaultCommand?: SourceCommand<TContext>;
	readonly commands: ReadonlyMap<string, SourceCommand<TContext>>;
	readonly groups: ReadonlyMap<string, SourceGroup>;
}

export interface TopologySource<TContext> {
	readonly label: string;
	open(path: readonly string[]): Promise<SourceScope<TContext>>;
}

export interface OpenedRoute<TContext> {
	readonly source: TopologySource<TContext>;
	readonly command: SourceCommand<TContext>;
	readonly path: readonly string[];
}

export interface OpenedScope<TContext> {
	readonly defaultCommand?: OpenedRoute<TContext>;
	readonly commands: ReadonlyMap<string, OpenedRoute<TContext>>;
	readonly groups: ReadonlyMap<
		string,
		{ readonly source: TopologySource<TContext>; readonly definition: ClinkrGroupDefinition }
	>;
}

const CANONICAL_ROUTE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function canonicalPath(path: readonly string[]): string {
	return path.length === 0 ? "<root>" : path.join(" ");
}

export function validateRouteName(name: string, routePath: readonly string[]): void {
	if (!CANONICAL_ROUTE_NAME.test(name)) {
		throw new Error(
			`clinkr: invalid canonical route name ${JSON.stringify(name)} at ${canonicalPath(routePath)}`,
		);
	}
}

export function validateSourceLabel(label: string): void {
	if (label.trim() === "") throw new Error("clinkr: source label must be non-empty");
}

export function validateCommandMetadata(
	metadata: LoadedSelectedCommand<unknown>["metadata"],
	name: string | undefined,
	path: readonly string[],
): void {
	validateText(metadata.description, "description", path);
	validateAliases(metadata.aliases, name, path);
}

export function validateGroupDefinition(
	definition: ClinkrGroupDefinition,
	name: string,
	path: readonly string[],
): void {
	validateCommandMetadata(definition, name, path);
	if (definition.summary !== undefined) validateText(definition.summary, "summary", path);
	if (definition.helpGroup !== undefined) validateText(definition.helpGroup, "helpGroup", path);
}

function validateText(value: string, field: string, path: readonly string[]): void {
	if (value.trim() === "") {
		throw new Error(`clinkr: ${field} must be non-empty at ${canonicalPath(path)}`);
	}
}

function validateAliases(
	aliases: readonly string[] | undefined,
	name: string | undefined,
	path: readonly string[],
): void {
	if (aliases === undefined) return;
	const seen = new Set<string>();
	for (const alias of aliases) {
		validateRouteName(alias, path);
		if (alias === name)
			throw new Error(
				`clinkr: alias ${JSON.stringify(alias)} equals its route name at ${canonicalPath(path)}`,
			);
		if (seen.has(alias))
			throw new Error(`clinkr: duplicate alias ${JSON.stringify(alias)} at ${canonicalPath(path)}`);
		seen.add(alias);
	}
}

interface TopologyOptions<TContext> {
	readonly sources: readonly TopologySource<TContext>[];
	/**
	 * Route names owned by app features that the composing app runtime has
	 * actually enabled. The caller constructing the topology — never a
	 * topology source — decides this set, and a disabled optional feature must
	 * not reserve its route name. The upcoming completion runtime is the known
	 * producer: it is expected to pass `"completion"` only when completion is
	 * enabled for the app. Nothing is reserved by default.
	 */
	readonly reservedNames?: ReadonlySet<string>;
}

/** Canonical ownership record for one registered alias within a scope. */
interface AliasOwner<TContext> {
	readonly canonicalName: string;
	readonly source: TopologySource<TContext>;
}

export class ClinkrTopology<TContext> {
	private readonly sources: readonly TopologySource<TContext>[];
	private readonly reservedNames: ReadonlySet<string>;
	private readonly opened = new Map<string, Promise<OpenedScope<TContext>>>();
	private readonly sourceScopes = new Map<
		TopologySource<TContext>,
		Map<string, Promise<SourceScope<TContext>>>
	>();
	private readonly selected = new Map<
		TopologySource<TContext>,
		Map<string, Promise<LoadedSelectedCommand<TContext>>>
	>();

	constructor(options: TopologyOptions<TContext>) {
		this.sources = [...options.sources];
		this.reservedNames = new Set(options.reservedNames);
	}

	async open(path: readonly string[]): Promise<OpenedScope<TContext>> {
		return getOrCreateTransactional(this.opened, canonicalPath(path), () =>
			this.openUncached(path),
		);
	}

	async load(route: OpenedRoute<TContext>): Promise<LoadedSelectedCommand<TContext>> {
		const sourceLoads = getOrCreateSourceCache(this.selected, route.source);
		return getOrCreateTransactional(sourceLoads, canonicalPath(route.path), () =>
			route.command.load(),
		);
	}

	private async openUncached(path: readonly string[]): Promise<OpenedScope<TContext>> {
		let sources = this.sources;
		if (path.length > 0) {
			const parentPath = path.slice(0, -1);
			const name = path.at(-1);
			const parent = await this.open(parentPath);
			const owner = name === undefined ? undefined : parent.groups.get(name)?.source;
			if (owner === undefined) {
				throw new Error(`clinkr: no group at ${canonicalPath(path)}`);
			}
			sources = [owner];
		}
		const scopes = await Promise.all(
			sources.map(async (source) => ({ source, scope: await this.openSource(source, path) })),
		);
		let defaultCommand: OpenedRoute<TContext> | undefined;
		const commands = new Map<string, OpenedRoute<TContext>>();
		const groups = new Map<
			string,
			{ source: TopologySource<TContext>; definition: ClinkrGroupDefinition }
		>();
		const aliases = new Map<string, AliasOwner<TContext>>();
		for (const { source, scope } of scopes) {
			if (scope.defaultCommand !== undefined) {
				if (defaultCommand !== undefined)
					collision(path, { source: defaultCommand.source }, { source }, "command/command");
				defaultCommand = { source, command: scope.defaultCommand, path: [...path] };
			}
			for (const [name, command] of scope.commands) {
				validateSiblingName(
					"command",
					name,
					command.metadata.aliases,
					source,
					path,
					commands,
					groups,
					aliases,
					this.reservedNames,
				);
				commands.set(name, { source, command, path: [...path, name] });
				registerAliases(name, command.metadata.aliases, source, aliases);
			}
			for (const [name, group] of scope.groups) {
				validateSiblingName(
					"group",
					name,
					group.definition.aliases,
					source,
					path,
					commands,
					groups,
					aliases,
					this.reservedNames,
				);
				groups.set(name, { source, definition: group.definition });
				registerAliases(name, group.definition.aliases, source, aliases);
			}
		}
		return { ...(defaultCommand === undefined ? {} : { defaultCommand }), commands, groups };
	}

	private async openSource(
		source: TopologySource<TContext>,
		path: readonly string[],
	): Promise<SourceScope<TContext>> {
		const scopes = getOrCreateSourceCache(this.sourceScopes, source);
		return getOrCreateTransactional(scopes, canonicalPath(path), () => source.open(path));
	}
}

/**
 * One owner for the transactional promise-cache invariant shared by topology
 * scope opening, per-source scope opening, and selected-command loading:
 * concurrent callers share the published in-flight promise, success stays
 * cached for the topology lifetime, and a rejected promise is evicted — only
 * while it is still the published entry — so later callers retry. Errors pass
 * through untranslated.
 */
async function getOrCreateTransactional<K, V>(
	cache: Map<K, Promise<V>>,
	key: K,
	create: () => Promise<V>,
): Promise<V> {
	const existing = cache.get(key);
	if (existing !== undefined) return existing;
	const created = create();
	cache.set(key, created);
	try {
		return await created;
	} catch (error) {
		if (cache.get(key) === created) cache.delete(key);
		throw error;
	}
}

function getOrCreateSourceCache<TContext, V>(
	caches: Map<TopologySource<TContext>, Map<string, Promise<V>>>,
	source: TopologySource<TContext>,
): Map<string, Promise<V>> {
	const existing = caches.get(source);
	if (existing !== undefined) return existing;
	const created = new Map<string, Promise<V>>();
	caches.set(source, created);
	return created;
}

function validateSiblingName<TContext>(
	routeKind: "command" | "group",
	name: string,
	newAliases: readonly string[] | undefined,
	source: TopologySource<TContext>,
	parentPath: readonly string[],
	commands: ReadonlyMap<string, OpenedRoute<TContext>>,
	groups: ReadonlyMap<string, { readonly source: TopologySource<TContext> }>,
	aliases: ReadonlyMap<string, AliasOwner<TContext>>,
	reservedNames: ReadonlySet<string>,
): void {
	const path = [...parentPath, name];
	validateRouteName(name, path);
	if (reservedNames.has(name))
		throw new Error(
			`clinkr: route ${canonicalPath(path)} conflicts with configured reserved name ${JSON.stringify(name)}`,
		);
	const command = commands.get(name);
	if (command !== undefined)
		collision(
			path,
			{ source: command.source },
			{ source },
			routeKind === "command" ? "command/command" : "command/group",
		);
	const group = groups.get(name);
	if (group !== undefined)
		collision(
			path,
			{ source: group.source },
			{ source },
			routeKind === "command" ? "command/group" : "group/group",
		);
	const alias = aliases.get(name);
	if (alias !== undefined)
		collision(
			path,
			{ source: alias.source, canonicalRoute: [...parentPath, alias.canonicalName] },
			{ source },
			"alias/name",
		);
	for (const candidate of newAliases ?? []) {
		if (reservedNames.has(candidate))
			throw new Error(
				`clinkr: alias ${JSON.stringify(candidate)} at ${canonicalPath(path)} conflicts with configured reserved name`,
			);
		const namedCommand = commands.get(candidate);
		if (namedCommand !== undefined)
			collision(
				[...parentPath, candidate],
				{ source: namedCommand.source },
				{ source, canonicalRoute: path },
				"alias/name",
			);
		const namedGroup = groups.get(candidate);
		if (namedGroup !== undefined)
			collision(
				[...parentPath, candidate],
				{ source: namedGroup.source },
				{ source, canonicalRoute: path },
				"alias/name",
			);
		const existingAlias = aliases.get(candidate);
		if (existingAlias !== undefined)
			collision(
				[...parentPath, candidate],
				{
					source: existingAlias.source,
					canonicalRoute: [...parentPath, existingAlias.canonicalName],
				},
				{ source, canonicalRoute: path },
				"alias/alias",
			);
	}
}

function registerAliases<TContext>(
	name: string,
	values: readonly string[] | undefined,
	source: TopologySource<TContext>,
	aliases: Map<string, AliasOwner<TContext>>,
): void {
	for (const alias of values ?? []) aliases.set(alias, { canonicalName: name, source });
}

/**
 * One colliding side of a sibling-name collision. When the side contributes
 * an alias (rather than the collided canonical name itself), `canonicalRoute`
 * names the route that declared the alias so the diagnostic points at the
 * owning declaration.
 */
interface CollisionParty<TContext> {
	readonly source: TopologySource<TContext>;
	readonly canonicalRoute?: readonly string[];
}

function collision<TContext>(
	path: readonly string[],
	first: CollisionParty<TContext>,
	second: CollisionParty<TContext>,
	kind: string,
): never {
	// Sort whole parties by label so diagnostics stay declaration-order
	// independent while each canonical route remains attributed to its own
	// source.
	const parties = [first, second].sort((a, b) =>
		a.source.label < b.source.label ? -1 : a.source.label > b.source.label ? 1 : 0,
	);
	const described = parties.map(describeCollisionParty);
	throw new Error(
		`clinkr: ${kind} collision at ${canonicalPath(path)} between sources ${described[0]} and ${described[1]}`,
	);
}

function describeCollisionParty<TContext>(party: CollisionParty<TContext>): string {
	const label = JSON.stringify(party.source.label);
	return party.canonicalRoute === undefined
		? label
		: `${label} (alias of ${canonicalPath(party.canonicalRoute)})`;
}
