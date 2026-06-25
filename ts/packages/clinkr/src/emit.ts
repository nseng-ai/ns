import {
	envelopeJsonText,
	exitCodeForExit,
	toMachineEnvelope,
	type ClinkrExit,
	type ClinkrOkExit,
} from "./exit.ts";
import type { ClinkrIo } from "./io.ts";

export type ClinkrFormat = "human" | "json" | "markdown";

/** Capabilities of the output sink, passed to human/markdown renderers. */
export interface RenderCapabilities {
	/** Whether the renderer may emit ANSI styling. */
	canEmitAnsi: boolean;
}

export interface EmitExitOptions<T> {
	format: ClinkrFormat;
	io: ClinkrIo;
	renderHuman?: ((data: T, caps: RenderCapabilities) => string) | undefined;
	renderMarkdown?: ((data: T, caps: RenderCapabilities) => string) | undefined;
}

/**
 * Sole owner of format dispatch. Returns the process exit code; never exits.
 */
export function emitExit<T>(exit: ClinkrExit<T>, options: EmitExitOptions<T>): number {
	if (options.format === "json") {
		options.io.stdout(`${envelopeJsonText(toMachineEnvelope(exit))}\n`);
		return exitCodeForExit(exit);
	}
	switch (exit.type) {
		case "ok": {
			options.io.stdout(`${renderOkExit(exit, options)}\n`);
			return 0;
		}
		case "negative":
			options.io.stderr(`${exit.message}\n`);
			return 1;
		case "failure":
			options.io.stderr(`error: ${exit.message}\n`);
			return 2;
		case "usageError":
			options.io.stderr(`error: ${exit.message}\n`);
			return 2;
	}
}

function renderOkExit<T>(exit: ClinkrOkExit<T>, options: EmitExitOptions<T>): string {
	const caps: RenderCapabilities = { canEmitAnsi: options.io.canEmitAnsi === true };
	if (options.format === "human") return renderHumanChain(exit, options, caps);
	if (exit.markdown !== undefined) return exit.markdown;
	if (options.renderMarkdown !== undefined) return options.renderMarkdown(exit.data, caps);
	return renderHumanChain(exit, options, caps);
}

function renderHumanChain<T>(
	exit: ClinkrOkExit<T>,
	options: EmitExitOptions<T>,
	caps: RenderCapabilities,
): string {
	if (exit.human !== undefined) return exit.human;
	return options.renderHuman === undefined
		? envelopeJsonText(exit.data)
		: options.renderHuman(exit.data, caps);
}
