// Exact selected-command loading and definition decoding for the quarantined
// app runtime: one loader and one exhaustive decoded union for both selected
// definition variants (structured and raw). The runtime in `app.ts` owns the
// transactional cache and dispatch; this module owns "what is a well-formed
// selected command module".
import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import type { ClinkrRawCommandDefinition } from "../raw/definition.ts";
import type { ClinkrCommandDefinition, ClinkrCommandMetadata } from "./command-definition.ts";

interface LoadedCommandModule {
	command: () => Promise<unknown>;
}

interface LoadedMetadataModule {
	metadata: () => unknown;
}

function isExactCommandModule(value: unknown): value is LoadedCommandModule {
	return isExactFunctionModule(value, "command");
}

function isExactMetadataModule(value: unknown): value is LoadedMetadataModule {
	return isExactFunctionModule(value, "metadata");
}

function isExactFunctionModule(value: unknown, exportName: "command" | "metadata"): boolean {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return Object.keys(record).length === 1 && typeof record[exportName] === "function";
}

const commandMetadataSchema = z.strictObject({
	description: z.string(),
	summary: z.string().optional(),
	aliases: z.array(z.string()).readonly().optional(),
	hidden: z.boolean().optional(),
	helpGroup: z.string().optional(),
});

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
 */
export function decodeSelectedCommandDefinition(
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
export async function importSelectedCommand<TContext>(
	commandDirectory: string,
): Promise<LoadedSelectedCommand<TContext>> {
	const commandPath = path.join(commandDirectory, "command.ts");
	const metadataPath = path.join(commandDirectory, "metadata.ts");
	const metadataModule: unknown = await import(pathToFileURL(metadataPath).href);
	if (!isExactMetadataModule(metadataModule))
		throw new Error(`clinkr: malformed metadata module ${metadataPath}`);
	const metadata = metadataModule.metadata();
	if (!isCommandMetadata(metadata))
		throw new Error(`clinkr: malformed command metadata ${metadataPath}`);
	const module: unknown = await import(pathToFileURL(commandPath).href);
	if (!isExactCommandModule(module))
		throw new Error(`clinkr: malformed command module ${commandPath}`);
	const definition = await module.command();
	const selected = decodeSelectedCommandDefinition(definition);
	if (selected === undefined)
		throw new Error(`clinkr: malformed command definition ${commandPath}`);
	// Single generic-to-concrete recovery point: the app factory's `TContext`
	// is erased at runtime, so the decoded `unknown` context is re-labelled
	// here, behind the decoder's runtime assertions.
	return { selected: selected as SelectedCommandDefinition<TContext>, metadata };
}
