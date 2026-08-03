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

type CollisionKind =
	| "command/command"
	| "command/group"
	| "group/group"
	| "alias/name"
	| "alias/alias"
	| "default/default";

export type TopologyIssue =
	| {
			readonly type: "source-open";
			readonly path: readonly string[];
			readonly sourceLabel: string;
			readonly error: unknown;
	  }
	| {
			readonly type: "collision";
			readonly path: readonly string[];
			readonly kind: CollisionKind;
			readonly parties: readonly [CollisionPartyDescription, CollisionPartyDescription];
	  }
	| {
			readonly type: "reserved-name";
			readonly path: readonly string[];
			readonly sourceLabel: string;
			readonly canonicalRoute: readonly string[];
			readonly name: string;
	  };

interface CollisionPartyDescription {
	readonly sourceLabel: string;
	readonly canonicalRoute?: readonly string[];
}

export interface OpenedScope<TContext> {
	readonly defaultCommand?: OpenedRoute<TContext>;
	readonly commands: ReadonlyMap<string, OpenedRoute<TContext>>;
	readonly groups: ReadonlyMap<
		string,
		{ readonly source: TopologySource<TContext>; readonly definition: ClinkrGroupDefinition }
	>;
	readonly issues: readonly TopologyIssue[];
	readonly unavailableNames: ReadonlyMap<string, readonly TopologyIssue[]>;
	readonly defaultIssues: readonly TopologyIssue[];
}

const CANONICAL_ROUTE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function canonicalPath(path: readonly string[]): string {
	return path.length === 0 ? "<root>" : path.join(" ");
}

export function formatTopologyIssue(issue: TopologyIssue): string {
	if (issue.type === "source-open") {
		const detail = issue.error instanceof Error ? issue.error.message : String(issue.error);
		return `clinkr: source ${JSON.stringify(issue.sourceLabel)} failed to open scope ${canonicalPath(issue.path)}: ${detail}`;
	}
	if (issue.type === "reserved-name") {
		return `clinkr: route ${canonicalPath(issue.canonicalRoute)} from source ${JSON.stringify(issue.sourceLabel)} conflicts with configured reserved name ${JSON.stringify(issue.name)}`;
	}
	const [first, second] = issue.parties.map(describeCollisionParty);
	return `clinkr: ${issue.kind} collision at ${canonicalPath(issue.path)} between sources ${first} and ${second}`;
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
	if (metadata.summary !== undefined) validateText(metadata.summary, "summary", path);
	if (metadata.helpGroup !== undefined) validateText(metadata.helpGroup, "helpGroup", path);
}

export function validateGroupDefinition(
	definition: ClinkrGroupDefinition,
	name: string,
	path: readonly string[],
): void {
	validateCommandMetadata(definition, name, path);
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
	readonly reservedNames?: ReadonlySet<string>;
}

interface RouteContribution<TContext> {
	readonly routeKind: "command" | "group";
	readonly name: string;
	readonly aliases: readonly string[];
	readonly source: TopologySource<TContext>;
	readonly value: SourceCommand<TContext> | SourceGroup;
}

interface NameClaim<TContext> {
	readonly contribution: RouteContribution<TContext>;
	readonly isAlias: boolean;
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
		const labels = new Set<string>();
		for (const source of options.sources) {
			validateSourceLabel(source.label);
			if (labels.has(source.label)) {
				throw new Error(`clinkr: duplicate source label ${JSON.stringify(source.label)}`);
			}
			labels.add(source.label);
		}
		this.sources = [...options.sources];
		this.reservedNames = new Set(options.reservedNames);
	}

	async open(path: readonly string[]): Promise<OpenedScope<TContext>> {
		const key = canonicalPath(path);
		const existing = this.opened.get(key);
		if (existing !== undefined) return existing;
		const created = this.openUncached(path);
		this.opened.set(key, created);
		try {
			const scope = await created;
			if (
				scope.issues.some((issue) => issue.type === "source-open") &&
				this.opened.get(key) === created
			)
				this.opened.delete(key);
			return scope;
		} catch (error) {
			if (this.opened.get(key) === created) this.opened.delete(key);
			throw error;
		}
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
			if (owner === undefined) throw new Error(`clinkr: no group at ${canonicalPath(path)}`);
			sources = [owner];
		}
		const results = await Promise.all(
			sources.map(async (source) => {
				try {
					return { type: "opened" as const, source, scope: await this.openSource(source, path) };
				} catch (error) {
					return { type: "failed" as const, source, error };
				}
			}),
		);
		const issues: TopologyIssue[] = results
			.filter((result) => result.type === "failed")
			.map((result) => ({
				type: "source-open",
				path: [...path],
				sourceLabel: result.source.label,
				error: result.error,
			}));
		const opened = results.filter((result) => result.type === "opened");
		const defaults = opened.flatMap(({ source, scope }) =>
			scope.defaultCommand === undefined ? [] : [{ source, command: scope.defaultCommand }],
		);
		const defaultIssues: TopologyIssue[] = [];
		let defaultCommand: OpenedRoute<TContext> | undefined;
		if (defaults.length === 1) {
			const only = defaults[0];
			if (only !== undefined) defaultCommand = { ...only, path: [...path] };
		} else if (defaults.length > 1) {
			for (let first = 0; first < defaults.length; first += 1) {
				for (let second = first + 1; second < defaults.length; second += 1) {
					const left = defaults[first];
					const right = defaults[second];
					if (left !== undefined && right !== undefined)
						defaultIssues.push(
							collisionIssue({
								path,
								first: left.source,
								second: right.source,
								kind: "default/default",
							}),
						);
				}
			}
		}
		issues.push(...defaultIssues);

		const contributions: RouteContribution<TContext>[] = [];
		for (const { source, scope } of opened) {
			for (const [name, command] of scope.commands) {
				contributions.push({
					routeKind: "command",
					name,
					aliases: command.metadata.aliases ?? [],
					source,
					value: command,
				});
			}
			for (const [name, group] of scope.groups) {
				contributions.push({
					routeKind: "group",
					name,
					aliases: group.definition.aliases ?? [],
					source,
					value: group,
				});
			}
		}
		const claims = new Map<string, NameClaim<TContext>[]>();
		for (const contribution of contributions) {
			addClaim(claims, contribution.name, { contribution, isAlias: false });
			for (const alias of contribution.aliases)
				addClaim(claims, alias, { contribution, isAlias: true });
		}
		const poisoned = new Set<RouteContribution<TContext>>();
		const unavailable = new Map<string, TopologyIssue[]>();
		for (const [name, nameClaims] of claims) {
			if (path.length === 0 && this.reservedNames.has(name)) {
				for (const claim of nameClaims) {
					const issue: TopologyIssue = {
						type: "reserved-name",
						path: [name],
						sourceLabel: claim.contribution.source.label,
						canonicalRoute: [...path, claim.contribution.name],
						name,
					};
					issues.push(issue);
					poisoned.add(claim.contribution);
					addUnavailable(unavailable, name, issue);
				}
			}
			for (let first = 0; first < nameClaims.length; first += 1) {
				for (let second = first + 1; second < nameClaims.length; second += 1) {
					const left = nameClaims[first];
					const right = nameClaims[second];
					if (left === undefined || right === undefined || left.contribution === right.contribution)
						continue;
					const issue = claimCollisionIssue(path, name, left, right);
					issues.push(issue);
					poisoned.add(left.contribution);
					poisoned.add(right.contribution);
					addUnavailable(unavailable, name, issue);
				}
			}
		}
		for (const contribution of poisoned) {
			const related = issues.filter(
				(issue) =>
					issue.type !== "source-open" &&
					(issue.type === "reserved-name"
						? issue.sourceLabel === contribution.source.label &&
							canonicalPath(issue.canonicalRoute) === canonicalPath([...path, contribution.name])
						: issue.parties.some(
								(party) =>
									party.sourceLabel === contribution.source.label &&
									(party.canonicalRoute === undefined ||
										canonicalPath(party.canonicalRoute) ===
											canonicalPath([...path, contribution.name])),
							)),
			);
			for (const name of [contribution.name, ...contribution.aliases])
				for (const issue of related) addUnavailable(unavailable, name, issue);
		}
		const commands = new Map<string, OpenedRoute<TContext>>();
		const groups = new Map<
			string,
			{ source: TopologySource<TContext>; definition: ClinkrGroupDefinition }
		>();
		for (const contribution of contributions) {
			if (poisoned.has(contribution)) continue;
			if (contribution.routeKind === "command") {
				commands.set(contribution.name, {
					source: contribution.source,
					command: contribution.value as SourceCommand<TContext>,
					path: [...path, contribution.name],
				});
			} else {
				groups.set(contribution.name, {
					source: contribution.source,
					definition: (contribution.value as SourceGroup).definition,
				});
			}
		}
		const sortedIssues = [...issues].sort((left, right) =>
			formatTopologyIssue(left).localeCompare(formatTopologyIssue(right)),
		);
		return {
			...(defaultCommand === undefined ? {} : { defaultCommand }),
			commands,
			groups,
			issues: sortedIssues,
			unavailableNames: new Map(
				[...unavailable].map(([name, values]) => [
					name,
					[...values].sort((left, right) =>
						formatTopologyIssue(left).localeCompare(formatTopologyIssue(right)),
					),
				]),
			),
			defaultIssues: [...defaultIssues].sort((left, right) =>
				formatTopologyIssue(left).localeCompare(formatTopologyIssue(right)),
			),
		};
	}

	private async openSource(
		source: TopologySource<TContext>,
		path: readonly string[],
	): Promise<SourceScope<TContext>> {
		const scopes = getOrCreateSourceCache(this.sourceScopes, source);
		return getOrCreateTransactional(scopes, canonicalPath(path), () => source.open(path));
	}
}

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

function addClaim<TContext>(
	claims: Map<string, NameClaim<TContext>[]>,
	name: string,
	claim: NameClaim<TContext>,
): void {
	const existing = claims.get(name);
	if (existing === undefined) claims.set(name, [claim]);
	else existing.push(claim);
}

function addUnavailable(
	unavailable: Map<string, TopologyIssue[]>,
	name: string,
	issue: TopologyIssue,
): void {
	const existing = unavailable.get(name);
	if (existing === undefined) unavailable.set(name, [issue]);
	else if (!existing.includes(issue)) existing.push(issue);
}

function claimCollisionIssue<TContext>(
	parentPath: readonly string[],
	name: string,
	first: NameClaim<TContext>,
	second: NameClaim<TContext>,
): TopologyIssue {
	let kind: CollisionKind;
	if (first.isAlias && second.isAlias) kind = "alias/alias";
	else if (first.isAlias || second.isAlias) kind = "alias/name";
	else if (first.contribution.routeKind === second.contribution.routeKind)
		kind = first.contribution.routeKind === "command" ? "command/command" : "group/group";
	else kind = "command/group";
	return collisionIssue({
		path: [...parentPath, name],
		first: first.contribution.source,
		second: second.contribution.source,
		kind,
		...(first.isAlias ? { firstCanonicalRoute: [...parentPath, first.contribution.name] } : {}),
		...(second.isAlias ? { secondCanonicalRoute: [...parentPath, second.contribution.name] } : {}),
	});
}

interface CollisionIssueOptions<TContext> {
	readonly path: readonly string[];
	readonly first: TopologySource<TContext>;
	readonly second: TopologySource<TContext>;
	readonly kind: CollisionKind;
	readonly firstCanonicalRoute?: readonly string[];
	readonly secondCanonicalRoute?: readonly string[];
}

function collisionIssue<TContext>(options: CollisionIssueOptions<TContext>): TopologyIssue {
	const parties: CollisionPartyDescription[] = [
		{
			sourceLabel: options.first.label,
			...(options.firstCanonicalRoute === undefined
				? {}
				: { canonicalRoute: options.firstCanonicalRoute }),
		},
		{
			sourceLabel: options.second.label,
			...(options.secondCanonicalRoute === undefined
				? {}
				: { canonicalRoute: options.secondCanonicalRoute }),
		},
	].sort((left, right) => left.sourceLabel.localeCompare(right.sourceLabel));
	const left = parties[0];
	const right = parties[1];
	if (left === undefined || right === undefined)
		throw new Error("clinkr: invalid collision parties");
	return {
		type: "collision",
		path: [...options.path],
		kind: options.kind,
		parties: [left, right],
	};
}

function describeCollisionParty(party: CollisionPartyDescription): string {
	const label = JSON.stringify(party.sourceLabel);
	return party.canonicalRoute === undefined
		? label
		: `${label} (alias of ${canonicalPath(party.canonicalRoute)})`;
}
