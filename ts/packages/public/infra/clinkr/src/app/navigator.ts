import { renderClinkrCompletionScript, type ClinkrCompletionShell } from "../completion-support.ts";
import type { ClinkrGroupDefinition } from "./command-definition.ts";
import { findRootBuiltIn, frameworkRoutingWidth, hasUnescapedHelp } from "./framework-arguments.ts";
import type { LoadedSelectedCommand } from "./selected-command.ts";
import type { ClinkrTopology, OpenedRoute, OpenedScope } from "./topology.ts";

export type CompletionNavigationResult<TContext> =
	| { readonly type: "built-in-completion"; readonly args: readonly string[] }
	| {
			readonly type: "scope";
			readonly path: readonly string[];
			readonly scope: OpenedScope<TContext>;
	  }
	| {
			readonly type: "command";
			readonly path: readonly string[];
			readonly loaded: LoadedSelectedCommand<TContext>;
			readonly args: readonly string[];
			readonly isRootDefault: boolean;
			/** Present only for a scope default, whose children retain precedence. */
			readonly scope?: OpenedScope<TContext>;
	  };

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
	readonly commandName: string;
	readonly requiresContext: boolean;
	readonly hasVersion: boolean;
	readonly hasRuntime: boolean;
	readonly hasCompletion: boolean;
}

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
			if (path.length === 0 && this.hasCompletion && token === "completion") {
				return navigateCompletion<TContext>(argv.slice(index + 1));
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
		if (this.hasCompletion && words[0] === "completion") {
			return { type: "built-in-completion", args: words.slice(1) };
		}
		let path: readonly string[] = [];
		let scope = await this.topology.open(path);
		for (let index = 0; index < words.length; index += 1) {
			const word = words[index];
			if (word === undefined || word === "") break;
			const command = resolveCommand(scope, word);
			if (command !== undefined) {
				return {
					type: "command",
					path: command.path,
					loaded: await this.load(command),
					args: words.slice(index + 1),
					isRootDefault: false,
				};
			}
			const group = resolveGroup(scope, word);
			if (group !== undefined) {
				path = [...path, group];
				scope = await this.topology.open(path);
				continue;
			}
			if (scope.defaultCommand !== undefined) {
				return {
					type: "command",
					path,
					loaded: await this.load(scope.defaultCommand),
					args: words.slice(index),
					isRootDefault: path.length === 0,
					scope,
				};
			}
			break;
		}
		if (scope.defaultCommand !== undefined) {
			return {
				type: "command",
				path,
				loaded: await this.load(scope.defaultCommand),
				args: words,
				isRootDefault: path.length === 0,
				scope,
			};
		}
		return { type: "scope", path, scope };
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
