import type { ClinkrIo } from "../io.ts";
import type { ClinkrContextFreeApp, ClinkrContextfulApp } from "./app.ts";

export interface CapturedRun {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export interface RunForTestOptions<TContext> {
	readonly context: TContext;
	readonly io?: ClinkrIo;
	readonly stdin?: string;
}

export interface ContextFreeRunForTestOptions {
	readonly io?: ClinkrIo;
	readonly stdin?: string;
}

/** In-process app invocation through the public I/O seam. */
export async function runForTest(
	app: ClinkrContextFreeApp,
	argv: readonly string[],
	options?: ContextFreeRunForTestOptions,
): Promise<CapturedRun>;
export async function runForTest<TContext>(
	app: ClinkrContextfulApp<TContext>,
	argv: readonly string[],
	options: RunForTestOptions<TContext>,
): Promise<CapturedRun>;
export async function runForTest<TContext>(
	app: ClinkrContextFreeApp | ClinkrContextfulApp<TContext>,
	argv: readonly string[],
	options: ContextFreeRunForTestOptions | RunForTestOptions<TContext> = {},
): Promise<CapturedRun> {
	const stdoutChunks: string[] = [];
	const stderrChunks: string[] = [];
	const io = options.io ?? {
		stdout: (text: string) => {
			stdoutChunks.push(text);
		},
		stderr: (text: string) => {
			stderrChunks.push(text);
		},
	};
	const stdin = options.stdin;
	const readStdin = stdin === undefined ? undefined : async () => stdin;
	let exitCode: number;
	if (app.requiresContext) {
		if (!("context" in options)) throw new Error("Contextful app test runs require context");
		exitCode = await app.run(argv, {
			context: options.context,
			io,
			...(readStdin === undefined ? {} : { readStdin }),
		});
	} else {
		exitCode = await app.run(argv, {
			io,
			...(readStdin === undefined ? {} : { readStdin }),
		});
	}
	return { exitCode, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") };
}
