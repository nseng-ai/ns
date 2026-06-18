import { envelopeJsonText, exitCodeForExit, toMachineEnvelope, type ClinkrExit } from "./exit.ts";
import type { ClinkrIo } from "./io.ts";

export type ClinkrFormat = "human" | "json" | "markdown";

/** Capabilities of the output sink, passed to human/markdown renderers. */
export interface RenderCapabilities {
	/** Whether the renderer may emit ANSI styling. */
	canEmitAnsi: boolean;
}

export type LegacyMachineSerialization = "indent2" | "compact";

export interface LegacyMachineOutput {
	body: unknown;
	exitCode: number;
	serialization?: LegacyMachineSerialization;
}

export interface EmitExitOptions<T> {
	format: ClinkrFormat;
	io: ClinkrIo;
	renderHuman?: ((data: T, caps: RenderCapabilities) => string) | undefined;
	renderMarkdown?: ((data: T, caps: RenderCapabilities) => string) | undefined;
	legacyMachine?: ((exit: ClinkrExit<T>) => LegacyMachineOutput) | undefined;
	shellExitCode?: boolean | undefined;
}

/**
 * Sole owner of format dispatch. Returns the process exit code; never exits.
 */
export function emitExit<T>(exit: ClinkrExit<T>, options: EmitExitOptions<T>): number {
	if (options.format === "json") {
		if (options.legacyMachine !== undefined) {
			const legacy = options.legacyMachine(exit);
			const body = legacy.serialization === "compact" ? JSON.stringify(legacy.body) : envelopeJsonText(legacy.body);
			options.io.stdout(`${body}\n`);
			return legacy.exitCode;
		}
		options.io.stdout(`${envelopeJsonText(toMachineEnvelope(exit))}\n`);
		return exitCodeForExit(exit, { shellExitCode: options.shellExitCode });
	}
	switch (exit.type) {
		case "ok": {
			options.io.stdout(`${renderOkData(exit.data, options)}\n`);
			return 0;
		}
		case "negative":
			if (options.shellExitCode === true) {
				options.io.stderr(`${exit.message}\n`);
				return 1;
			}
			options.io.stdout(`${exit.message}\n`);
			return 0;
		case "shell-negative":
			options.io.stderr(`${exit.message}\n`);
			return 1;
		case "failure":
			options.io.stderr(`error: ${exit.message}\n`);
			return 2;
	}
}

function renderOkData<T>(data: T, options: EmitExitOptions<T>): string {
	const caps: RenderCapabilities = { canEmitAnsi: options.io.canEmitAnsi === true };
	if (options.format === "markdown" && options.renderMarkdown !== undefined) {
		return options.renderMarkdown(data, caps);
	}
	return options.renderHuman === undefined ? envelopeJsonText(data) : options.renderHuman(data, caps);
}
