import { Option } from "commander";
import { z } from "zod";

export type FieldKind =
	| { type: "string" }
	| { type: "number" }
	| { type: "boolean" }
	| { type: "enum"; values: readonly string[] }
	| { type: "string-array" };

export interface OptionPlan {
	key: string;
	flag: string;
	attributeName: string;
	kind: FieldKind;
	isRequired: boolean;
	hasDefault: boolean;
	defaultValue: unknown;
	description: string;
}

export interface PositionalPlan {
	key: string;
	name: string;
	kind: FieldKind;
	required: boolean;
	description: string;
}

export interface SurfacePlan {
	positionals: readonly PositionalPlan[];
	options: readonly OptionPlan[];
}

export interface PositionalSpec {
	position: number;
}

/** Keys that collide with options clinkr itself adds to every command. */
const RESERVED_KEYS = new Set(["format", "json_schema"]);

interface UnwrappedField {
	inner: z.ZodType;
	isOptional: boolean;
	hasDefault: boolean;
	defaultValue: unknown;
	description: string | undefined;
}

function unwrapField(field: z.ZodType): UnwrappedField {
	let current = field;
	let isOptional = false;
	let hasDefault = false;
	let defaultValue: unknown;
	let description = current.description;
	while (current instanceof z.ZodOptional || current instanceof z.ZodDefault) {
		if (current instanceof z.ZodOptional) {
			isOptional = true;
		} else if (!hasDefault) {
			hasDefault = true;
			defaultValue = current.def.defaultValue;
		}
		current = current.unwrap() as z.ZodType;
		description ??= current.description;
	}
	return { inner: current, isOptional, hasDefault, defaultValue, description };
}

function fieldKindFor(commandName: string, key: string, inner: z.ZodType): FieldKind {
	if (inner instanceof z.ZodString) return { type: "string" };
	if (inner instanceof z.ZodNumber) return { type: "number" };
	if (inner instanceof z.ZodBoolean) return { type: "boolean" };
	if (inner instanceof z.ZodEnum) {
		const values = inner.options;
		if (values.some((value) => typeof value !== "string")) {
			throw new Error(
				`clinkr: enum field '${key}' in command '${commandName}' must have string values`,
			);
		}
		return { type: "enum", values: values as readonly string[] };
	}
	if (inner instanceof z.ZodArray) {
		if (!(inner.element instanceof z.ZodString)) {
			throw new Error(
				`clinkr: array field '${key}' in command '${commandName}' must have string elements`,
			);
		}
		return { type: "string-array" };
	}
	throw new Error(
		`clinkr: unsupported schema type '${inner.def.type}' for field '${key}' in command '${commandName}'`,
	);
}

function kebabCase(key: string): string {
	return key.replaceAll("_", "-");
}

function buildFlag(key: string, kind: FieldKind, unwrapped: UnwrappedField): string {
	const kebab = kebabCase(key);
	if (kind.type === "boolean") {
		if (unwrapped.hasDefault && unwrapped.defaultValue === true) return `--no-${kebab}`;
		return `--${kebab}`;
	}
	return `--${kebab} <value>`;
}

function describeField(unwrapped: UnwrappedField): string {
	const base = unwrapped.description ?? "";
	if (!unwrapped.hasDefault) return base;
	const suffix = `(default: ${JSON.stringify(unwrapped.defaultValue)})`;
	return base === "" ? suffix : `${base} ${suffix}`;
}

/**
 * Derive the CLI surface (named options + opt-in positionals) for one command
 * from its Zod request schema. Throws on schemas outside the v1 vocabulary so
 * unsupported shapes fail at registration time, not at parse time.
 */
export function buildSurfacePlan(
	commandName: string,
	schema: z.ZodObject,
	positionals: Readonly<Partial<Record<string, PositionalSpec>>> = {},
): SurfacePlan {
	const shape = schema.def.shape;
	for (const key of Object.keys(positionals)) {
		if (!(key in shape)) {
			throw new Error(
				`clinkr: positional spec references unknown field '${key}' in command '${commandName}'`,
			);
		}
	}
	const positionalEntries: { position: number; plan: PositionalPlan }[] = [];
	const options: OptionPlan[] = [];
	for (const [key, field] of Object.entries(shape)) {
		if (RESERVED_KEYS.has(key)) {
			throw new Error(
				`clinkr: field '${key}' in command '${commandName}' collides with a clinkr framework option`,
			);
		}
		const unwrapped = unwrapField(field as z.ZodType);
		const kind = fieldKindFor(commandName, key, unwrapped.inner);
		const isRequired = !unwrapped.isOptional && !unwrapped.hasDefault;
		const description = describeField(unwrapped);
		const positionalSpec = positionals[key];
		if (positionalSpec !== undefined) {
			if (kind.type === "boolean" || kind.type === "string-array") {
				throw new Error(
					`clinkr: field '${key}' in command '${commandName}' cannot be a positional (${kind.type})`,
				);
			}
			positionalEntries.push({
				position: positionalSpec.position,
				plan: { key, name: kebabCase(key), kind, required: isRequired, description },
			});
			continue;
		}
		const flag = buildFlag(key, kind, unwrapped);
		options.push({
			key,
			flag,
			attributeName: new Option(flag).attributeName(),
			kind,
			isRequired,
			hasDefault: unwrapped.hasDefault,
			defaultValue: unwrapped.defaultValue,
			description,
		});
	}
	positionalEntries.sort((a, b) => a.position - b.position);
	positionalEntries.forEach((entry, index) => {
		if (entry.position !== index) {
			throw new Error(
				`clinkr: positional positions for command '${commandName}' must be unique and contiguous from 0`,
			);
		}
	});
	return {
		positionals: positionalEntries.map((entry) => entry.plan),
		options,
	};
}
