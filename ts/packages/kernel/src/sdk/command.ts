import { usageError } from "@nseng-ai/clinkr";
import type {
	ClinkrCommandSpec,
	ClinkrCompletionCandidate,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionRequest,
	ClinkrExit,
	OptionSpec,
	RenderCapabilities,
} from "@nseng-ai/clinkr";
import type { PositionalSpec } from "@nseng-ai/clinkr/raw";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import type { z } from "zod";

import type { ExtensionDescriptor } from "./descriptor.ts";
import type { NsExtensionApi } from "./execution.ts";
import type { NsResult } from "./result.ts";

export type {
	ClinkrCompletionCandidate,
	ClinkrCommandSpec,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionRequest,
	ClinkrExit,
	ClinkrFormat,
	OptionSpec,
	PositionalSpec,
	RenderCapabilities,
} from "@nseng-ai/clinkr";

export type NsCommandSchema = z.ZodObject;
export type NsCommandRequest<S extends NsCommandSchema> = z.output<S>;

export interface KernelCommandInvocation {
	/** Raw argv tail after ns has routed through the command path. */
	readonly argv: readonly string[];
}

export interface KernelCommand<T = unknown> {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	readonly resultSchema: z.ZodType<T>;
	run(
		ctx: NsExtensionApi,
		invocation: KernelCommandInvocation,
	): Promise<ClinkrExit<T>> | ClinkrExit<T>;
}

export type DefineCommandSpec<S extends NsCommandSchema, T> = Omit<
	ClinkrCommandSpec<NsExtensionApi, S, T>,
	"description" | "summary"
> & {
	readonly summary: string;
	readonly description: string;
	readonly resultSchema: z.ZodType<T>;
};

export function defineRawCommand<T>(command: KernelCommand<T>): KernelCommand<T> {
	return command;
}

export function defineCommand<S extends NsCommandSchema, T>(
	spec: DefineCommandSpec<S, T>,
): KernelCommand<T> {
	return defineRawCommand({
		name: spec.name,
		summary: spec.summary,
		description: spec.description,
		resultSchema: spec.resultSchema,
		async run(ctx, invocation) {
			const parsedArgs = parseKernelCommandArgv(spec, invocation.argv);
			if (!parsedArgs.ok) return parsedArgs.exit;
			return spec.handler(ctx, parsedArgs.request);
		},
	});
}

function parseKernelCommandArgv<S extends NsCommandSchema, T>(
	spec: DefineCommandSpec<S, T>,
	argv: readonly string[],
): { ok: true; request: z.output<S> } | { ok: false; exit: ClinkrExit<T> } {
	const rawRequest: Record<string, unknown> = {};
	const positionalFields = Object.entries(spec.positionals ?? {}).sort((left, right) => {
		const leftPosition = left[1]?.position ?? 0;
		const rightPosition = right[1]?.position ?? 0;
		return leftPosition - rightPosition;
	});
	let positionalIndex = 0;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === undefined) continue;
		if (arg.startsWith("--")) {
			const [flagName, inlineValue] = arg.slice(2).split("=", 2);
			if (flagName === undefined || flagName.length === 0) {
				return { ok: false, exit: usageError(`Invalid option ${arg}.`) };
			}
			if (inlineValue !== undefined) {
				rawRequest[flagName] = inlineValue;
				continue;
			}
			const next = argv[index + 1];
			if (next === undefined || next.startsWith("-")) {
				rawRequest[flagName] = true;
				continue;
			}
			rawRequest[flagName] = next;
			index += 1;
			continue;
		}
		const positionalField = positionalFields[positionalIndex]?.[0];
		if (positionalField === undefined) {
			return { ok: false, exit: usageError(`Unexpected argument ${arg}.`) };
		}
		rawRequest[positionalField] = arg;
		positionalIndex += 1;
	}
	const parsed = spec.schema.safeParse(rawRequest);
	if (!parsed.success) {
		return {
			ok: false,
			exit: usageError(parsed.error.issues[0]?.message ?? `Invalid arguments for ${spec.name}.`),
		};
	}
	return { ok: true, request: parsed.data };
}

export type NsCommandCompletionProvider = (
	ctx: NsExtensionApi,
	request: ClinkrDynamicCompletionRequest,
) =>
	| Promise<ClinkrCompletionResult | readonly ClinkrCompletionCandidate[]>
	| ClinkrCompletionResult
	| readonly ClinkrCompletionCandidate[];

export interface NsCommand<S extends NsCommandSchema = z.ZodObject, T = unknown> {
	name: string;
	summary: string;
	description: string;
	schema?: ExplicitUndefined<"public-api-compatibility", S>;
	positionals?: ExplicitUndefined<
		"public-api-compatibility",
		Partial<Record<keyof z.infer<S> & string, PositionalSpec>>
	>;
	options?: ExplicitUndefined<
		"public-api-compatibility",
		Partial<Record<keyof z.infer<S> & string, OptionSpec>>
	>;
	resultSchema?: ExplicitUndefined<"public-api-compatibility", z.ZodType<T>>;
	renderHuman?: ExplicitUndefined<
		"public-api-compatibility",
		(data: unknown, caps: RenderCapabilities) => string
	>;
	renderMarkdown?: ExplicitUndefined<
		"public-api-compatibility",
		(data: unknown, caps: RenderCapabilities) => string
	>;
	completionProvider?: ExplicitUndefined<"public-api-compatibility", NsCommandCompletionProvider>;
	run(
		ctx: NsExtensionApi,
		request: z.output<S>,
	): Promise<NsResult | ClinkrExit<T>> | NsResult | ClinkrExit<T>;
}

export interface NsExtension<TCommands extends readonly NsCommand[] = readonly NsCommand[]> {
	commands?: ExplicitUndefined<"overload-selector", TCommands>;
}

type NsCommandTuple<TSchemas extends readonly NsCommandSchema[]> = {
	readonly [Index in keyof TSchemas]: NsCommand<TSchemas[Index]>;
};

export function defineExtension<const TDescriptor extends ExtensionDescriptor>(
	extension: TDescriptor,
): TDescriptor;
export function defineExtension(extension: {
	commands?: ExplicitUndefined<"overload-selector", never>;
}): NsExtension<readonly []>;
export function defineExtension(extension: NsExtension<readonly []>): NsExtension<readonly []>;
export function defineExtension<S1 extends NsCommandSchema = z.ZodObject>(
	extension: NsExtension<readonly [NsCommand<S1>]>,
): NsExtension<readonly [NsCommand<S1>]>;
export function defineExtension<
	S1 extends NsCommandSchema = z.ZodObject,
	S2 extends NsCommandSchema = z.ZodObject,
>(
	extension: NsExtension<readonly [NsCommand<S1>, NsCommand<S2>]>,
): NsExtension<readonly [NsCommand<S1>, NsCommand<S2>]>;
export function defineExtension<
	S1 extends NsCommandSchema = z.ZodObject,
	S2 extends NsCommandSchema = z.ZodObject,
	S3 extends NsCommandSchema = z.ZodObject,
>(
	extension: NsExtension<readonly [NsCommand<S1>, NsCommand<S2>, NsCommand<S3>]>,
): NsExtension<readonly [NsCommand<S1>, NsCommand<S2>, NsCommand<S3>]>;
export function defineExtension<
	S1 extends NsCommandSchema = z.ZodObject,
	S2 extends NsCommandSchema = z.ZodObject,
	S3 extends NsCommandSchema = z.ZodObject,
	S4 extends NsCommandSchema = z.ZodObject,
	const SRest extends readonly NsCommandSchema[] = readonly [],
>(
	extension: NsExtension<
		readonly [NsCommand<S1>, NsCommand<S2>, NsCommand<S3>, NsCommand<S4>, ...NsCommandTuple<SRest>]
	>,
): NsExtension<
	readonly [NsCommand<S1>, NsCommand<S2>, NsCommand<S3>, NsCommand<S4>, ...NsCommandTuple<SRest>]
>;
export function defineExtension(extension: NsExtension): NsExtension {
	return extension;
}
