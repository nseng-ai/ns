import type { ClinkrGroupDefinition } from "./command-definition.ts";
import { findRootBuiltIn, frameworkRoutingWidth, hasUnescapedHelp } from "./framework-arguments.ts";
import type { LoadedSelectedCommand } from "./selected-command.ts";
import type { ClinkrTopology, OpenedRoute, OpenedScope } from "./topology.ts";

export type NavigationResult<TContext> =
	| { readonly type: "version" }
	| { readonly type: "runtime" }
	| {
			readonly type: "command";
			readonly path: readonly string[];
			readonly tail: readonly string[];
			readonly loaded: LoadedSelectedCommand<TContext>;
	  }
	| {
			readonly type: "scope-help";
			readonly path: readonly string[];
			readonly scope: OpenedScope<TContext>;
			readonly definition?: ClinkrGroupDefinition;
	  }
	| {
			readonly type: "unknown-route";
			readonly path: readonly string[];
			readonly tail: readonly string[];
	  };

interface NavigatorOptions<TContext> {
	readonly topology: ClinkrTopology<TContext>;
	readonly requiresContext: boolean;
	readonly hasVersion: boolean;
	readonly hasRuntime: boolean;
}

/** Private incremental traversal owner for every app runtime consumer. */
export class ClinkrNavigator<TContext> {
	private readonly topology: ClinkrTopology<TContext>;
	private readonly requiresContext: boolean;
	private readonly hasVersion: boolean;
	private readonly hasRuntime: boolean;

	constructor(options: NavigatorOptions<TContext>) {
		this.topology = options.topology;
		this.requiresContext = options.requiresContext;
		this.hasVersion = options.hasVersion;
		this.hasRuntime = options.hasRuntime;
	}

	async navigate(argv: readonly string[]): Promise<NavigationResult<TContext>> {
		const rootBuiltIn = findRootBuiltIn(argv);
		if (this.hasVersion && rootBuiltIn === "version") return { type: "version" };
		if (this.hasRuntime && rootBuiltIn === "runtime") return { type: "runtime" };
		let path: readonly string[] = [];
		let scope = await this.topology.open(path);
		let definition: ClinkrGroupDefinition | undefined;
		const consumed = new Set<number>();
		for (let index = 0; index < argv.length; index += 1) {
			const token = argv[index];
			if (token === undefined || token === "--") break;
			const frameworkArgumentWidth = frameworkRoutingWidth(argv, index);
			if (frameworkArgumentWidth > 0) {
				index += frameworkArgumentWidth - 1;
				continue;
			}
			const command = resolveCommand(scope, token);
			if (command !== undefined) {
				consumed.add(index);
				return {
					type: "command",
					path: command.path,
					tail: argv.filter((_, candidate) => !consumed.has(candidate)),
					loaded: await this.load(command),
				};
			}
			const group = resolveGroup(scope, token);
			if (group === undefined) break;
			consumed.add(index);
			definition = scope.groups.get(group)?.definition;
			path = [...path, group];
			scope = await this.topology.open(path);
		}
		const tail = argv.filter((_, candidate) => !consumed.has(candidate));
		if (scope.defaultCommand === undefined) {
			if (tail.length > 0 && !hasUnescapedHelp(tail)) {
				return { type: "unknown-route", path, tail };
			}
			return {
				type: "scope-help",
				path,
				scope,
				...(definition === undefined ? {} : { definition }),
			};
		}
		const loaded = await this.load(scope.defaultCommand);
		if (loaded.selected.kind === "structured" && hasUnescapedHelp(tail)) {
			return {
				type: "scope-help",
				path,
				scope,
				...(definition === undefined ? {} : { definition }),
			};
		}
		return { type: "command", path, tail, loaded };
	}

	async loadRootDefault(): Promise<LoadedSelectedCommand<TContext>> {
		const scope = await this.topology.open([]);
		if (scope.defaultCommand === undefined)
			throw new Error("clinkr: root scope has no default command");
		return this.load(scope.defaultCommand);
	}

	async load(route: OpenedRoute<TContext>): Promise<LoadedSelectedCommand<TContext>> {
		const loaded = await this.topology.load(route);
		if ((loaded.selected.definition.requiresContext === true) !== this.requiresContext) {
			throw new Error("clinkr: selected command context mode does not match the app");
		}
		return loaded;
	}
}

function resolveCommand<TContext>(
	scope: OpenedScope<TContext>,
	token: string,
): OpenedRoute<TContext> | undefined {
	const direct = scope.commands.get(token);
	if (direct !== undefined) return direct;
	for (const [name, route] of scope.commands) {
		if (route.command.metadata.aliases?.includes(token) === true) return scope.commands.get(name);
	}
	return undefined;
}

function resolveGroup<TContext>(scope: OpenedScope<TContext>, token: string): string | undefined {
	if (scope.groups.has(token)) return token;
	for (const [name, group] of scope.groups) {
		if (group.definition.aliases?.includes(token) === true) return name;
	}
	return undefined;
}
