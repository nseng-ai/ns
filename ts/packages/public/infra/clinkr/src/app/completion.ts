import {
	CLINKR_APP_RENDERED_COMMAND_OPTIONS,
	CLINKR_HELP_OPTIONS,
	CLINKR_JSON_SCHEMA_OPTION,
	CLINKR_RUNTIME_OPTION,
	CLINKR_VERSION_OPTION,
	completeOptionNames,
	completeStructuredCommand,
	completionOptionFromSurface,
	dedupeCompletionCandidates,
} from "../completion-support.ts";
import type { FieldKind } from "../surface.ts";
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
				candidates: dedupeCompletionCandidates(
					completeScope(resolution.scope, current, resolution.path.length === 0, this.options),
				),
			};
		}
		const scopeCandidates =
			resolution.scope === undefined
				? []
				: completeScope(resolution.scope, current, resolution.path.length === 0, this.options);
		if (resolution.loaded.selected.kind === "raw") {
			return { candidates: dedupeCompletionCandidates(scopeCandidates) };
		}
		const definition = resolution.loaded.selected.definition;
		const surface = buildDefinitionSurface(
			resolution.path.at(-1) ?? this.options.commandName,
			definition,
		);
		const options = [
			...surface.options,
			...(resolution.isRootDefault && this.options.hasVersion ? [CLINKR_VERSION_OPTION] : []),
			...(resolution.isRootDefault && this.options.hasRuntime ? [CLINKR_RUNTIME_OPTION] : []),
		];
		const structured = completeStructuredCommand({
			options,
			positionals: surface.positionals,
			previous: resolution.args,
			current,
			providerCompletesOptionValues: true,
			providerPassesThroughOptions: false,
		});
		const providerRequest: ClinkrCompletionProviderRequest = {
			words: [...request.words],
			current,
			previous,
			args: resolution.args,
			positionalIndex: structured.positionalIndex,
			commandPath: [...resolution.path],
		};
		const dynamic = structured.providerEligible
			? await this.options.invokeProvider(definition, providerRequest, invocationOptions)
			: [];
		return {
			candidates: dedupeCompletionCandidates([
				...scopeCandidates,
				...structured.candidates,
				...dynamic,
			]),
		};
	}
}

function completeScope<TContext, TInvocationOptions>(
	scope: OpenedScope<TContext>,
	current: string,
	isRoot: boolean,
	options: CompletionRuntimeOptions<TContext, TInvocationOptions>,
): readonly ClinkrCompletionCandidate[] {
	if (current.startsWith("-")) {
		return completeOptionNames(
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
