import type { ClinkrContextFreeApp, ClinkrContextfulApp } from "./app.ts";
import { captureTerminalRun, type ClinkrTerminalTestAdapter } from "./testing-runtime.ts";

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
 * Runs a structured command through the app's rendering core without writing
 * process streams. Raw commands are terminal-only and must be tested through
 * an executable boundary.
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
	const testAdapter = app as typeof app & ClinkrTerminalTestAdapter<TContext>;
	const runOptions = {
		readStdin: async () => options.stdin ?? "",
		canEmitAnsi: options.canEmitAnsi ?? false,
	};
	if (app.requiresContext) {
		if (!("context" in options)) throw new Error("Contextful app test runs require context");
		return await testAdapter[captureTerminalRun](argv, { context: options.context, ...runOptions });
	}
	return await testAdapter[captureTerminalRun](argv, runOptions);
}
