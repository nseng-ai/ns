import type { ClinkrContextFreeApp, ClinkrContextfulApp } from "./app.ts";

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
 * streams, so this helper scopes an interception of
 * `process.stdout.write`/`process.stderr.write` around the run and restores
 * the original writers before returning.
 *
 * Not safe for concurrent in-process runs: the interception is
 * process-global. Vitest's per-file worker isolation plus sequential tests
 * within a file make sequential awaited calls fine.
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
	const restore = interceptProcessStreams(stdoutChunks, stderrChunks);
	let exitCode: number;
	try {
		if (app.requiresContext) {
			if (!("context" in options)) throw new Error("Contextful app test runs require context");
			exitCode = await app.run(argv, { context: options.context, ...runOptions });
		} else {
			exitCode = await app.run(argv, runOptions);
		}
	} finally {
		restore();
	}
	return { exitCode, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") };
}

// Deliberately private to this helper for now: the first in-process host
// migration will need its own host-side interception variant and can extract
// a shared helper then.
function interceptProcessStreams(stdoutChunks: string[], stderrChunks: string[]): () => void {
	const originalStdoutWrite = process.stdout.write;
	const originalStderrWrite = process.stderr.write;
	process.stdout.write = collectingWriter(stdoutChunks) as typeof process.stdout.write;
	process.stderr.write = collectingWriter(stderrChunks) as typeof process.stderr.write;
	return () => {
		process.stdout.write = originalStdoutWrite;
		process.stderr.write = originalStderrWrite;
	};
}

function collectingWriter(chunks: string[]) {
	return (chunk: string | Uint8Array): boolean => {
		chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	};
}
