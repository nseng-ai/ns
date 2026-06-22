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

export interface ClinkrCompletionResult {
	candidates: readonly ClinkrCompletionCandidate[];
}

export interface ClinkrCompletionOptionPlan {
	flags: readonly string[];
	kind: FieldKind;
	description: string;
}

export interface ClinkrCompletionCommandPlan {
	name: string;
	description?: string;
	options: readonly ClinkrCompletionOptionPlan[];
	positionals: readonly PositionalPlan[];
}

export interface ClinkrCompletionGroupPlan {
	name: string;
	description?: string;
	isRoot: boolean;
	isHidden: boolean;
	hasVersionOption: boolean;
	hasRuntimeOption: boolean;
	commands: readonly ClinkrCompletionCommandPlan[];
	groups: readonly ClinkrCompletionGroupPlan[];
	defaultCommand?: ClinkrCompletionCommandPlan;
}

interface CompletionContext {
	group: ClinkrCompletionGroupPlan;
	command?: ClinkrCompletionCommandPlan;
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
	{
		flags: ["--shell-exit-code"],
		kind: { type: "boolean" },
		description: "Use shell-visible Clinkr semantic exit codes; negative exits 1 instead of 0.",
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

/**
 * Complete tokenized user words from a static Clinkr command surface plan.
 * This planner is pure: it never invokes command handlers or performs shell parsing.
 */
export function completeClinkrWords(
	plan: ClinkrCompletionGroupPlan,
	request: ClinkrCompletionRequest,
): ClinkrCompletionResult {
	const current = request.words.at(-1) ?? "";
	const previous = request.words.length === 0 ? [] : request.words.slice(0, -1);
	const context = resolveCompletionContext(plan, previous);
	const candidates =
		context.command === undefined
			? completeGroup(context.group, current)
			: completeCommand(context.command, context.args, current);
	return { candidates: dedupeCandidates(candidates) };
}

function resolveCompletionContext(
	root: ClinkrCompletionGroupPlan,
	words: readonly string[],
): CompletionContext {
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

function completeGroup(
	group: ClinkrCompletionGroupPlan,
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

function completeCommand(
	command: ClinkrCompletionCommandPlan,
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

function groupOptions(group: ClinkrCompletionGroupPlan): readonly ClinkrCompletionOptionPlan[] {
	return [
		...HELP_OPTIONS,
		...(group.isRoot && group.hasVersionOption ? [VERSION_OPTION] : []),
		...(group.isRoot && group.hasRuntimeOption ? [RUNTIME_OPTION] : []),
		...(group.defaultCommand === undefined ? [] : commandOptions(group.defaultCommand)),
	];
}

function commandOptions(
	command: ClinkrCompletionCommandPlan,
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
	if (option === undefined || option.kind.type !== "enum") return [];
	return option.kind.values
		.filter((value) => value.startsWith(valuePrefix))
		.map((value) => ({ value: `${flag}=${value}`, type: "option-value" }));
}

function optionValueCandidates(
	option: ClinkrCompletionOptionPlan,
	prefix: string,
): readonly ClinkrCompletionCandidate[] {
	if (option.kind.type !== "enum") return [];
	return option.kind.values
		.filter((value) => value.startsWith(prefix))
		.map((value) => ({ value, type: "option-value" }));
}

function positionalValueCandidates(
	command: ClinkrCompletionCommandPlan,
	previous: readonly string[],
	prefix: string,
): readonly ClinkrCompletionCandidate[] {
	const positional = command.positionals[positionIndex(command, previous)];
	if (positional === undefined || positional.kind.type !== "enum") return [];
	return positional.kind.values
		.filter((value) => value.startsWith(prefix))
		.map((value) => ({ value, type: "positional-value" }));
}

function positionIndex(command: ClinkrCompletionCommandPlan, args: readonly string[]): number {
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

function filterCandidates(
	candidates: readonly ClinkrCompletionCandidate[],
	prefix: string,
): readonly ClinkrCompletionCandidate[] {
	return candidates.filter((entry) => entry.value.startsWith(prefix));
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
