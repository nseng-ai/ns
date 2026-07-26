import { envelopeJsonText, exitCodeForExit, toMachineEnvelope, type ClinkrExit } from "./exit.ts";
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

/** Sole owner of format dispatch. Returns the process exit code; never exits. */
export function emitExit<T>(exit: ClinkrExit<T>, options: EmitExitOptions<T>): number {
	const exitCode = exitCodeForExit(exit);
	if (options.format === "json") {
		options.io.stdout(`${envelopeJsonText(toMachineEnvelope(exit))}\n`);
		return exitCode;
	}
	if (exit.type === "failure" || exit.type === "usageError") {
		options.io.stderr(`error: ${exit.message}\n`);
		return exitCode;
	}
	if (exit.type === "negative" && !Object.hasOwn(exit, "data")) {
		options.io.stdout(`${exit.message}\n`);
		return exitCode;
	}
	if (!Object.hasOwn(exit, "data")) return exitCode;
	options.io.stdout(`${renderOutcomeData(exit.data as T, options)}\n`);
	return exitCode;
}

function renderOutcomeData<T>(data: T, options: EmitExitOptions<T>): string {
	const caps = renderCapabilities(options);
	const renderer =
		options.format === "markdown"
			? (options.renderMarkdown ?? options.renderHuman)
			: options.renderHuman;
	const rendered = renderer === undefined ? envelopeJsonText(data) : renderer(data, caps);
	return caps.canEmitAnsi ? rendered : stripAnsi(rendered);
}

function renderCapabilities<T>(options: EmitExitOptions<T>): RenderCapabilities {
	return {
		canEmitAnsi: options.io.canEmitAnsi === true,
		...(options.io.caps === undefined ? {} : { caps: options.io.caps }),
	};
}
