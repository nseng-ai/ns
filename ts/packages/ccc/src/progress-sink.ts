export interface ProgressSink {
	/**
	 * Human-facing phase text only. CLI sinks write this to stderr and Pi sinks use transient
	 * status; wording is intentionally not a stable machine-readable contract.
	 */
	phase(message: string): void;
	clear?(): void;
}

export const noopProgressSink: ProgressSink = {
	phase: () => {},
};

export function createStderrProgressSink(stderr: (text: string) => void): ProgressSink {
	return {
		phase: (message) => {
			stderr(`${message.trimEnd()}\n`);
		},
	};
}

export function createStatusProgressSink(
	setStatus: (message: string | undefined) => void,
): ProgressSink {
	return {
		phase: (message) => {
			setStatus(message);
		},
		clear: () => {
			setStatus(undefined);
		},
	};
}

export interface ForwardingProgressChannels {
	/** Transient live-progress channel (UI bridges); preferred when present. */
	onOutput?: ((stream: "stdout" | "stderr", text: string) => void) | undefined;
	/** Durable stderr stream; used only when no transient channel is available. */
	stderr?: ((text: string) => void) | undefined;
}

/**
 * Progress sink for CLI commands fronted by a UI bridge. Phase text prefers the
 * transient `onOutput` channel so it shows in a live widget without polluting the
 * command's final rendered result; it falls back to durable stderr only when no
 * transient channel exists (plain CLI). Wording is human-facing and not a stable
 * machine-readable contract.
 */
export function createForwardingProgressSink(channels: ForwardingProgressChannels): ProgressSink {
	return {
		phase: (message) => {
			const line = `${message.trimEnd()}\n`;
			if (channels.onOutput !== undefined) {
				channels.onOutput("stderr", line);
				return;
			}
			channels.stderr?.(line);
		},
	};
}
