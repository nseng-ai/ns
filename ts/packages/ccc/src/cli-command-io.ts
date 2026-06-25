import { createCommandIo, type CommandIo } from "@sdl/core/command-io";
import type { ExecOutputListener } from "@sdl/core/exec";

/** Minimal CLI stream/callback surface that CCC standalone commands adapt to CommandIo. */
export interface CccCliCommandIoInput {
	stdout(text: string): void;
	stderr(text: string): void;
	onOutput?: ExecOutputListener | undefined;
}

export interface CccCliCommandIoOptions {
	/** Invoked once per error-level notification, e.g. to flip a CLI exit flag. */
	onNotifyError?: () => void;
}

/**
 * Shared CCC edge adapter mapping CLI stdout/stderr/onOutput callbacks onto a
 * CommandIo. This intentionally stays below `@sdl/pi`: the SDK wrapper
 * `commandIoFromSdlExtensionApi` lives above CCC, so reusing it would couple lower
 * CCC orchestration (land, autoslot) to `SdlExtensionApi` and risk a
 * CCC -> pi cycle. Both adapters previously hand-rolled this identical
 * mapping; it now lives here once.
 *
 * Mapping: live `onOutput` callbacks receive transient phase text on stderr; the
 * durable phase fallback and diagnostic notifications go to stderr; informational
 * notifications go to stdout.
 */
export function createCccCliCommandIo(
	input: CccCliCommandIoInput,
	options: CccCliCommandIoOptions = {},
): CommandIo {
	const io = createCommandIo({
		...(input.onOutput === undefined
			? {}
			: { phaseTransient: (text: string) => input.onOutput?.("stderr", text) }),
		phaseFallback: input.stderr,
		notifyInfo: input.stdout,
		notifyDiagnostic: input.stderr,
	});

	const onNotifyError = options.onNotifyError;
	if (onNotifyError === undefined) return io;

	return {
		...io,
		notify: (message, level = "info") => {
			if (level === "error") onNotifyError();
			io.notify(message, level);
		},
	};
}
