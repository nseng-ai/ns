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
