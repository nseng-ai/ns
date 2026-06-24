export type NotifyLevel = "info" | "warning" | "error";

export interface CommandIo {
	/** Transient, human-facing phase text. Non-contractual wording; never stdout in machine mode. */
	phase(message: string): void;
	/** Terminal human notification (success/warning/error). */
	notify(message: string, level?: NotifyLevel): void;
	/** Clears any sticky transient phase (no-op for append-only sinks). */
	clearPhase(): void;
}

export interface CommandIoChannels {
	/** Preferred transient phase sink (e.g. live widget). */
	phaseTransient?: (text: string) => void;
	/** Sticky phase sink that must be cleared (e.g. Pi setStatus); receives undefined to clear. */
	phaseSticky?: (value: string | undefined) => void;
	/** Durable fallback for phase when no transient/sticky channel exists (e.g. stderr). */
	phaseFallback?: (text: string) => void;
	/** Notification sink for informational messages. */
	notifyInfo?: (text: string) => void;
	/** Notification sink for warning/error messages. */
	notifyDiagnostic?: (text: string) => void;
	/** Notification via Pi UI (level-aware), when present. */
	notifyUi?: (message: string, level?: NotifyLevel) => void;
	/** Suppress transient phase entirely (machine/structured output). */
	suppress?: boolean;
}

export const noopCommandIo: CommandIo = {
	phase: () => {},
	notify: () => {},
	clearPhase: () => {},
};

export async function runWithCommandIo<T>(
	io: CommandIo,
	fn: (io: CommandIo) => Promise<T>,
): Promise<T> {
	try {
		return await fn(io);
	} finally {
		io.clearPhase();
	}
}

export function createCommandIo(channels: CommandIoChannels): CommandIo {
	return {
		phase: (message) => {
			if (channels.suppress === true) return;
			if (channels.phaseSticky !== undefined) {
				channels.phaseSticky(message);
				return;
			}
			const line = `${message}\n`;
			if (channels.phaseTransient !== undefined) {
				channels.phaseTransient(line);
				return;
			}
			channels.phaseFallback?.(line);
		},
		notify: (message, level = "info") => {
			if (channels.notifyUi !== undefined) {
				channels.notifyUi(message, level);
				return;
			}
			const line = `${message.trimEnd()}\n`;
			if (level === "info" && channels.suppress !== true) {
				channels.notifyInfo?.(line);
				return;
			}
			channels.notifyDiagnostic?.(line);
		},
		clearPhase: () => {
			channels.phaseSticky?.(undefined);
		},
	};
}
