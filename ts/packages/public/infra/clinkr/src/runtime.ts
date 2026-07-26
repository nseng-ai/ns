import { z } from "zod";

import type { ClinkrCompletionRequest, ClinkrCompletionResult } from "./completion.ts";
import {
	LegacyClinkrGroup,
	type ClinkrCommandSpec,
	type ClinkrCompleteAsyncOptions,
	type ClinkrGroupOptions,
	type ClinkrRunOptions,
	type DefaultCommandSpec,
	type DefaultRawCommandSpec,
	type RawCommandSpec,
} from "./group.ts";

const builderProvenance = new WeakMap<object, symbol>();
const nodeOwners = new WeakMap<object, symbol>();

export interface ClinkrRouteMetadata {
	name: string;
	description?: string;
	/** Short summary for parent help lists. */
	summary?: string;
	/** Parent help section heading. */
	helpGroup?: string;
	aliases?: readonly string[];
	isHidden?: boolean;
}

export interface ClinkrCompletionProviderError<TContext> {
	readonly error: unknown;
	readonly commandPath: readonly string[];
	readonly request: ClinkrCompletionRequest;
	readonly context: TContext;
}

export interface ClinkrCompletionOptions<TContext> {
	readonly onProviderError?: (event: ClinkrCompletionProviderError<TContext>) => void;
}

export interface ClinkrAppOptions<TContext = void> {
	name: string;
	moduleUrl: string;
	description?: string;
	version?: string;
	runtimeInfo?: () => string;
	completion?: ClinkrCompletionOptions<TContext>;
}

export interface ClinkrCompleteOptions<TContext> {
	context: TContext;
}

type NamedCommandSpec<TContext> =
	| ClinkrCommandSpec<TContext, z.ZodObject, unknown>
	| RawCommandSpec<TContext>;
type DefaultSpec<TContext> =
	| DefaultCommandSpec<TContext, z.ZodObject, unknown>
	| DefaultRawCommandSpec<TContext>;

interface ScopeDefinition<TContext> {
	readonly defaultCommand: LazyNode<ClinkrCommand<TContext>> | undefined;
	readonly routes: readonly RouteDefinition<TContext>[];
	readonly legacyImports: readonly LegacyClinkrGroup<TContext>[];
}

export interface ClinkrRouteSelection {
	readonly path: readonly string[];
}

interface CommandRouteDefinition<TContext> {
	readonly type: "command";
	readonly metadata: Readonly<ClinkrRouteMetadata>;
	readonly load: LazyNode<ClinkrCommand<TContext>>;
}

interface GroupRouteDefinition<TContext> {
	readonly type: "group";
	readonly metadata: Readonly<ClinkrRouteMetadata>;
	readonly load: LazyNode<ClinkrGroup<TContext>>;
}

type RouteDefinition<TContext> = CommandRouteDefinition<TContext> | GroupRouteDefinition<TContext>;

type BuilderModule<TBuilder, TNode> = {
	build(builder: TBuilder): Promise<TNode>;
};

class LazyNode<TNode extends object> {
	private readonly create: () => Promise<TNode>;
	private readonly appOwner: symbol;
	private inFlight: Promise<TNode> | undefined;
	private cached: TNode | undefined;

	constructor(appOwner: symbol, create: () => Promise<TNode>) {
		this.appOwner = appOwner;
		this.create = create;
	}

	async load(): Promise<TNode> {
		if (this.cached !== undefined) return this.cached;
		if (this.inFlight !== undefined) return await this.inFlight;
		const attempt = this.create().then((node) => {
			claimNode(node, this.appOwner);
			this.cached = node;
			return node;
		});
		this.inFlight = attempt;
		try {
			return await attempt;
		} finally {
			if (this.cached === undefined) this.inFlight = undefined;
		}
	}
}

export class ClinkrCommand<TContext> {
	readonly spec: NamedCommandSpec<TContext> | DefaultSpec<TContext>;

	constructor(provenance: symbol, spec: NamedCommandSpec<TContext> | DefaultSpec<TContext>) {
		this.spec = Object.freeze({ ...spec });
		builderProvenance.set(this, provenance);
		Object.freeze(this);
	}
}

export class ClinkrGroup<TContext> {
	readonly defaultCommand: LazyNode<ClinkrCommand<TContext>> | undefined;
	readonly routes: readonly RouteDefinition<TContext>[];
	readonly legacyImports: readonly LegacyClinkrGroup<TContext>[];

	constructor(provenance: symbol, scope: ScopeDefinition<TContext>) {
		this.defaultCommand = scope.defaultCommand;
		this.routes = Object.freeze([...scope.routes]);
		this.legacyImports = Object.freeze([...scope.legacyImports]);
		builderProvenance.set(this, provenance);
		Object.freeze(this);
	}
}

abstract class ScopeBuilder<TContext, TNode extends object> {
	protected readonly appOwner: symbol;
	protected readonly moduleUrl: string;
	protected readonly provenance = Symbol("clinkr-builder");
	private readonly routes: RouteDefinition<TContext>[] = [];
	private readonly legacyImports: LegacyClinkrGroup<TContext>[] = [];
	private defaultNode: LazyNode<ClinkrCommand<TContext>> | undefined;
	private isDefined = false;

	constructor(appOwner: symbol, moduleUrl: string) {
		this.appOwner = appOwner;
		this.moduleUrl = moduleUrl;
	}

	async defaultCommand(
		build: (commandBuilder: ClinkrCommandBuilder<TContext>) => Promise<ClinkrCommand<TContext>>,
	): Promise<this> {
		this.assertOpen();
		if (this.defaultNode !== undefined)
			throw new Error("clinkr: scope already has a default command");
		this.defaultNode = new LazyNode(this.appOwner, async () => {
			const commandBuilder = new ClinkrCommandBuilder<TContext>(
				this.appOwner,
				this.moduleUrl,
				true,
			);
			const node = await build(commandBuilder);
			assertBuilderResult(node, commandBuilder.provenanceToken, "default command");
			return node;
		});
		return this;
	}

	command(
		metadata: ClinkrRouteMetadata,
		build: (commandBuilder: ClinkrCommandBuilder<TContext>) => Promise<ClinkrCommand<TContext>>,
	): this {
		this.assertOpen();
		const frozenMetadata = freezeMetadata(metadata);
		this.routes.push({
			type: "command",
			metadata: frozenMetadata,
			load: new LazyNode(this.appOwner, async () => {
				const commandBuilder = new ClinkrCommandBuilder<TContext>(
					this.appOwner,
					this.moduleUrl,
					false,
				);
				const node = await build(commandBuilder);
				assertBuilderResult(node, commandBuilder.provenanceToken, `command '${metadata.name}'`);
				return node;
			}),
		});
		return this;
	}

	group(
		metadata: ClinkrRouteMetadata,
		build: (groupBuilder: ClinkrGroupBuilder<TContext>) => Promise<ClinkrGroup<TContext>>,
	): this {
		this.assertOpen();
		const frozenMetadata = freezeMetadata(metadata);
		this.routes.push({
			type: "group",
			metadata: frozenMetadata,
			load: new LazyNode(this.appOwner, async () => {
				const groupBuilder = new ClinkrGroupBuilder<TContext>(this.appOwner, this.moduleUrl);
				const node = await build(groupBuilder);
				assertBuilderResult(node, groupBuilder.provenanceToken, `group '${metadata.name}'`);
				return node;
			}),
		});
		return this;
	}

	/** Migration-only: lower an existing mutable group through this app runtime. */
	importLegacyClinkrGroupForMigration(group: LegacyClinkrGroup<TContext>): this {
		this.assertOpen();
		this.legacyImports.push(group);
		return this;
	}

	protected finalizeScope(): ScopeDefinition<TContext> {
		this.assertOpen();
		validateRoutes(this.routes);
		this.isDefined = true;
		return Object.freeze({
			defaultCommand: this.defaultNode,
			routes: Object.freeze([...this.routes]),
			legacyImports: Object.freeze([...this.legacyImports]),
		});
	}

	protected assertOpen(): void {
		if (this.isDefined) throw new Error("clinkr: builder has already been defined");
	}

	abstract define(): Promise<TNode>;
}

export class ClinkrCommandBuilder<TContext> {
	readonly provenanceToken = Symbol("clinkr-command-builder");
	private readonly moduleUrl: string;
	private readonly isDefault: boolean;
	private isDefined = false;

	constructor(_appOwner: symbol, moduleUrl: string, isDefault: boolean) {
		this.moduleUrl = moduleUrl;
		this.isDefault = isDefault;
	}

	async define(spec: RawCommandSpec<TContext>): Promise<ClinkrCommand<TContext>>;
	async define<S extends z.ZodObject, T>(
		spec: ClinkrCommandSpec<TContext, S, T>,
	): Promise<ClinkrCommand<TContext>>;
	async define<S extends z.ZodObject, T>(
		spec: ClinkrCommandSpec<TContext, S, T> | RawCommandSpec<TContext>,
	): Promise<ClinkrCommand<TContext>> {
		if (this.isDefault) throw new Error("clinkr: use defineDefault() for a default command");
		return this.finalize(spec as NamedCommandSpec<TContext>);
	}

	async defineDefault(spec: DefaultRawCommandSpec<TContext>): Promise<ClinkrCommand<TContext>>;
	async defineDefault<S extends z.ZodObject, T>(
		spec: DefaultCommandSpec<TContext, S, T>,
	): Promise<ClinkrCommand<TContext>>;
	async defineDefault<S extends z.ZodObject, T>(
		spec: DefaultCommandSpec<TContext, S, T> | DefaultRawCommandSpec<TContext>,
	): Promise<ClinkrCommand<TContext>> {
		if (!this.isDefault) throw new Error("clinkr: named command builders cannot define a default");
		return this.finalize(spec as DefaultSpec<TContext>);
	}

	async import(specifier: string): Promise<ClinkrCommand<TContext>> {
		assertRelativeSpecifier(specifier);
		const imported: unknown = await import(new URL(specifier, this.moduleUrl).href);
		assertBuilderModule<ClinkrCommandBuilder<TContext>, ClinkrCommand<TContext>>(
			imported,
			specifier,
		);
		return await imported.build(this);
	}

	private finalize(
		spec: NamedCommandSpec<TContext> | DefaultSpec<TContext>,
	): ClinkrCommand<TContext> {
		if (this.isDefined) throw new Error("clinkr: command builder has already been defined");
		this.isDefined = true;
		return new ClinkrCommand(this.provenanceToken, spec);
	}
}

export class ClinkrGroupBuilder<TContext> extends ScopeBuilder<TContext, ClinkrGroup<TContext>> {
	get provenanceToken(): symbol {
		return this.provenance;
	}

	async define(): Promise<ClinkrGroup<TContext>> {
		return new ClinkrGroup(this.provenance, this.finalizeScope());
	}

	async import(specifier: string): Promise<ClinkrGroup<TContext>> {
		this.assertOpen();
		assertRelativeSpecifier(specifier);
		const imported: unknown = await import(new URL(specifier, this.moduleUrl).href);
		assertBuilderModule<ClinkrGroupBuilder<TContext>, ClinkrGroup<TContext>>(imported, specifier);
		return await imported.build(this);
	}
}

export class ClinkrAppBuilder<TContext> extends ScopeBuilder<TContext, ClinkrApp<TContext>> {
	private readonly options: Readonly<ClinkrAppOptions<TContext>>;

	constructor(appOwner: symbol, options: ClinkrAppOptions<TContext>) {
		super(appOwner, options.moduleUrl);
		this.options = Object.freeze({ ...options });
	}

	get provenanceToken(): symbol {
		return this.provenance;
	}

	async define(): Promise<ClinkrApp<TContext>> {
		return new ClinkrApp(this.provenance, this.appOwner, this.options, this.finalizeScope());
	}
}

export class ClinkrApp<TContext = void> {
	readonly name: string;
	private readonly owner: symbol;
	private readonly options: Readonly<ClinkrAppOptions<TContext>>;
	private readonly scope: ScopeDefinition<TContext>;

	constructor(
		provenance: symbol,
		owner: symbol,
		options: Readonly<ClinkrAppOptions<TContext>>,
		scope: ScopeDefinition<TContext>,
	) {
		this.name = options.name;
		this.owner = owner;
		this.options = options;
		this.scope = scope;
		builderProvenance.set(this, provenance);
		Object.freeze(this);
	}

	static async create<TContext = void>(
		options: ClinkrAppOptions<TContext>,
		build: (appBuilder: ClinkrAppBuilder<TContext>) => Promise<ClinkrApp<TContext>>,
	): Promise<ClinkrApp<TContext>> {
		const owner = Symbol(`clinkr-app:${options.name}`);
		const appBuilder = new ClinkrAppBuilder<TContext>(owner, options);
		const app = await build(appBuilder);
		assertBuilderResult(app, appBuilder.provenanceToken, "app");
		claimNode(app, owner);
		return app;
	}

	async run(
		argv: readonly string[],
		...options: TContext extends void
			? [options?: Omit<ClinkrRunOptions<void>, "context">]
			: [options: ClinkrRunOptions<TContext>]
	): Promise<number> {
		const invocation = options[0] as ClinkrRunOptions<TContext> | undefined;
		return await this.runWithContext(argv, {
			context: invocation?.context as TContext,
			...(invocation?.io === undefined ? {} : { io: invocation.io }),
		});
	}

	async selectRoute(words: readonly string[]): Promise<ClinkrRouteSelection> {
		return { path: await selectRoutePath(this.scope, words) };
	}

	/** Run with an explicit context from a generic application host. */
	async runWithContext(
		argv: readonly string[],
		options: ClinkrRunOptions<TContext>,
	): Promise<number> {
		const { runtime } = await this.buildRuntime(argv, argv[0] !== "--help" && argv[0] !== "-h");
		return await runtime.run(argv, options);
	}

	async complete(
		request: ClinkrCompletionRequest,
		...options: TContext extends void
			? [options?: Omit<ClinkrCompleteOptions<void>, "context">]
			: [options: ClinkrCompleteOptions<TContext>]
	): Promise<ClinkrCompletionResult> {
		const invocation = options[0] as ClinkrCompleteOptions<TContext> | undefined;
		const { runtime, selectedPath } = await this.buildRuntime(
			request.words,
			request.words[0]?.startsWith("-") === true,
		);
		const context = invocation?.context as TContext;
		const onProviderError = this.options.completion?.onProviderError;
		const commandPath = onProviderError === undefined ? [] : selectedPath;
		const runtimeOptions: ClinkrCompleteAsyncOptions<TContext> = {
			context,
			...(onProviderError === undefined
				? {}
				: {
						onDynamicCompletionError: (error: unknown) => {
							try {
								onProviderError({ error, commandPath, request, context });
							} catch {
								// Completion must preserve static fallback even when observation fails.
							}
						},
					}),
		};
		return await runtime.completeAsync(request, runtimeOptions);
	}

	private async buildRuntime(
		argv: readonly string[],
		loadDefaultCommand: boolean,
	): Promise<{
		runtime: LegacyClinkrGroup<TContext>;
		selectedPath: readonly string[];
	}> {
		const runtime = new LegacyClinkrGroup<TContext>({
			name: this.name,
			...(this.options.description === undefined ? {} : { description: this.options.description }),
			validateOutcomes: this.scope.legacyImports.length === 0,
			...(this.options.version === undefined ? {} : { version: this.options.version }),
			...(this.options.runtimeInfo === undefined ? {} : { runtimeInfo: this.options.runtimeInfo }),
		});
		if (argv[0] === "--version" || argv[0] === "-V" || argv[0] === "--runtime") {
			return { runtime, selectedPath: [] };
		}
		const selectedPath = await materializeScope(
			runtime,
			this.scope,
			argv,
			this.owner,
			loadDefaultCommand,
		);
		return { runtime, selectedPath };
	}
}

async function materializeScope<TContext>(
	runtime: LegacyClinkrGroup<TContext>,
	scope: ScopeDefinition<TContext>,
	argv: readonly string[],
	owner: symbol,
	loadDefaultCommand: boolean,
): Promise<readonly string[]> {
	const selected = selectNamedRoute(scope.routes, argv[0]);
	if (scope.defaultCommand !== undefined && selected === undefined && loadDefaultCommand) {
		registerDefault(runtime, await scope.defaultCommand.load());
	}
	for (const legacyImport of scope.legacyImports) {
		runtime.importLegacyClinkrGroupForMigration(legacyImport);
	}
	let selectedPath: readonly string[] = [];
	for (const route of scope.routes) {
		if (route.type === "command") {
			const command = route === selected ? await route.load.load() : placeholderCommand<TContext>();
			if (route === selected) selectedPath = [route.metadata.name];
			claimNode(command, owner);
			registerNamed(runtime, route.metadata, command);
			continue;
		}
		const child = new LegacyClinkrGroup<TContext>({
			...groupOptions(route.metadata),
			validateOutcomes: true,
		});
		if (route === selected) {
			const group = await route.load.load();
			claimNode(group, owner);
			selectedPath = [
				route.metadata.name,
				...(await materializeScope(child, group, argv.slice(1), owner, loadDefaultCommand)),
			];
		}
		runtime.group(child);
	}
	return selectedPath;
}

function selectNamedRoute<TContext>(
	routes: readonly RouteDefinition<TContext>[],
	word: string | undefined,
): RouteDefinition<TContext> | undefined {
	if (word === undefined || word.startsWith("-")) return undefined;
	return routes.find(
		(route) => route.metadata.name === word || route.metadata.aliases?.includes(word) === true,
	);
}

async function selectRoutePath<TContext>(
	scope: ScopeDefinition<TContext>,
	words: readonly string[],
): Promise<readonly string[]> {
	const route = selectNamedRoute(scope.routes, words[0]);
	if (route === undefined || route.type === "command") {
		return route === undefined ? [] : [route.metadata.name];
	}
	const group = await route.load.load();
	return [route.metadata.name, ...(await selectRoutePath(group, words.slice(1)))];
}

function registerNamed<TContext>(
	runtime: LegacyClinkrGroup<TContext>,
	metadata: Readonly<ClinkrRouteMetadata>,
	command: ClinkrCommand<TContext>,
): void {
	const spec = command.spec;
	const routed = {
		...spec,
		name: metadata.name,
		...(metadata.description === undefined ? {} : { description: metadata.description }),
		...(metadata.summary === undefined ? {} : { summary: metadata.summary }),
		...(metadata.helpGroup === undefined ? {} : { helpGroup: metadata.helpGroup }),
		...(metadata.aliases === undefined ? {} : { aliases: metadata.aliases }),
		...(metadata.isHidden === undefined ? {} : { isHidden: metadata.isHidden }),
	};
	if (routed.isRawExit === true) runtime.command(routed);
	else runtime.command(routed);
}

function registerDefault<TContext>(
	runtime: LegacyClinkrGroup<TContext>,
	command: ClinkrCommand<TContext>,
): void {
	if ("name" in command.spec) throw new Error("clinkr: default route returned a named command");
	if (command.spec.isRawExit === true) runtime.defaultCommand(command.spec);
	else runtime.defaultCommand(command.spec);
}

function placeholderCommand<TContext>(): ClinkrCommand<TContext> {
	return new ClinkrCommand(Symbol("clinkr-placeholder"), {
		schema: z.object({}),
		handler: async () => ({ type: "ok", data: undefined }),
	});
}

function groupOptions(metadata: Readonly<ClinkrRouteMetadata>): ClinkrGroupOptions {
	return {
		name: metadata.name,
		...(metadata.description === undefined ? {} : { description: metadata.description }),
		...(metadata.helpGroup === undefined ? {} : { helpGroup: metadata.helpGroup }),
		...(metadata.aliases === undefined ? {} : { aliases: metadata.aliases }),
		...(metadata.isHidden === undefined ? {} : { isHidden: metadata.isHidden }),
	};
}

function freezeMetadata(metadata: ClinkrRouteMetadata): Readonly<ClinkrRouteMetadata> {
	return Object.freeze({
		...metadata,
		...(metadata.aliases === undefined ? {} : { aliases: Object.freeze([...metadata.aliases]) }),
	});
}

function validateRoutes<TContext>(routes: readonly RouteDefinition<TContext>[]): void {
	const occupied = new Map<string, string>();
	for (const route of routes) {
		validateRouteName(route.metadata.name, "name");
		for (const candidate of [route.metadata.name, ...(route.metadata.aliases ?? [])]) {
			validateRouteName(candidate, candidate === route.metadata.name ? "name" : "alias");
			const existing = occupied.get(candidate);
			if (existing !== undefined) {
				throw new Error(
					`clinkr: route '${route.metadata.name}' conflicts with '${existing}' at '${candidate}'`,
				);
			}
			occupied.set(candidate, route.metadata.name);
		}
	}
}

function validateRouteName(value: string, kind: "name" | "alias"): void {
	if (value.length === 0 || value.startsWith("-") || /\s/u.test(value)) {
		throw new Error(`clinkr: invalid route ${kind} '${value}'`);
	}
	if (value === "help") throw new Error(`clinkr: route ${kind} 'help' is reserved`);
}

function assertBuilderResult(node: object, provenance: symbol, label: string): void {
	if (builderProvenance.get(node) !== provenance) {
		throw new Error(`clinkr: ${label} callback returned an object from a different builder`);
	}
}

function claimNode(node: object, owner: symbol): void {
	const existing = nodeOwners.get(node);
	if (existing !== undefined && existing !== owner) {
		throw new Error("clinkr: finalized node already belongs to another app");
	}
	nodeOwners.set(node, owner);
}

function assertRelativeSpecifier(specifier: string): void {
	if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
		throw new Error(`clinkr: builder import must be relative, received '${specifier}'`);
	}
}

function assertBuilderModule<TBuilder, TNode>(
	value: unknown,
	specifier: string,
): asserts value is BuilderModule<TBuilder, TNode> {
	if (typeof value !== "object" || value === null || !("build" in value)) {
		throw new Error(`clinkr: imported module '${specifier}' must export build(builder)`);
	}
	const build = value.build;
	if (typeof build !== "function") {
		throw new Error(`clinkr: imported module '${specifier}' must export build(builder)`);
	}
}
