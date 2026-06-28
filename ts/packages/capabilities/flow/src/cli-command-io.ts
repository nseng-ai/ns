import { createCommandIo, type CommandIo } from "@sdl/core/command-io";
import type { ExecOutputListener } from "@sdl/core/exec";

/** Minimal CLI stream/callback surface that CCC standalone commands adapt to CommandIo. */
export interface FlowCliCommandIoInput {
	stdout(text: string): void;
	stderr(text: string): void;
	onOutput?: ExecOutputListener | undefined;
}

export interface FlowCliCommandIoOptions {
	/** Invoked once per error-level notification, e.g. to flip a CLI exit flag. */
	onNotifyError?: () => void;
}

/**
 * Shared Flow edge adapter mapping CLI stdout/stderr/onOutput callbacks onto a
 * CommandIo. This intentionally stays below `@sdl/pi`: the SDK wrapper
 * `commandIoFromSdlExtensionApi` lives above Flow, so reusing it would couple lower
 * Flow orchestration to `SdlExtensionApi`.
 *
 * Mapping: live `onOutput` callbacks receive transient phase text on stderr; the
 * durable phase fallback and diagnostic notifications go to stderr; informational
 * notifications go to stdout.
 */
export function createFlowCliCommandIo(
	input: FlowCliCommandIoInput,
	options: FlowCliCommandIoOptions = {},
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
