import {
	CLINKR_APP_RENDERED_COMMAND_OPTIONS,
	CLINKR_HELP_OPTIONS,
	CLINKR_JSON_SCHEMA_OPTION,
	CLINKR_RUNTIME_OPTION,
	CLINKR_VERSION_OPTION,
	completionOptionFromSurface,
	type ClinkrCompletionOptionPlan,
} from "../completion-support.ts";
import type { FieldKind, PositionalPlan } from "../surface.ts";
import {
	buildCommandSurfacePlan,
	type ClinkrCommandDefinition,
	type ClinkrCompletionCandidate,
	type ClinkrCompletionProviderRequest,
	type ClinkrCompletionRequest,
	type ClinkrCompletionResult,
} from "./command-definition.ts";
import type { ClinkrNavigator } from "./navigator.ts";
import type { OpenedScope } from "./topology.ts";
export interface CompletionRuntimeOptions<TContext, TInvocationOptions> {
	readonly navigator: ClinkrNavigator<TContext>;
	readonly commandName: string;
	readonly hasVersion: boolean;
	readonly hasRuntime: boolean;
	readonly invokeProvider: (
		definition: ClinkrCommandDefinition<TContext>,
		request: ClinkrCompletionProviderRequest,
		options: TInvocationOptions,
	) => Promise<readonly ClinkrCompletionCandidate[]>;
}

export class ClinkrCompletionRuntime<TContext, TInvocationOptions> {
	private readonly options: CompletionRuntimeOptions<TContext, TInvocationOptions>;

	constructor(options: CompletionRuntimeOptions<TContext, TInvocationOptions>) {
		this.options = options;
	}

	async complete(
		request: ClinkrCompletionRequest,
		invocationOptions: TInvocationOptions,
	): Promise<ClinkrCompletionResult> {
		const current = request.words.at(-1) ?? "";
		const previous = request.words.length === 0 ? [] : request.words.slice(0, -1);
		const resolution = await this.options.navigator.navigateCompletion(previous);
		if (resolution.type === "built-in-completion") {
			if (resolution.args.length === 0) {
				return {
					candidates: ["bash", "zsh", "fish"]
						.filter((shell) => shell.startsWith(current))
						.map((value) => ({ value, type: "positional-value" })),
				};
			}
			return { candidates: [] };
		}
		if (resolution.type === "scope") {
			return {
				candidates: dedupe(
					completeScope(resolution.scope, current, resolution.path.length === 0, this.options),
				),
			};
		}
		const scopeCandidates =
			resolution.scope === undefined
				? []
				: completeScope(resolution.scope, current, resolution.path.length === 0, this.options);
		if (resolution.loaded.selected.kind === "raw") {
			return { candidates: dedupe(scopeCandidates) };
		}
		const definition = resolution.loaded.selected.definition;
		const surface = buildDefinitionSurface(
			resolution.path.at(-1) ?? this.options.commandName,
			definition,
		);
		const staticCandidates = completeStructured({
			options: surface.options,
			positionals: surface.positionals,
			previous: resolution.args,
			current,
			isRootDefault: resolution.isRootDefault,
			runtime: this.options,
		});
		const providerRequest: ClinkrCompletionProviderRequest = {
			words: [...request.words],
			current,
			previous,
			args: resolution.args,
			positionalIndex: positionalIndex(surface.options, resolution.args),
			commandPath: [...resolution.path],
		};
		const dynamic = shouldInvokeProvider(surface.options, resolution.args, current)
			? await this.options.invokeProvider(definition, providerRequest, invocationOptions)
			: [];
		return { candidates: dedupe([...scopeCandidates, ...staticCandidates, ...dynamic]) };
	}
}

function completeScope<TContext, TInvocationOptions>(
	scope: OpenedScope<TContext>,
	current: string,
	isRoot: boolean,
	options: CompletionRuntimeOptions<TContext, TInvocationOptions>,
): readonly ClinkrCompletionCandidate[] {
	if (current.startsWith("-")) {
		return optionCandidates(
			[
				...CLINKR_HELP_OPTIONS,
				...(isRoot && options.hasVersion ? [CLINKR_VERSION_OPTION] : []),
				...(isRoot && options.hasRuntime ? [CLINKR_RUNTIME_OPTION] : []),
			],
			current,
		);
	}
	const candidates: ClinkrCompletionCandidate[] = [];
	for (const [name, route] of scope.commands) {
		if (route.command.metadata.hidden === true) continue;
		candidates.push(
			...nameCandidates(
				name,
				route.command.metadata.aliases,
				route.command.metadata.summary ?? route.command.metadata.description,
			),
		);
	}
	for (const [name, group] of scope.groups) {
		if (group.definition.hidden === true) continue;
		candidates.push(
			...nameCandidates(
				name,
				group.definition.aliases,
				group.definition.summary ?? group.definition.description,
			),
		);
	}
	if (isRoot)
		candidates.push({
			value: "completion",
			type: "command",
			description: "Generate shell completion setup.",
		});
	return candidates.filter((candidate) => candidate.value.startsWith(current));
}

function buildDefinitionSurface(name: string, definition: ClinkrCommandDefinition) {
	const surface = buildCommandSurfacePlan(name, definition);
	return {
		positionals: surface.positionals,
		options: [
			...CLINKR_HELP_OPTIONS,
			...surface.options.map(completionOptionFromSurface),
			...CLINKR_APP_RENDERED_COMMAND_OPTIONS,
			{ ...CLINKR_JSON_SCHEMA_OPTION },
			{
				flags: ["--input-json"],
				kind: { type: "boolean" } satisfies FieldKind,
				description: "Read request JSON from stdin.",
			},
		],
	};
}

interface CompleteStructuredOptions<TContext, TInvocationOptions> {
	options: readonly ClinkrCompletionOptionPlan[];
	positionals: readonly PositionalPlan[];
	previous: readonly string[];
	current: string;
	isRootDefault: boolean;
	runtime: CompletionRuntimeOptions<TContext, TInvocationOptions>;
}

function completeStructured<TContext, TInvocationOptions>({
	options,
	positionals,
	previous,
	current,
	isRootDefault,
	runtime,
}: CompleteStructuredOptions<TContext, TInvocationOptions>): readonly ClinkrCompletionCandidate[] {
	const allOptions = [
		...options,
		...(isRootDefault && runtime.hasVersion ? [CLINKR_VERSION_OPTION] : []),
		...(isRootDefault && runtime.hasRuntime ? [CLINKR_RUNTIME_OPTION] : []),
	];
	const equals = current.indexOf("=");
	if (equals >= 0) {
		const flag = current.slice(0, equals);
		return enumCandidates(
			findOption(allOptions, flag)?.kind,
			current.slice(equals + 1),
			"option-value",
			(value) => `${flag}=${value}`,
		);
	}
	const pending = previous.at(-1);
	if (pending !== undefined) {
		const option = findOption(allOptions, pending);
		if (option !== undefined && option.kind.type !== "boolean")
			return enumCandidates(option.kind, current, "option-value");
	}
	if (current.startsWith("-")) return optionCandidates(allOptions, current);
	return enumCandidates(
		positionals[positionalIndex(allOptions, previous)]?.kind,
		current,
		"positional-value",
	);
}

function shouldInvokeProvider(
	options: readonly ClinkrCompletionOptionPlan[],
	args: readonly string[],
	current: string,
): boolean {
	if (current.startsWith("-")) return false;
	const pending = args.at(-1);
	if (pending === undefined) return true;
	const option = findOption(options, pending);
	// Providers own runtime-known values for schema-derived options as well as
	// positionals. Static enum candidates and provider candidates are merged.
	return option === undefined || option.kind.type !== "boolean";
}

function positionalIndex(
	options: readonly ClinkrCompletionOptionPlan[],
	args: readonly string[],
): number {
	let result = 0;
	for (let index = 0; index < args.length; index += 1) {
		const word = args[index];
		if (word === undefined) continue;
		if (word.startsWith("-")) {
			const option = findOption(options, word.split("=", 1)[0] ?? word);
			if (option !== undefined && option.kind.type !== "boolean" && !word.includes("=")) index += 1;
			continue;
		}
		result += 1;
	}
	return result;
}

function optionCandidates(
	options: readonly ClinkrCompletionOptionPlan[],
	prefix: string,
): readonly ClinkrCompletionCandidate[] {
	return options
		.flatMap((option) =>
			option.flags.map((value) => ({
				value,
				type: "option" as const,
				...(option.description === "" ? {} : { description: option.description }),
			})),
		)
		.filter((candidate) => candidate.value.startsWith(prefix));
}
function enumCandidates(
	kind: FieldKind | undefined,
	prefix: string,
	type: "option-value" | "positional-value",
	render: (value: string) => string = (value) => value,
): readonly ClinkrCompletionCandidate[] {
	if (kind?.type !== "enum") return [];
	return kind.values
		.filter((value) => value.startsWith(prefix))
		.map((value) => ({ value: render(value), type }));
}
function findOption(
	options: readonly ClinkrCompletionOptionPlan[],
	flag: string,
): ClinkrCompletionOptionPlan | undefined {
	return options.find((option) => option.flags.includes(flag));
}
function nameCandidates(
	name: string,
	aliases: readonly string[] | undefined,
	description: string,
): readonly ClinkrCompletionCandidate[] {
	return [name, ...(aliases ?? [])].map((value) => ({
		value,
		type: "command",
		...(description === "" ? {} : { description }),
	}));
}
function dedupe(
	candidates: readonly ClinkrCompletionCandidate[],
): readonly ClinkrCompletionCandidate[] {
	const seen = new Set<string>();
	return candidates.filter((candidate) => {
		const key = `${candidate.type}\u0000${candidate.value}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
