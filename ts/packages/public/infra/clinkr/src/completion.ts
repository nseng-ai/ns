import type { FieldKind, OptionPlan, PositionalPlan } from "./surface.ts";

export type ClinkrCompletionCandidateType =
	| "command"
	| "option"
	| "option-value"
	| "positional-value";

export interface ClinkrCompletionCandidate {
	value: string;
	type: ClinkrCompletionCandidateType;
	description?: string;
}

export interface ClinkrCompletionRequest {
	/** Tokens after the executable name. Include a trailing empty token after whitespace. */
	words: readonly string[];
}

export interface ClinkrDynamicCompletionRequest extends ClinkrCompletionRequest {
	current: string;
	previous: readonly string[];
	args: readonly string[];
	positionalIndex: number;
}

export type ClinkrDynamicCompletionProvider<TContext> = (
	ctx: TContext,
	request: ClinkrDynamicCompletionRequest,
) =>
	| Promise<ClinkrCompletionResult | readonly ClinkrCompletionCandidate[]>
	| ClinkrCompletionResult
	| readonly ClinkrCompletionCandidate[];

export interface ClinkrCompletionResult {
	candidates: readonly ClinkrCompletionCandidate[];
}

export type ClinkrCompletionShell = "bash" | "zsh" | "fish";

export interface RenderClinkrCompletionScriptOptions {
	commandName: string;
	shell: ClinkrCompletionShell;
	resolverCommand: readonly string[];
}

export interface ClinkrCompletionOptionPlan {
	readonly flags: readonly string[];
	readonly kind: FieldKind;
	readonly description: string;
}

export interface InternalCompletionCandidate {
	readonly value: string;
	readonly type: "command" | "option" | "option-value" | "positional-value";
	readonly description?: string;
}

export interface StructuredCompletionInput {
	readonly options: readonly ClinkrCompletionOptionPlan[];
	readonly positionals: readonly PositionalPlan[];
	readonly previous: readonly string[];
	readonly current: string;
	readonly providerCompletesOptionValues: boolean;
	readonly providerPassesThroughOptions: boolean;
}

export interface StructuredCompletion {
	readonly candidates: readonly InternalCompletionCandidate[];
	readonly positionalIndex: number;
	readonly providerEligible: boolean;
}

export const CLINKR_HELP_OPTIONS: readonly ClinkrCompletionOptionPlan[] = [
	{ flags: ["-h", "--help"], kind: { type: "boolean" }, description: "Display help for command." },
];

export const CLINKR_VERSION_OPTION: ClinkrCompletionOptionPlan = {
	flags: ["-V", "--version"],
	kind: { type: "boolean" },
	description: "Show the package version.",
};

export const CLINKR_RUNTIME_OPTION: ClinkrCompletionOptionPlan = {
	flags: ["--runtime"],
	kind: { type: "boolean" },
	description: "Show CLI runtime diagnostics and exit.",
};

export const CLINKR_RENDERED_COMMAND_OPTIONS: readonly ClinkrCompletionOptionPlan[] = [
	{
		flags: ["--format"],
		kind: { type: "enum", values: ["human", "json", "markdown", "md"] },
		description: "Output format.",
	},
];

export const CLINKR_APP_RENDERED_COMMAND_OPTIONS: readonly ClinkrCompletionOptionPlan[] = [
	{
		flags: ["--format"],
		kind: { type: "enum", values: ["human", "json", "md"] },
		description: "Output format.",
	},
];

export const CLINKR_JSON_SCHEMA_OPTION: ClinkrCompletionOptionPlan = {
	flags: ["--json-schema"],
	kind: { type: "boolean" },
	description: "Print the JSON Schema for this command's input/output and exit.",
};

export function completionOptionFromSurface(option: OptionPlan): ClinkrCompletionOptionPlan {
	return {
		flags: flagsFromCommanderSpec(option.flag),
		kind: option.kind,
		description: option.description,
	};
}

export function completeStructuredCommand(input: StructuredCompletionInput): StructuredCompletion {
	const positionalIndex = completionPositionalIndex(input.options, input.previous);
	return {
		candidates: structuredCandidates(input, positionalIndex),
		positionalIndex,
		providerEligible: isCompletionProviderEligible(input),
	};
}

export function completeOptionNames(
	options: readonly ClinkrCompletionOptionPlan[],
	prefix: string,
): readonly InternalCompletionCandidate[] {
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

export function dedupeCompletionCandidates<TCandidate extends InternalCompletionCandidate>(
	candidates: readonly TCandidate[],
): readonly TCandidate[] {
	const seen = new Set<string>();
	return candidates.filter((candidate) => {
		const key = `${candidate.type}\u0000${candidate.value}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function normalizeCompletionCandidates<TCandidate extends InternalCompletionCandidate>(
	result: { readonly candidates: readonly TCandidate[] } | readonly TCandidate[],
): readonly TCandidate[] {
	return "candidates" in result ? result.candidates : result;
}

function structuredCandidates(
	input: StructuredCompletionInput,
	positionalIndex: number,
): readonly InternalCompletionCandidate[] {
	const equals = input.current.indexOf("=");
	if (equals >= 0) {
		const flag = input.current.slice(0, equals);
		return enumCandidates(
			findCompletionOption(input.options, flag)?.kind,
			input.current.slice(equals + 1),
			"option-value",
			(value) => `${flag}=${value}`,
		);
	}
	const pending = input.previous.at(-1);
	if (pending !== undefined) {
		const option = findCompletionOption(input.options, pending);
		if (option !== undefined && option.kind.type !== "boolean") {
			return enumCandidates(option.kind, input.current, "option-value");
		}
	}
	if (input.current.startsWith("-")) return completeOptionNames(input.options, input.current);
	return enumCandidates(
		input.positionals[positionalIndex]?.kind,
		input.current,
		"positional-value",
	);
}

function isCompletionProviderEligible(input: StructuredCompletionInput): boolean {
	if (input.current.startsWith("-")) return input.providerPassesThroughOptions;
	const pending = input.previous.at(-1);
	if (pending === undefined) return true;
	const option = findCompletionOption(input.options, pending);
	if (option === undefined || option.kind.type === "boolean") return true;
	return input.providerCompletesOptionValues;
}

function completionPositionalIndex(
	options: readonly ClinkrCompletionOptionPlan[],
	args: readonly string[],
): number {
	let result = 0;
	for (let index = 0; index < args.length; index += 1) {
		const word = args[index];
		if (word === undefined) continue;
		if (word.startsWith("-")) {
			const option = findCompletionOption(options, flagNameFromToken(word));
			if (option !== undefined && option.kind.type !== "boolean" && !word.includes("=")) index += 1;
			continue;
		}
		result += 1;
	}
	return result;
}

function enumCandidates(
	kind: FieldKind | undefined,
	prefix: string,
	type: "option-value" | "positional-value",
	render: (value: string) => string = (value) => value,
): readonly InternalCompletionCandidate[] {
	if (kind?.type !== "enum") return [];
	return kind.values
		.filter((value) => value.startsWith(prefix))
		.map((value) => ({ value: render(value), type }));
}

function findCompletionOption(
	options: readonly ClinkrCompletionOptionPlan[],
	flag: string,
): ClinkrCompletionOptionPlan | undefined {
	return options.find((option) => option.flags.includes(flag));
}

function flagNameFromToken(word: string): string {
	const equalsIndex = word.indexOf("=");
	return equalsIndex < 0 ? word : word.slice(0, equalsIndex);
}

export function renderCompletionCandidatesNewline<TCandidate extends { readonly value: string }>(
	result: { readonly candidates: readonly TCandidate[] } | readonly TCandidate[],
): string {
	const candidates = "candidates" in result ? result.candidates : result;
	if (candidates.length === 0) return "";
	return `${candidates.map((candidate) => candidate.value).join("\n")}\n`;
}

export function renderClinkrCompletionScript(options: RenderClinkrCompletionScriptOptions): string {
	const resolver = shellWords([options.commandName, ...options.resolverCommand]);
	switch (options.shell) {
		case "bash":
			return renderBashCompletionScript(options.commandName, resolver);
		case "zsh":
			return renderZshCompletionScript(options.commandName, resolver);
		case "fish":
			return renderFishCompletionScript(options.commandName, resolver);
	}
}

function flagsFromCommanderSpec(spec: string): readonly string[] {
	return spec
		.split(",")
		.map((part) => part.trim().split(/\s+/)[0])
		.filter((flag): flag is string => flag !== undefined && flag.startsWith("-"));
}

function renderBashCompletionScript(commandName: string, resolver: string): string {
	const functionName = `_${safeShellIdentifier(commandName)}_completion`;
	return `${functionName}() {
\tlocal -a candidates
\tmapfile -t candidates < <(${resolver} -- "\${COMP_WORDS[@]:1}")
\tCOMPREPLY=( $(compgen -W "\${candidates[*]}" -- "\${COMP_WORDS[COMP_CWORD]}") )
}
complete -F ${functionName} ${shellWord(commandName)}
`;
}

function renderZshCompletionScript(commandName: string, resolver: string): string {
	const functionName = `_${safeShellIdentifier(commandName)}_completion`;
	return `#compdef ${commandName}
${functionName}() {
\tlocal -a candidates
\tcandidates=("\${(@f)$(${resolver} -- "\${words[@]:1}")}")
\tcompadd -- "$candidates[@]"
}
compdef ${functionName} ${shellWord(commandName)}
`;
}

function renderFishCompletionScript(commandName: string, resolver: string): string {
	return `complete -c ${shellWord(commandName)} -f -a '(${resolver} -- (commandline -opc)[2..-1])'
`;
}

function shellWords(words: readonly string[]): string {
	return words.map(shellWord).join(" ");
}

function shellWord(word: string): string {
	return `'${word.replaceAll("'", `'"'"'`)}'`;
}

function safeShellIdentifier(value: string): string {
	return value.replace(/[^A-Za-z0-9_]/g, "_");
}
