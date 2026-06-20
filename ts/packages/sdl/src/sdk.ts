import type { PositionalSpec } from "@asdl/clinkr/raw";
import { z } from "zod";

import type { TextGenerationGateway } from "./text-generation.ts";

export type { PositionalSpec } from "@asdl/clinkr/raw";
export { z } from "zod";
export type {
	TextGenerationGateway,
	TextGenerationRequest,
	TextGenerationResult,
} from "./text-generation.ts";

export interface SdlExecOptions {
	timeoutMs?: number;
	stdin?: string | undefined;
	onStdout?: ((text: string) => void) | undefined;
	onStderr?: ((text: string) => void) | undefined;
}

export interface ExecResult {
	code: number;
	stdout: string;
	stderr: string;
	killed: boolean;
}

export type SdlOutputStream = "stdout" | "stderr";
export type SdlConfirmPrompt = (title: string, message: string) => Promise<boolean> | boolean;

export interface SdlContext {
	/** Current repository working directory for command-entry execution. */
	cwd: string;
	/** Environment visible to SDL commands and shell execution. */
	env: Record<string, string | undefined>;
	/** Low-level argv execution hook. Project commands own the exact commands they run. */
	exec(command: string, args: string[], options?: SdlExecOptions): Promise<ExecResult>;
	/** Raw text-generation capability; SDL commands own prompts, validation, and repair policy. */
	model: TextGenerationGateway;
	/** Durable output for commands that need to stream multiple chunks before returning. */
	stdout?: ((text: string) => void) | undefined;
	/** Durable error output for commands that need to stream multiple chunks before returning. */
	stderr?: ((text: string) => void) | undefined;
	/** Transient live-progress output for UI bridges. */
	onOutput?: ((stream: SdlOutputStream, text: string) => void) | undefined;
	/** Optional UI confirmation hook for interactive SDL commands. */
	confirm?: SdlConfirmPrompt | undefined;
	/** Project-local extension bag. SDL commands own any values they read from it. */
	extensions?: Readonly<Record<string, unknown>> | undefined;
}

export type SdlResult =
	| { ok: true; message: string }
	| { ok: false; exitCode: number; message: string };
export type SdlCommandSchema = z.ZodObject;
export type SdlCommandRequest<S extends SdlCommandSchema> = z.output<S>;

export interface SdlCommand<S extends SdlCommandSchema = z.ZodObject> {
	name: string;
	description: string;
	schema?: S | undefined;
	positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>> | undefined;
	run(ctx: SdlContext, request: z.output<S>): Promise<SdlResult> | SdlResult;
}

export interface SdlExtension<TCommands extends readonly SdlCommand[] = readonly SdlCommand[]> {
	commands?: TCommands | undefined;
}

type SdlCommandTuple<TSchemas extends readonly SdlCommandSchema[]> = {
	readonly [Index in keyof TSchemas]: SdlCommand<TSchemas[Index]>;
};

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

export function ok(message: string): SdlResult {
	return { ok: true, message };
}

export function failed(message: string, exitCode = 1): SdlResult {
	return { ok: false, exitCode, message };
}
