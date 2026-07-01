import {
	envelopeJsonText,
	exitCodeForExit,
	toMachineEnvelope,
	type ClinkrExit,
	type ClinkrNegativeExit,
	type ClinkrOkExit,
} from "./exit.ts";
import { stripAnsi } from "./ansi.ts";
import { resolveSettledNonInteractiveCaps, type Caps } from "./caps.ts";
import type { ClinkrIo } from "./io.ts";

export type ClinkrFormat = "human" | "json" | "markdown";

/** Capabilities of the output sink, passed to human/markdown renderers. */
export interface RenderCapabilities {
	/** Whether the renderer may emit ANSI styling. */
	canEmitAnsi: boolean;
	/** Full terminal capabilities for the resolved output sink. */
	caps?: Caps;
}

export function renderCapabilitiesForTerminal(caps: Caps | undefined): RenderCapabilities {
	return {
		canEmitAnsi: caps !== undefined && caps.colorDepth !== "none",
		...(caps === undefined ? {} : { caps }),
	};
}

export function resolveRenderCapabilities(renderCapabilities: RenderCapabilities): Caps {
	return renderCapabilities.caps ?? resolveSettledNonInteractiveCaps();
}

export interface EmitExitOptions<T> {
	format: ClinkrFormat;
	io: ClinkrIo;
	renderHuman?: (data: T, caps: RenderCapabilities) => string;
	renderMarkdown?: (data: T, caps: RenderCapabilities) => string;
}

/**
 * Sole owner of format dispatch. Returns the process exit code; never exits.
 */
export function emitExit<T>(exit: ClinkrExit<T>, options: EmitExitOptions<T>): number {
	const exitCode = exitCodeForExit(exit);
	if (options.format === "json") {
		options.io.stdout(`${envelopeJsonText(toMachineEnvelope(exit))}\n`);
		return exitCode;
	}
	switch (exit.type) {
		case "ok": {
			options.io.stdout(`${renderOkExit(exit, options)}\n`);
			return exitCode;
		}
		case "negative": {
			const rendered = renderNegativeExit(exit, options);
			options.io.stderr(`${rendered}\n`);
			return exitCode;
		}
		case "failure":
			options.io.stderr(`error: ${exit.message}\n`);
			return exitCode;
		case "usageError":
			options.io.stderr(`error: ${exit.message}\n`);
			return exitCode;
	}
}

function renderOkExit<T>(exit: ClinkrOkExit<T>, options: EmitExitOptions<T>): string {
	const caps = renderCapabilities(options);
	const rendered = renderOkExitText(exit, options, caps);
	return caps.canEmitAnsi ? rendered : stripAnsi(rendered);
}

function renderNegativeExit<T>(exit: ClinkrNegativeExit<T>, options: EmitExitOptions<T>): string {
	if (exit.human === undefined) return exit.message;
	const caps = renderCapabilities(options);
	return caps.canEmitAnsi ? exit.human : stripAnsi(exit.human);
}

function renderCapabilities<T>(options: EmitExitOptions<T>): RenderCapabilities {
	return {
		canEmitAnsi: options.io.canEmitAnsi === true,
		...(options.io.caps === undefined ? {} : { caps: options.io.caps }),
	};
}

function renderOkExitText<T>(
	exit: ClinkrOkExit<T>,
	options: EmitExitOptions<T>,
	caps: RenderCapabilities,
): string {
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
