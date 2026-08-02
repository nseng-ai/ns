import type { ClinkrContextFreeApp, ClinkrContextfulApp } from "./app.ts";
import { withInterceptedProcessWriters } from "./process-writer-interception.ts";

/** Observable CLI result of an in-process terminal-adapter run. */
export interface CapturedCliRun {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export interface RunForCliTestOptions<TContext> {
	readonly context: TContext;
	/** stdin bytes for `--input-json`; defaults to empty stdin. */
	readonly stdin?: string;
	/**
	 * ANSI capability of the captured sink. Defaults to `false`: a captured
	 * run is a redirected sink, so renderer output is stripped at the output
	 * boundary exactly as it would be for a pipe.
	 */
	readonly canEmitAnsi?: boolean;
}

export interface ContextFreeRunForCliTestOptions {
	/** stdin bytes for `--input-json`; defaults to empty stdin. */
	readonly stdin?: string;
	/**
	 * ANSI capability of the captured sink. Defaults to `false`: a captured
	 * run is a redirected sink, so renderer output is stripped at the output
	 * boundary exactly as it would be for a pipe.
	 */
	readonly canEmitAnsi?: boolean;
}

/**
 * In-process terminal-adapter invocation with byte-level capture of the
 * observable CLI result. The terminal adapter writes directly to the process
 * streams, so this helper uses guarded process-global interception. Runs must
 * be awaited sequentially; overlapping or nested capture fails before changing
 * a writer, and the owning run restores both writers before returning.
 */
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
	const stdin = options.stdin ?? "";
	const runOptions = {
		readStdin: async () => stdin,
		canEmitAnsi: options.canEmitAnsi ?? false,
	};
	const stdoutChunks: string[] = [];
	const stderrChunks: string[] = [];
	const exitCode = await withInterceptedProcessWriters(
		{
			stdout: (text) => stdoutChunks.push(text),
			stderr: (text) => stderrChunks.push(text),
		},
		async () => {
			if (app.requiresContext) {
				if (!("context" in options)) {
					throw new Error("Contextful app test runs require context");
				}
				return await app.run(argv, { context: options.context, ...runOptions });
			}
			return await app.run(argv, runOptions);
		},
	);
	return { exitCode, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") };
}
