import { Argument, InvalidArgumentError, Option } from "commander";

import type { OptionPlan, PositionalPlan } from "./surface.ts";

export type CommanderArgumentRequiredness = "commander" | "schema";

export interface BuildCommanderArgumentOptions {
	readonly requiredness: CommanderArgumentRequiredness;
}

export interface BuildCommanderOptionOptions {
	readonly applyDefault: boolean;
}

export function buildCommanderArgument(
	plan: PositionalPlan,
	options: BuildCommanderArgumentOptions,
): Argument {
	const name = plan.isVariadic ? `${plan.name}...` : plan.name;
	const term = options.requiredness === "commander" && plan.isRequired ? `<${name}>` : `[${name}]`;
	const argument = new Argument(term, plan.description);
	if (plan.kind.type === "number") argument.argParser(parseNumberValue);
	if (plan.kind.type === "integer") argument.argParser(parseIntegerValue);
	if (plan.kind.type === "enum") argument.choices([...plan.kind.values]);
	return argument;
}

export function buildCommanderOption(
	plan: OptionPlan,
	options: BuildCommanderOptionOptions,
): Option {
	const option = new Option(plan.flag, plan.description === "" ? undefined : plan.description);
	switch (plan.kind.type) {
		case "number":
			option.argParser(parseNumberValue);
			break;
		case "integer":
			option.argParser(parseIntegerValue);
			break;
		case "enum":
			option.choices([...plan.kind.values]);
			break;
		case "string-array":
			option.argParser(accumulateValue);
			break;
		case "string":
		case "boolean":
			break;
	}
	if (options.applyDefault && plan.hasDefault) option.default(plan.defaultValue);
	return option;
}

function parseNumberValue(value: string): number {
	const parsed = Number(value);
	if (value.trim() === "" || Number.isNaN(parsed)) {
		throw new InvalidArgumentError("expected a number");
	}
	return parsed;
}

function parseIntegerValue(value: string): number {
	const parsed = parseStrictInteger(value);
	if (parsed === null) {
		throw new InvalidArgumentError("expected an integer");
	}
	return parsed;
}

function parseStrictInteger(value: string): number | null {
	// This parser is intentionally stricter than click-style coercion: decimal digits only,
	// no leading +, no whitespace, no underscores. Callers that need parity with a prior
	// command face should arbitrate that compatibility in the owning package.
	if (!/^-?\d+$/.test(value)) return null;
	return Number(value);
}

function accumulateValue(value: string, previous: string[] | undefined): string[] {
	return [...(previous ?? []), value];
}
