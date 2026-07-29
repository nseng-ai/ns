import type { ClinkrContextFreeRunOptions, ClinkrRunOptions } from "./app.ts";

export interface CapturedTerminalRun {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export const captureTerminalRun = Symbol("clinkr.captureTerminalRun");

export interface ClinkrTerminalTestAdapter<TContext> {
	[captureTerminalRun](
		argv: readonly string[],
		options: ClinkrRunOptions<TContext> | ClinkrContextFreeRunOptions,
	): Promise<CapturedTerminalRun>;
}
