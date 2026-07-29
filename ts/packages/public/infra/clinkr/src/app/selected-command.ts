// Exact selected-command loading and definition decoding for the quarantined
// app runtime. The private topology owns transactional caching; this module
// owns "what is a well-formed selected command module".
import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import type { ClinkrRawCommandDefinition } from "../raw/definition.ts";
import type {
	ClinkrCommandDefinition,
	ClinkrCommandMetadata,
	ClinkrGroupDefinition,
} from "./command-definition.ts";

interface LoadedCommandModule {
	command: () => Promise<unknown>;
}

interface LoadedMetadataModule {
	metadata: () => unknown;
}

interface LoadedGroupModule {
	group: () => unknown;
}

function isExactCommandModule(value: unknown): value is LoadedCommandModule {
	return isExactFunctionModule(value, "command");
}

function isExactMetadataModule(value: unknown): value is LoadedMetadataModule {
	return isExactFunctionModule(value, "metadata");
}

function isExactGroupModule(value: unknown): value is LoadedGroupModule {
	return isExactFunctionModule(value, "group");
}

function isExactFunctionModule(
	value: unknown,
	exportName: "command" | "metadata" | "group",
): boolean {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return Object.keys(record).length === 1 && typeof record[exportName] === "function";
}

const commandMetadataSchema = z.strictObject({
	description: z.string(),
	aliases: z.array(z.string()).readonly().optional(),
	summary: z.string().optional(),
	hidden: z.boolean().optional(),
	helpGroup: z.string().optional(),
});

const groupDefinitionSchema = commandMetadataSchema;

function isCommandMetadata(value: unknown): value is ClinkrCommandMetadata {
	if (!commandMetadataSchema.safeParse(value).success) return false;
	// Drift guard (one-directional): every `ClinkrCommandMetadata` must remain
	// a valid `commandMetadataSchema` output, so the schema cannot silently
	// narrow below the interface; the annotation collapses to `never` on drift.
	// The reverse direction is not asserted because zod v4 `.optional()`
	// inference adds `| undefined`, which `exactOptionalPropertyTypes` rejects
	// against the interface's plain optional properties.
	const schemaCoversInterface: ClinkrCommandMetadata extends z.infer<typeof commandMetadataSchema>
		? true
		: never = true;
	return schemaCoversInterface;
}

/**
 * One exhaustive decoded union over the two selected-definition variants. The
 * `kind` tag is decoder-owned; the raw arm's definition carries the
 * constructor-owned `type: "raw"` discriminant that routed it here.
 */
export type SelectedCommandDefinition<TContext> =
	| { readonly kind: "structured"; readonly definition: ClinkrCommandDefinition<TContext> }
	| { readonly kind: "raw"; readonly definition: ClinkrRawCommandDefinition<TContext> };

export interface LoadedSelectedCommand<TContext> {
	readonly selected: SelectedCommandDefinition<TContext>;
	readonly metadata: ClinkrCommandMetadata;
}

const STRUCTURED_DEFINITION_KEYS = new Set([
	"schema",
	"resultSchema",
	"renderHuman",
	"renderMarkdown",
	"handler",
	"completionProvider",
	"requiresContext",
]);

const RAW_DEFINITION_KEYS = new Set(["type", "run", "requiresContext"]);

/**
 * Exact context-mode discriminant check shared by both variants: omission
 * means context-free; the only accepted present value is `true`. Explicit
 * `false` and a present-but-`undefined` key are rejected.
 */
function hasExactContextDiscriminant(record: Record<string, unknown>): boolean {
	return !("requiresContext" in record) || record.requiresContext === true;
}

function isStructuredDefinition(value: object): value is ClinkrCommandDefinition<unknown> {
	const record = value as Record<string, unknown>;
	if (Object.keys(record).some((key) => !STRUCTURED_DEFINITION_KEYS.has(key))) return false;
	if (!(record.schema instanceof z.ZodObject) || typeof record.handler !== "function") {
		return false;
	}
	if (!hasExactContextDiscriminant(record)) return false;
	if (record.resultSchema !== undefined && !(record.resultSchema instanceof z.ZodType)) {
		return false;
	}
	for (const key of ["renderHuman", "renderMarkdown", "completionProvider"] as const) {
		if (record[key] !== undefined && typeof record[key] !== "function") return false;
	}
	return true;
}

function isRawDefinition(value: object): value is ClinkrRawCommandDefinition<unknown> {
	const record = value as Record<string, unknown>;
	if (Object.keys(record).some((key) => !RAW_DEFINITION_KEYS.has(key))) return false;
	if (typeof record.run !== "function") return false;
	return hasExactContextDiscriminant(record);
}

/**
 * Decode an untrusted selected-module `command()` result into the exact
 * selected-definition union. Variant routing follows only the explicit
 * constructor-owned `type: "raw"` discriminant; each arm then rejects unknown
 * keys, so structured-only members on a raw definition (and vice versa) are
 * malformed.
 *
 * This is the single generic-to-concrete recovery point for selected
 * definitions, shared by the filesystem and programmatic loaders: the app
 * factory's `TContext` is erased at runtime, so the decoded `unknown` context
 * is re-labelled exactly once here, behind the exact runtime assertions in
 * `decodeUnknownSelectedCommandDefinition`.
 */
export function decodeSelectedCommandDefinition<TContext>(
	value: unknown,
): SelectedCommandDefinition<TContext> | undefined {
	const decoded = decodeUnknownSelectedCommandDefinition(value);
	if (decoded === undefined) return undefined;
	return decoded as SelectedCommandDefinition<TContext>;
}

function decodeUnknownSelectedCommandDefinition(
	value: unknown,
): SelectedCommandDefinition<unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	if (record.type === "raw") {
		return isRawDefinition(value) ? { kind: "raw", definition: value } : undefined;
	}
	return isStructuredDefinition(value) ? { kind: "structured", definition: value } : undefined;
}

/**
 * Import and exactly validate one selected command directory (`metadata.ts`
 * plus `command.ts`). Throws actionable programmer errors on any malformed
 * module, metadata, or definition.
 */
export async function importCommandMetadata(metadataPath: string): Promise<ClinkrCommandMetadata> {
	const metadataModule: unknown = await import(pathToFileURL(metadataPath).href);
	if (!isExactMetadataModule(metadataModule))
		throw new Error(`clinkr: malformed metadata module ${metadataPath}`);
	const metadata = metadataModule.metadata();
	if (!isCommandMetadata(metadata))
		throw new Error(`clinkr: malformed command metadata ${metadataPath}`);
	return metadata;
}

export async function importGroupDefinition(groupPath: string): Promise<ClinkrGroupDefinition> {
	const groupModule: unknown = await import(pathToFileURL(groupPath).href);
	if (!isExactGroupModule(groupModule))
		throw new Error(`clinkr: malformed group module ${groupPath}`);
	const parsed = groupDefinitionSchema.safeParse(groupModule.group());
	if (!parsed.success) throw new Error(`clinkr: malformed group definition ${groupPath}`);
	return {
		description: parsed.data.description,
		...(parsed.data.aliases === undefined ? {} : { aliases: parsed.data.aliases }),
		...(parsed.data.summary === undefined ? {} : { summary: parsed.data.summary }),
		...(parsed.data.hidden === undefined ? {} : { hidden: parsed.data.hidden }),
		...(parsed.data.helpGroup === undefined ? {} : { helpGroup: parsed.data.helpGroup }),
	};
}

export async function importSelectedCommand<TContext>(
	commandDirectory: string,
	metadata?: ClinkrCommandMetadata,
): Promise<LoadedSelectedCommand<TContext>> {
	const commandPath = path.join(commandDirectory, "command.ts");
	const selectedMetadata =
		metadata ?? (await importCommandMetadata(path.join(commandDirectory, "metadata.ts")));
	const module: unknown = await import(pathToFileURL(commandPath).href);
	if (!isExactCommandModule(module))
		throw new Error(`clinkr: malformed command module ${commandPath}`);
	const pendingDefinition = module.command();
	if (!(pendingDefinition instanceof Promise))
		throw new Error(`clinkr: malformed command definition ${commandPath}`);
	const definition = await pendingDefinition;
	const selected = decodeSelectedCommandDefinition<TContext>(definition);
	if (selected === undefined)
		throw new Error(`clinkr: malformed command definition ${commandPath}`);
	return { selected, metadata: selectedMetadata };
}
