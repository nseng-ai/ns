export type SdlNotifyLevel = "info" | "warning" | "error";

export interface SdlCommandMessageOptions {
	/** Notification level for text-only fallback sinks. Defaults to "info". */
	level?: SdlNotifyLevel;
	/**
	 * Opaque structured presentation payload for rich sinks (e.g. a Pi custom
	 * scrollback message's `details`). The SDK never inspects this value.
	 */
	details?: unknown;
	/**
	 * When true, emit only to a rich sink. Text-only sinks drop the message.
	 * Use for content already delivered through another durable channel (e.g. a
	 * CLI summary printed via notify) so it is not duplicated in fallback output.
	 */
	isRichOnly?: boolean;
}

export interface SdlCommandIo {
	/** Transient, human-facing phase text. Non-contractual wording; never stdout in machine mode. */
	phase(message: string): void;
	/** Terminal human notification (success/warning/error). */
	notify(message: string, level?: SdlNotifyLevel): void;
	/**
	 * Durable, human-facing scrollback message. Rich sinks (e.g. Pi custom
	 * messages) receive `details`; text-only sinks render the message as transient
	 * phase text, or drop it entirely when `isRichOnly` is set.
	 */
	message(message: string, options?: SdlCommandMessageOptions): void;
	/** Clears any sticky transient phase (no-op for append-only sinks). */
	clearPhase(): void;
}

export const noopSdlCommandIo: SdlCommandIo = {
	phase: () => {},
	notify: () => {},
	message: () => {},
	clearPhase: () => {},
};

export type SdlProgressPhaseEvent =
	| { type: "phase-started"; phaseKey: string; label?: string }
	| { type: "phase-progress"; phaseKey: string; label: string }
	| { type: "phase-done"; phaseKey: string; detail?: string }
	| { type: "phase-failed"; phaseKey: string; detail: string };

export type SdlProgressPhaseListener = (event: SdlProgressPhaseEvent) => void;

export interface SdlProgress {
	phase(event: SdlProgressPhaseEvent): void;
}

export const noopSdlProgress: SdlProgress = {
	phase: () => {},
};
