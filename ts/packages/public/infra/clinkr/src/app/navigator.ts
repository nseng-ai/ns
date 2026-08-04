import { optionalEntries } from "@nseng-ai/foundation/primitives";

import { renderClinkrCompletionScript, type ClinkrCompletionShell } from "../completion.ts";
import type { ClinkrGroupDefinition } from "./command-definition.ts";
import { findRootBuiltIn, frameworkRoutingWidth, hasUnescapedHelp } from "./framework-arguments.ts";
import type { LoadedSelectedCommand } from "./selected-command.ts";
import type { ClinkrTopology, OpenedRoute, OpenedScope, TopologyIssue } from "./topology.ts";

export type CompletionNavigationResult<TContext> =
	| { readonly type: "built-in-completion"; readonly args: readonly string[] }
	| {
			readonly type: "scope";
			readonly path: readonly string[];
			readonly scope: OpenedScope<TContext>;
			readonly issues: readonly TopologyIssue[];
	  }
	| {
			readonly type: "command";
			readonly path: readonly string[];
			readonly loaded: LoadedSelectedCommand<TContext>;
			readonly args: readonly string[];
			readonly isRootDefault: boolean;
			readonly issues: readonly TopologyIssue[];
			/** Present only for a scope default, whose children retain precedence. */
			readonly scope?: OpenedScope<TContext>;
	  }
	| { readonly type: "topology-failure"; readonly issues: readonly TopologyIssue[] };

export type NavigationResult<TContext> =
	| { readonly type: "version" }
	| { readonly type: "runtime" }
	| { readonly type: "completion-script"; readonly shell: "bash" | "zsh" | "fish" }
	| { readonly type: "completion-resolve"; readonly words: readonly string[] }
	| { readonly type: "completion-help"; readonly path: "completion" | "resolve" }
	| { readonly type: "completion-invalid"; readonly message: string }
	| {
			readonly type: "command";
			readonly path: readonly string[];
			readonly tail: readonly string[];
			readonly loaded: LoadedSelectedCommand<TContext>;
			readonly issues: readonly TopologyIssue[];
	  }
	| {
			readonly type: "scope-help";
			readonly path: readonly string[];
			readonly scope: OpenedScope<TContext>;
			readonly issues: readonly TopologyIssue[];
			readonly definition?: ClinkrGroupDefinition;
	  }
	| {
			readonly type: "unknown-route";
			readonly path: readonly string[];
			readonly tail: readonly string[];
			readonly issues: readonly TopologyIssue[];
	  }
	| { readonly type: "topology-failure"; readonly issues: readonly TopologyIssue[] };

interface NavigatorOptions<TContext> {
	readonly topology: ClinkrTopology<TContext>;
	readonly commandName: string;
	readonly requiresContext: boolean;
	readonly hasVersion: boolean;
	readonly hasRuntime: boolean;
	readonly hasCompletion: boolean;
}

type RouteTraversal<TContext> =
	| {
			readonly type: "command";
			readonly route: OpenedRoute<TContext>;
			readonly selectedIndex: number;
			readonly routeTokenIndices: ReadonlySet<number>;
			readonly issues: readonly TopologyIssue[];
	  }
	| {
			readonly type: "scope";
			readonly path: readonly string[];
			readonly scope: OpenedScope<TContext>;
			readonly definition?: ClinkrGroupDefinition;
			readonly unresolvedIndex?: number;
			readonly routeTokenIndices: ReadonlySet<number>;
			readonly issues: readonly TopologyIssue[];
			readonly fatalIssues?: readonly TopologyIssue[];
	  };

/** Private incremental traversal owner for every app runtime consumer. */
export class ClinkrNavigator<TContext> {
	private readonly topology: ClinkrTopology<TContext>;
	private readonly commandName: string;
	private readonly requiresContext: boolean;
	private readonly hasVersion: boolean;
	private readonly hasRuntime: boolean;
	private readonly hasCompletion: boolean;

	constructor(options: NavigatorOptions<TContext>) {
		this.topology = options.topology;
		this.commandName = options.commandName;
		this.requiresContext = options.requiresContext;
		this.hasVersion = options.hasVersion;
		this.hasRuntime = options.hasRuntime;
		this.hasCompletion = options.hasCompletion;
	}

	async navigate(argv: readonly string[]): Promise<NavigationResult<TContext>> {
		const rootBuiltIn = findRootBuiltIn(argv);
		if (this.hasVersion && rootBuiltIn === "version") return { type: "version" };
		if (this.hasRuntime && rootBuiltIn === "runtime") return { type: "runtime" };
		const traversal = await this.traverse(argv);
		if (traversal.type === "command") {
			return {
				type: "command",
				path: traversal.route.path,
				tail: removeRouteTokens(argv, traversal.routeTokenIndices),
				loaded: await this.load(traversal.route),
				issues: traversal.issues,
			};
		}
		if (traversal.fatalIssues !== undefined)
			return { type: "topology-failure", issues: traversal.fatalIssues };
		const { path, scope, definition, unresolvedIndex, routeTokenIndices, issues } = traversal;
		if (
			path.length === 0 &&
			this.hasCompletion &&
			unresolvedIndex !== undefined &&
			argv[unresolvedIndex] === "completion"
		) {
			return navigateCompletion<TContext>(argv.slice(unresolvedIndex + 1));
		}
		const tail = removeRouteTokens(argv, routeTokenIndices);
		if (scope.defaultCommand === undefined) {
			if (tail.length > 0 && !hasUnescapedHelp(tail)) {
				return { type: "unknown-route", path, tail, issues };
			}
			return {
				type: "scope-help",
				path,
				scope,
				issues,
				...optionalEntries({ definition }),
			};
		}
		const loaded = await this.load(scope.defaultCommand);
		if (loaded.selected.kind === "structured" && hasUnescapedHelp(tail)) {
			return {
				type: "scope-help",
				path,
				scope,
				issues,
				...optionalEntries({ definition }),
			};
		}
		return { type: "command", path, tail, loaded, issues };
	}

	renderCompletionScript(shell: ClinkrCompletionShell): string {
		if (!this.hasCompletion) throw new Error("clinkr: completion is not enabled");
		return renderClinkrCompletionScript({
			commandName: this.commandName,
			shell,
			resolverCommand: ["completion", "exec", "resolve"],
		});
	}

	async navigateCompletion(
		words: readonly string[],
	): Promise<CompletionNavigationResult<TContext>> {
		const traversal = await this.traverse(words, true);
		if (traversal.type === "command") {
			return {
				type: "command",
				path: traversal.route.path,
				loaded: await this.load(traversal.route),
				args: words.slice(traversal.selectedIndex + 1),
				isRootDefault: false,
				issues: traversal.issues,
			};
		}
		if (traversal.fatalIssues !== undefined)
			return { type: "topology-failure", issues: traversal.fatalIssues };
		const { path, scope, unresolvedIndex, routeTokenIndices, issues } = traversal;
		if (
			path.length === 0 &&
			this.hasCompletion &&
			unresolvedIndex !== undefined &&
			words[unresolvedIndex] === "completion"
		) {
			return { type: "built-in-completion", args: words.slice(unresolvedIndex + 1) };
		}
		if (scope.defaultCommand !== undefined) {
			return {
				type: "command",
				path,
				loaded: await this.load(scope.defaultCommand),
				args: words.slice(lastRouteTokenIndex(routeTokenIndices) + 1),
				isRootDefault: path.length === 0,
				issues,
				scope,
			};
		}
		return { type: "scope", path, scope, issues };
	}

	private async traverse(
		tokens: readonly string[],
		stopAtEmpty = false,
	): Promise<RouteTraversal<TContext>> {
		let path: readonly string[] = [];
		let scope = await this.topology.open(path);
		let definition: ClinkrGroupDefinition | undefined;
		const routeTokenIndices = new Set<number>();
		const issues: TopologyIssue[] = [...scope.issues];
		let fatalIssues = structuralTopologyIssues(scope.issues);
		for (let index = 0; index < tokens.length; index += 1) {
			if (fatalIssues.length > 0) {
				return {
					type: "scope",
					path,
					scope,
					...optionalEntries({ definition }),
					routeTokenIndices,
					issues,
					fatalIssues,
				};
			}
			const token = tokens[index];
			if (token === undefined || token === "--" || (stopAtEmpty && token === "")) {
				return {
					type: "scope",
					path,
					scope,
					...optionalEntries({ definition }),
					routeTokenIndices,
					issues,
				};
			}
			const frameworkArgumentWidth = frameworkRoutingWidth(tokens, index);
			if (frameworkArgumentWidth > 0) {
				index += frameworkArgumentWidth - 1;
				continue;
			}
			const command = resolveCommand(scope, token);
			if (command !== undefined) {
				routeTokenIndices.add(index);
				return {
					type: "command",
					route: command,
					selectedIndex: index,
					routeTokenIndices,
					issues,
				};
			}
			const group = resolveGroup(scope, token);
			if (group === undefined) {
				const sourceIssues = scope.issues.filter((issue) => issue.type === "source-open");
				return {
					type: "scope",
					path,
					scope,
					...optionalEntries({ definition }),
					unresolvedIndex: index,
					routeTokenIndices,
					issues,
					...optionalEntries({
						fatalIssues: sourceIssues.length === 0 ? undefined : sourceIssues,
					}),
				};
			}
			routeTokenIndices.add(index);
			definition = scope.groups.get(group)?.definition;
			path = [...path, group];
			scope = await this.topology.open(path);
			issues.push(...scope.issues);
			fatalIssues = structuralTopologyIssues(scope.issues);
		}
		return {
			type: "scope",
			path,
			scope,
			...optionalEntries({ definition }),
			routeTokenIndices,
			issues,
			...optionalEntries({ fatalIssues: fatalIssues.length === 0 ? undefined : fatalIssues }),
		};
	}

	async load(route: OpenedRoute<TContext>): Promise<LoadedSelectedCommand<TContext>> {
		const loaded = await this.topology.load(route);
		if ((loaded.selected.definition.requiresContext === true) !== this.requiresContext) {
			throw new Error("clinkr: selected command context mode does not match the app");
		}
		return loaded;
	}
}

function structuralTopologyIssues(issues: readonly TopologyIssue[]): readonly TopologyIssue[] {
	return issues.filter((issue) => issue.type !== "source-open");
}

function navigateCompletion<TContext>(tail: readonly string[]): NavigationResult<TContext> {
	if (tail.length === 1 && hasHelp(tail[0])) return { type: "completion-help", path: "completion" };
	const shell = tail[0];
	if (shell === "bash" || shell === "zsh" || shell === "fish") {
		return tail.length === 1
			? { type: "completion-script", shell }
			: { type: "completion-invalid", message: `unexpected argument ${JSON.stringify(tail[1])}` };
	}
	if (shell !== "exec") {
		return {
			type: "completion-invalid",
			message:
				shell === undefined
					? "missing shell (expected bash, zsh, or fish)"
					: `unknown shell ${JSON.stringify(shell)}`,
		};
	}
	if (tail[1] !== "resolve") {
		return { type: "completion-invalid", message: "expected hidden route exec resolve" };
	}
	if (tail.length === 3 && hasHelp(tail[2])) return { type: "completion-help", path: "resolve" };
	if (tail[2] !== "--") {
		return { type: "completion-invalid", message: "completion resolver requires -- before words" };
	}
	return { type: "completion-resolve", words: tail.slice(3) };
}

function hasHelp(token: string | undefined): boolean {
	return token === "--help" || token === "-h";
}

function removeRouteTokens(
	tokens: readonly string[],
	routeTokenIndices: ReadonlySet<number>,
): readonly string[] {
	return tokens.filter((_, index) => !routeTokenIndices.has(index));
}

function lastRouteTokenIndex(routeTokenIndices: ReadonlySet<number>): number {
	let last = -1;
	for (const index of routeTokenIndices) last = index;
	return last;
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
