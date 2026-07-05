import type { ObjectiveStatusFilter } from "./operations/list-objectives.ts";

import type { ObjectiveCliCompletionItem } from "./objective-candidates.ts";

const OBJECTIVE_LIST_ARG_COMPLETIONS = [
	"--names",
	"--minimal",
	"--status",
	"--help",
	"-h",
] as const;
const OBJECTIVE_LIST_STATUS_VALUES = [
	"all",
	"active",
	"open",
	"closed",
] as const satisfies readonly ObjectiveStatusFilter[];

export interface ObjectiveListParsedArgs {
	args: string[];
	isHelpRequested: boolean;
}

export type ObjectiveListArgsParseResult =
	| { type: "valid"; args: ObjectiveListParsedArgs }
	| { type: "invalid"; message: string };

type ForbiddenObjectiveListArgsParseResult =
	| { type: "valid" }
	| { type: "invalid"; message: string };

type ObjectiveListStatusParseResult =
	| { type: "valid"; value: ObjectiveStatusFilter }
	| { type: "invalid"; message: string };

export function parseObjectiveListArgs(rawArgs: string): ObjectiveListArgsParseResult {
	return parseObjectiveListArgTokens(tokenizeArgumentString(rawArgs));
}

export function parseObjectiveListArgTokens(
	tokens: readonly string[],
): ObjectiveListArgsParseResult {
	const forbiddenArgsResult = findForbiddenObjectiveListArg(tokens);
	if (forbiddenArgsResult.type === "invalid") {
		return forbiddenArgsResult;
	}

	const args: string[] = [];
	let isHelpRequested = false;
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index] ?? "";
		if (token === "--help" || token === "-h") {
			isHelpRequested = true;
			continue;
		}
		if (token === "--names" || token === "--minimal") {
			args.push(token);
			continue;
		}
		if (token === "--status") {
			const value = tokens[index + 1];
			if (!value || value.startsWith("--")) {
				return {
					type: "invalid",
					message: "--status requires one of: all, active, open, closed.",
				};
			}
			const parsedStatus = parseObjectiveListStatus(value);
			if (parsedStatus.type === "invalid") {
				return parsedStatus;
			}
			args.push("--status", parsedStatus.value);
			index += 1;
			continue;
		}
		if (token.startsWith("--status=")) {
			const parsedStatus = parseObjectiveListStatus(token.slice("--status=".length));
			if (parsedStatus.type === "invalid") {
				return parsedStatus;
			}
			args.push("--status", parsedStatus.value);
			continue;
		}
		if (token === "--current" || token.startsWith("--current=")) {
			return {
				type: "invalid",
				message: "--current is no longer supported by the checkout-local Objective list command.",
			};
		}
		if (token === "--view" || token.startsWith("--view=")) {
			return {
				type: "invalid",
				message: "--view is no longer supported by the checkout-local Objective list command.",
			};
		}

		return {
			type: "invalid",
			message: `Unsupported /ns:objective:list argument: ${token}.`,
		};
	}

	return { type: "valid", args: { args, isHelpRequested } };
}

export function completeObjectiveListArgs(prefix: string): ObjectiveCliCompletionItem[] | null {
	const tokens = tokenizeArgumentString(prefix);
	const endsWithWhitespace = /\s$/.test(prefix);
	const currentToken = endsWithWhitespace ? "" : (tokens[tokens.length - 1] ?? "");
	const previousToken = endsWithWhitespace ? tokens[tokens.length - 1] : tokens[tokens.length - 2];

	if (currentToken.startsWith("--status=")) {
		const valuePrefix = currentToken.slice("--status=".length);
		return matchingCompletions(
			OBJECTIVE_LIST_STATUS_VALUES.map((value) => `--status=${value}`),
			`--status=${valuePrefix}`,
		);
	}

	const candidates =
		previousToken === "--status" ? OBJECTIVE_LIST_STATUS_VALUES : OBJECTIVE_LIST_ARG_COMPLETIONS;
	return matchingCompletions(candidates, currentToken);
}

function tokenizeArgumentString(args: string): string[] {
	return args.trim().split(/\s+/).filter(Boolean);
}

function matchingCompletions(
	candidates: readonly string[],
	currentToken: string,
): ObjectiveCliCompletionItem[] | null {
	const filtered = candidates.filter((candidate) => candidate.startsWith(currentToken));
	if (filtered.length === 0) {
		return null;
	}

	return filtered.map((value) => ({ value, label: value }));
}

function findForbiddenObjectiveListArg(
	tokens: readonly string[],
): ForbiddenObjectiveListArgsParseResult {
	for (const token of tokens) {
		if (token === "--format" || token.startsWith("--format=")) {
			return {
				type: "invalid",
				message: "--format is controlled by the Pi extension and is not supported here.",
			};
		}
		if (token === "--json-schema" || token.startsWith("--json-schema=")) {
			return {
				type: "invalid",
				message: "--json-schema is not supported by /ns:objective:list.",
			};
		}
	}
	return { type: "valid" };
}

function parseObjectiveListStatus(value: string): ObjectiveListStatusParseResult {
	if ((OBJECTIVE_LIST_STATUS_VALUES as readonly string[]).includes(value)) {
		return { type: "valid", value: value as ObjectiveStatusFilter };
	}

	return {
		type: "invalid",
		message: `Unsupported --status value: ${value || "(empty)"}. Expected all, active, open, or closed.`,
	};
}
