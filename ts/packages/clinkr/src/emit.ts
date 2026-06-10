import { envelopeJsonText, exitCodeForExit, toMachineEnvelope, type ClinkrExit } from "./exit.ts";
import type { ClinkrIo } from "./io.ts";

export type ClinkrFormat = "human" | "json";

export interface LegacyMachineOutput {
	body: unknown;
	exitCode: number;
}

export interface EmitExitOptions<T> {
	format: ClinkrFormat;
	io: ClinkrIo;
	renderHuman?: ((data: T) => string) | undefined;
	legacyMachine?: ((exit: ClinkrExit<T>) => LegacyMachineOutput) | undefined;
}

/**
 * Sole owner of format dispatch. Returns the process exit code; never exits.
 */
export function emitExit<T>(exit: ClinkrExit<T>, options: EmitExitOptions<T>): number {
	if (options.format === "json") {
		if (options.legacyMachine !== undefined) {
			const legacy = options.legacyMachine(exit);
			options.io.stdout(`${envelopeJsonText(legacy.body)}\n`);
			return legacy.exitCode;
		}
		options.io.stdout(`${envelopeJsonText(toMachineEnvelope(exit))}\n`);
		return exitCodeForExit(exit);
	}
	switch (exit.type) {
		case "ok": {
			const rendered =
				options.renderHuman === undefined
					? envelopeJsonText(exit.data)
					: options.renderHuman(exit.data);
			options.io.stdout(`${rendered}\n`);
			return 0;
		}
		case "negative":
			options.io.stderr(`${exit.message}\n`);
			return 1;
		case "failure":
			options.io.stderr(`error: ${exit.message}\n`);
			return 2;
	}
}
