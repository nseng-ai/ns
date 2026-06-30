import type {
	ClinkrCompletionCandidate,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionRequest,
	ClinkrExit,
	RenderCapabilities,
} from "@sdl/clinkr";
import type { PositionalSpec } from "@sdl/clinkr/raw";
import type { z } from "zod";

import type { SdlExtensionApi } from "./execution.ts";
import type { SdlResult } from "./result.ts";

export type {
	ClinkrCompletionCandidate,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionRequest,
	ClinkrExit,
	PositionalSpec,
	RenderCapabilities,
} from "@sdl/clinkr";

export type SdlCommandSchema = z.ZodObject;
export type SdlCommandRequest<S extends SdlCommandSchema> = z.output<S>;
export type SdlCommandCompletionProvider = (
	ctx: SdlExtensionApi,
	request: ClinkrDynamicCompletionRequest,
) =>
	| Promise<ClinkrCompletionResult | readonly ClinkrCompletionCandidate[]>
	| ClinkrCompletionResult
	| readonly ClinkrCompletionCandidate[];

export interface SdlCommand<S extends SdlCommandSchema = z.ZodObject, T = unknown> {
	name: string;
	summary: string;
	description: string;
	schema?: S | undefined;
	positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>> | undefined;
	resultSchema?: z.ZodType<T> | undefined;
	renderHuman?: ((data: unknown, caps: RenderCapabilities) => string) | undefined;
	renderMarkdown?: ((data: unknown, caps: RenderCapabilities) => string) | undefined;
	completionProvider?: SdlCommandCompletionProvider | undefined;
	run(
		ctx: SdlExtensionApi,
		request: z.output<S>,
	): Promise<SdlResult | ClinkrExit<T>> | SdlResult | ClinkrExit<T>;
}

export interface SdlExtension<TCommands extends readonly SdlCommand[] = readonly SdlCommand[]> {
	// optional-undefined-objective: preserve (overload-selector) — defineExtension provides a dedicated `{ commands?: undefined }` overload, so explicit `commands: undefined` is an intentionally supported authoring input that the overload set distinguishes at the type level.
	commands?: TCommands | undefined;
}

type SdlCommandTuple<TSchemas extends readonly SdlCommandSchema[]> = {
	readonly [Index in keyof TSchemas]: SdlCommand<TSchemas[Index]>;
};

// optional-undefined-objective: preserve (overload-selector) — Intentional overload-selector signature typed `commands?: undefined` (undefined-only, not the redundant T|undefined pattern) that routes empty extensions to the readonly [] return overload.
export function defineExtension(extension: { commands?: undefined }): SdlExtension<readonly []>;
export function defineExtension(extension: SdlExtension<readonly []>): SdlExtension<readonly []>;
export function defineExtension<S1 extends SdlCommandSchema = z.ZodObject>(
	extension: SdlExtension<readonly [SdlCommand<S1>]>,
): SdlExtension<readonly [SdlCommand<S1>]>;
export function defineExtension<
	S1 extends SdlCommandSchema = z.ZodObject,
	S2 extends SdlCommandSchema = z.ZodObject,
>(
	extension: SdlExtension<readonly [SdlCommand<S1>, SdlCommand<S2>]>,
): SdlExtension<readonly [SdlCommand<S1>, SdlCommand<S2>]>;
export function defineExtension<
	S1 extends SdlCommandSchema = z.ZodObject,
	S2 extends SdlCommandSchema = z.ZodObject,
	S3 extends SdlCommandSchema = z.ZodObject,
>(
	extension: SdlExtension<readonly [SdlCommand<S1>, SdlCommand<S2>, SdlCommand<S3>]>,
): SdlExtension<readonly [SdlCommand<S1>, SdlCommand<S2>, SdlCommand<S3>]>;
export function defineExtension<
	S1 extends SdlCommandSchema = z.ZodObject,
	S2 extends SdlCommandSchema = z.ZodObject,
	S3 extends SdlCommandSchema = z.ZodObject,
	S4 extends SdlCommandSchema = z.ZodObject,
	const SRest extends readonly SdlCommandSchema[] = readonly [],
>(
	extension: SdlExtension<
		readonly [
			SdlCommand<S1>,
			SdlCommand<S2>,
			SdlCommand<S3>,
			SdlCommand<S4>,
			...SdlCommandTuple<SRest>,
		]
	>,
): SdlExtension<
	readonly [
		SdlCommand<S1>,
		SdlCommand<S2>,
		SdlCommand<S3>,
		SdlCommand<S4>,
		...SdlCommandTuple<SRest>,
	]
>;
export function defineExtension(extension: SdlExtension): SdlExtension {
	return extension;
}
