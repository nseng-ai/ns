import type { FieldKind, OptionPlan } from "./surface.ts";

export type ClinkrCompletionShell = "bash" | "zsh" | "fish";

export interface ClinkrCompletionOptionPlan {
	readonly flags: readonly string[];
	readonly kind: FieldKind;
	readonly description: string;
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

export function renderCompletionCandidatesNewline<TCandidate extends { readonly value: string }>(
	result: { readonly candidates: readonly TCandidate[] } | readonly TCandidate[],
): string {
	const candidates = "candidates" in result ? result.candidates : result;
	if (candidates.length === 0) return "";
	return `${candidates.map((candidate) => candidate.value).join("\n")}\n`;
}

export function renderClinkrCompletionScript(options: {
	readonly commandName: string;
	readonly shell: ClinkrCompletionShell;
	readonly resolverCommand: readonly string[];
}): string {
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
