import {
	runStructuredCommandForCliTest,
	type ClinkrContextFreeApp,
	type ClinkrContextfulApp,
} from "./app.ts";

/** Observable CLI result of an in-process structured-command run. */
export interface CapturedCliRun {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export interface RunForCliTestOptions<TContext> {
	readonly context: TContext;
	/** stdin bytes for `--input-json`; defaults to empty stdin. */
	readonly stdin?: string;
	/** ANSI capability of the captured terminal. Defaults to `false`. */
	readonly canEmitAnsi?: boolean;
}

export interface ContextFreeRunForCliTestOptions {
	/** stdin bytes for `--input-json`; defaults to empty stdin. */
	readonly stdin?: string;
	/** ANSI capability of the captured terminal. Defaults to `false`. */
	readonly canEmitAnsi?: boolean;
}

/**
 * Runs the complete structured CLI pipeline in-process and returns its
 * rendered stdout, stderr, and exit code without writing process streams.
 * Raw commands own process I/O and remain executable-boundary only.
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
	const runOptions = {
		readStdin: async () => options.stdin ?? "",
		canEmitAnsi: options.canEmitAnsi ?? false,
	};
	if (app.requiresContext) {
		if (!("context" in options)) throw new Error("Contextful app test runs require context");
		return await runStructuredCommandForCliTest(app as ClinkrContextfulApp<unknown>, argv, {
			context: options.context,
			...runOptions,
		});
	}
	return await runStructuredCommandForCliTest(app, argv, runOptions);
}
