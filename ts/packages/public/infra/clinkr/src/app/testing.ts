import type { ClinkrRawOutput } from "../raw/definition.ts";
import type { ClinkrContextFreeApp, ClinkrContextfulApp, ClinkrOutput } from "./app.ts";

/** Observable CLI result of an in-process terminal-adapter run. */
export interface CapturedCliRun {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export interface RunForCliTestOptions<TContext> {
	readonly context: TContext;
	/** Finite structured request reader. Required when argv selects `--input-json`. */
	readonly readStructuredRequest?: () => Promise<string>;
	/** ANSI capability of the captured sink. Defaults to `false`. */
	readonly canEmitAnsi?: boolean;
}

export interface ContextFreeRunForCliTestOptions {
	/** Finite structured request reader. Required when argv selects `--input-json`. */
	readonly readStructuredRequest?: () => Promise<string>;
	/** ANSI capability of the captured sink. Defaults to `false`. */
	readonly canEmitAnsi?: boolean;
}

/** In-process invocation with concurrency-safe, invocation-scoped capture. */
export async function runForCliTest(
	app: ClinkrContextFreeApp,
	argv: readonly string[],
	options?: ContextFreeRunForCliTestOptions,
): Promise<CapturedCliRun>;
export async function runForCliTest<TContext>(
	app: ClinkrContextfulApp<TContext>,
	argv: readonly string[],
	options: RunForCliTestOptions<TContext>,
): Promise<CapturedCliRun>;
export async function runForCliTest<TContext>(
	app: ClinkrContextFreeApp | ClinkrContextfulApp<TContext>,
	argv: readonly string[],
	options: ContextFreeRunForCliTestOptions | RunForCliTestOptions<TContext> = {},
): Promise<CapturedCliRun> {
	const stdoutText: string[] = [];
	const stderrText: string[] = [];
	const stdoutBytes: Uint8Array[] = [];
	const stderrBytes: Uint8Array[] = [];
	const output: ClinkrOutput = {
		stdout: (text) => stdoutText.push(text),
		stderr: (text) => stderrText.push(text),
	};
	const rawOutput: ClinkrRawOutput = {
		writeStdout: (bytes) => stdoutBytes.push(Uint8Array.from(bytes)),
		writeStderr: (bytes) => stderrBytes.push(Uint8Array.from(bytes)),
	};
	const runOptions = {
		...(options.readStructuredRequest === undefined
			? {}
			: { readStructuredRequest: options.readStructuredRequest }),
		canEmitAnsi: options.canEmitAnsi ?? false,
		output,
		rawOutput,
	};
	let exitCode: number;
	if (app.requiresContext) {
		if (!("context" in options)) throw new Error("Contextful app test runs require context");
		exitCode = await app.run(argv, { context: options.context, ...runOptions });
	} else {
		exitCode = await app.run(argv, runOptions);
	}
	return {
		exitCode,
		stdout: stdoutText.join("") + decodeChunks(stdoutBytes),
		stderr: stderrText.join("") + decodeChunks(stderrBytes),
	};
}

function decodeChunks(chunks: readonly Uint8Array[]): string {
	let length = 0;
	for (const chunk of chunks) length += chunk.byteLength;
	const combined = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		combined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(combined);
}
