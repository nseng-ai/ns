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

export interface CompleteClinkrWordsAsyncOptions<TContext> {
	context: TContext;
	onDynamicCompletionError?: (error: unknown) => void;
}

export type ClinkrCompletionShell = "bash" | "zsh" | "fish";

export interface RenderClinkrCompletionScriptOptions {
	commandName: string;
	shell: ClinkrCompletionShell;
	resolverCommand: readonly string[];
}

export interface ClinkrCompletionOptionPlan {
	flags: readonly string[];
	kind: FieldKind;
	description: string;
}

export interface ClinkrCompletionCommandPlan<TContext = unknown> {
	name: string;
	description?: string;
	options: readonly ClinkrCompletionOptionPlan[];
	positionals: readonly PositionalPlan[];
	completionProvider?: ClinkrDynamicCompletionProvider<TContext>;
	shouldPassThrough?: boolean;
}

export interface ClinkrCompletionGroupPlan<TContext = unknown> {
	name: string;
	description?: string;
	isRoot: boolean;
	isHidden: boolean;
	hasVersionOption: boolean;
	hasRuntimeOption: boolean;
	commands: readonly ClinkrCompletionCommandPlan<TContext>[];
	groups: readonly ClinkrCompletionGroupPlan<TContext>[];
	defaultCommand?: ClinkrCompletionCommandPlan<TContext>;
}

interface CompletionContext<TContext> {
	group: ClinkrCompletionGroupPlan<TContext>;
	command?: ClinkrCompletionCommandPlan<TContext>;
	args: readonly string[];
}

const HELP_OPTIONS: readonly ClinkrCompletionOptionPlan[] = [
	{ flags: ["-h", "--help"], kind: { type: "boolean" }, description: "Display help for command." },
];

const VERSION_OPTION: ClinkrCompletionOptionPlan = {
	flags: ["-V", "--version"],
	kind: { type: "boolean" },
	description: "Show the package version.",
};

const RUNTIME_OPTION: ClinkrCompletionOptionPlan = {
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

export function renderCompletionCandidatesNewline(
	result: ClinkrCompletionResult | readonly ClinkrCompletionCandidate[],
): string {
	const candidates: readonly ClinkrCompletionCandidate[] =
		"candidates" in result ? result.candidates : result;
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

/**
 * Complete tokenized user words from a static Clinkr command surface plan.
 * This planner is pure: it never invokes command handlers or performs shell parsing.
 */
export function completeClinkrWords<TContext = unknown>(
	plan: ClinkrCompletionGroupPlan<TContext>,
	request: ClinkrCompletionRequest,
): ClinkrCompletionResult {
	const staticCompletion = resolveStaticCompletion(plan, request);
	return { candidates: dedupeCandidates(staticCompletion.candidates) };
}

export async function completeClinkrWordsAsync<TContext>(
	plan: ClinkrCompletionGroupPlan<TContext>,
	request: ClinkrCompletionRequest,
	options: CompleteClinkrWordsAsyncOptions<TContext>,
): Promise<ClinkrCompletionResult> {
	const staticCompletion = resolveStaticCompletion(plan, request);
	const command = staticCompletion.context.command;
	const provider = command?.completionProvider;
	if (
		command === undefined ||
		provider === undefined ||
		!shouldRunDynamicProvider(staticCompletion)
	) {
		return { candidates: dedupeCandidates(staticCompletion.candidates) };
	}
	try {
		const dynamicResult = await provider(options.context, {
			...request,
			current: staticCompletion.current,
			previous: staticCompletion.previous,
			args: staticCompletion.context.args,
			positionalIndex: positionIndex(command, staticCompletion.context.args),
		});
		return {
			candidates: dedupeCandidates([
				...staticCompletion.candidates,
				...normalizeCompletionCandidates(dynamicResult),
			]),
		};
	} catch (error) {
		options.onDynamicCompletionError?.(error);
		return { candidates: dedupeCandidates(staticCompletion.candidates) };
	}
}

function resolveStaticCompletion<TContext>(
	plan: ClinkrCompletionGroupPlan<TContext>,
	request: ClinkrCompletionRequest,
): {
	current: string;
	previous: readonly string[];
	context: CompletionContext<TContext>;
	candidates: readonly ClinkrCompletionCandidate[];
} {
	const current = request.words.at(-1) ?? "";
	const previous = request.words.length === 0 ? [] : request.words.slice(0, -1);
	const context = resolveCompletionContext(plan, previous);
	const candidates =
		context.command === undefined
			? completeGroup(context.group, current)
			: completeCommand(context.command, context.args, current);
	return { current, previous, context, candidates };
}

function resolveCompletionContext<TContext>(
	root: ClinkrCompletionGroupPlan<TContext>,
	words: readonly string[],
): CompletionContext<TContext> {
	let group = root;
	for (let index = 0; index < words.length; index += 1) {
		const word = words[index];
		if (word === undefined || word === "") return { group, args: words.slice(index) };
		const childGroup = group.groups.find((candidate) => candidate.name === word);
		if (childGroup !== undefined) {
			group = childGroup;
			continue;
		}
		const command = group.commands.find((candidate) => candidate.name === word);
		if (command !== undefined) return { group, command, args: words.slice(index + 1) };
		if (group.defaultCommand !== undefined) {
			return { group, command: group.defaultCommand, args: words.slice(index) };
		}
		return { group, args: words.slice(index) };
	}
	return { group, args: [] };
}

function completeGroup<TContext>(
	group: ClinkrCompletionGroupPlan<TContext>,
	current: string,
): readonly ClinkrCompletionCandidate[] {
	const options = groupOptions(group);
	if (current.startsWith("-")) return optionCandidates(options, current);
	const commandCandidates: ClinkrCompletionCandidate[] = [
		...group.commands.map((command) => candidate(command.name, "command", command.description)),
		...group.groups
			.filter((child) => !child.isHidden)
			.map((child) => candidate(child.name, "command", child.description)),
	];
	const positionalCandidates =
		group.defaultCommand === undefined
			? []
			: positionalValueCandidates(group.defaultCommand, [], current);
	return filterCandidates([...commandCandidates, ...positionalCandidates], current);
}

function completeCommand<TContext>(
	command: ClinkrCompletionCommandPlan<TContext>,
	previous: readonly string[],
	current: string,
): readonly ClinkrCompletionCandidate[] {
	const options = commandOptions(command);
	const equalsValueCandidates = optionEqualsValueCandidates(options, current);
	if (equalsValueCandidates.length > 0) return equalsValueCandidates;
	const pendingOptionFlag = previous.at(-1);
	if (pendingOptionFlag !== undefined) {
		const pendingOption = findOption(options, pendingOptionFlag);
		if (pendingOption !== undefined && expectsSeparateValue(pendingOption, pendingOptionFlag)) {
			return optionValueCandidates(pendingOption, current);
		}
	}
	if (current.startsWith("-")) return optionCandidates(options, current);
	return positionalValueCandidates(command, previous, current);
}

function groupOptions<TContext>(
	group: ClinkrCompletionGroupPlan<TContext>,
): readonly ClinkrCompletionOptionPlan[] {
	return [
		...HELP_OPTIONS,
		...(group.isRoot && group.hasVersionOption ? [VERSION_OPTION] : []),
		...(group.isRoot && group.hasRuntimeOption ? [RUNTIME_OPTION] : []),
		...(group.defaultCommand === undefined ? [] : commandOptions(group.defaultCommand)),
	];
}

function commandOptions<TContext>(
	command: ClinkrCompletionCommandPlan<TContext>,
): readonly ClinkrCompletionOptionPlan[] {
	return [...HELP_OPTIONS, ...command.options];
}

function optionCandidates(
	options: readonly ClinkrCompletionOptionPlan[],
	prefix: string,
): readonly ClinkrCompletionCandidate[] {
	return filterCandidates(
		options.flatMap((option) =>
			option.flags.map((flag) => candidate(flag, "option", option.description)),
		),
		prefix,
	);
}

function optionEqualsValueCandidates(
	options: readonly ClinkrCompletionOptionPlan[],
	current: string,
): readonly ClinkrCompletionCandidate[] {
	const equalsIndex = current.indexOf("=");
	if (equalsIndex < 0) return [];
	const flag = current.slice(0, equalsIndex);
	const valuePrefix = current.slice(equalsIndex + 1);
	const option = findOption(options, flag);
	if (option === undefined) return [];
	return enumValueCandidates(option.kind, valuePrefix, (value) => ({
		value: `${flag}=${value}`,
		type: "option-value",
	}));
}

function optionValueCandidates(
	option: ClinkrCompletionOptionPlan,
	prefix: string,
): readonly ClinkrCompletionCandidate[] {
	return enumValueCandidates(option.kind, prefix, (value) => ({ value, type: "option-value" }));
}

function positionalValueCandidates<TContext>(
	command: ClinkrCompletionCommandPlan<TContext>,
	previous: readonly string[],
	prefix: string,
): readonly ClinkrCompletionCandidate[] {
	const positional = command.positionals[positionIndex(command, previous)];
	if (positional === undefined) return [];
	return enumValueCandidates(positional.kind, prefix, (value) => ({
		value,
		type: "positional-value",
	}));
}

function enumValueCandidates(
	kind: FieldKind,
	prefix: string,
	buildCandidate: (value: string) => ClinkrCompletionCandidate,
): readonly ClinkrCompletionCandidate[] {
	if (kind.type !== "enum") return [];
	return kind.values.filter((value) => value.startsWith(prefix)).map(buildCandidate);
}

function positionIndex<TContext>(
	command: ClinkrCompletionCommandPlan<TContext>,
	args: readonly string[],
): number {
	let index = 0;
	for (let offset = 0; offset < args.length; offset += 1) {
		const word = args[offset];
		if (word === undefined) continue;
		if (word.startsWith("-")) {
			const option = findOption(commandOptions(command), flagNameFromToken(word));
			if (option !== undefined && expectsSeparateValue(option, word)) offset += 1;
			continue;
		}
		index += 1;
	}
	return index;
}

function expectsSeparateValue(option: ClinkrCompletionOptionPlan, word: string): boolean {
	return option.kind.type !== "boolean" && !word.includes("=");
}

function findOption(
	options: readonly ClinkrCompletionOptionPlan[],
	flag: string,
): ClinkrCompletionOptionPlan | undefined {
	return options.find((option) => option.flags.includes(flag));
}

function flagNameFromToken(word: string): string {
	const equalsIndex = word.indexOf("=");
	if (equalsIndex < 0) return word;
	return word.slice(0, equalsIndex);
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
	local -a candidates
	mapfile -t candidates < <(${resolver} -- "\${COMP_WORDS[@]:1}")
	COMPREPLY=( $(compgen -W "\${candidates[*]}" -- "\${COMP_WORDS[COMP_CWORD]}") )
}
complete -F ${functionName} ${shellWord(commandName)}
`;
}

function renderZshCompletionScript(commandName: string, resolver: string): string {
	const functionName = `_${safeShellIdentifier(commandName)}_completion`;
	return `#compdef ${commandName}
${functionName}() {
	local -a candidates
	candidates=("\${(@f)$(${resolver} -- "\${words[@]:1}")}")
	compadd -- "$candidates[@]"
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

function filterCandidates(
	candidates: readonly ClinkrCompletionCandidate[],
	prefix: string,
): readonly ClinkrCompletionCandidate[] {
	return candidates.filter((entry) => entry.value.startsWith(prefix));
}

function normalizeCompletionCandidates(
	result: ClinkrCompletionResult | readonly ClinkrCompletionCandidate[],
): readonly ClinkrCompletionCandidate[] {
	return "candidates" in result ? result.candidates : result;
}

function shouldRunDynamicProvider<TContext>(completion: {
	current: string;
	context: CompletionContext<TContext>;
}): boolean {
	const command = completion.context.command;
	if (command === undefined) return false;
	if (completion.current.startsWith("-")) return command.shouldPassThrough === true;
	const pendingOptionFlag = completion.context.args.at(-1);
	if (pendingOptionFlag === undefined) return true;
	const pendingOption = findOption(commandOptions(command), pendingOptionFlag);
	return pendingOption === undefined || !expectsSeparateValue(pendingOption, pendingOptionFlag);
}

function dedupeCandidates(
	candidates: readonly ClinkrCompletionCandidate[],
): readonly ClinkrCompletionCandidate[] {
	const seen = new Set<string>();
	const deduped: ClinkrCompletionCandidate[] = [];
	for (const entry of candidates) {
		const key = `${entry.type}\u0000${entry.value}`;
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(entry);
	}
	return deduped;
}

function candidate(
	value: string,
	type: ClinkrCompletionCandidateType,
	description: string | undefined,
): ClinkrCompletionCandidate {
	return {
		value,
		type,
		...(description === undefined || description === "" ? {} : { description }),
	};
}
