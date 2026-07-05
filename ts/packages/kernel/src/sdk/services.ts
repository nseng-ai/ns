export type NsNotifyLevel = "info" | "warning" | "error";

export interface NsCommandMessageOptions {
	/** Notification level for text-only fallback sinks. Defaults to "info". */
	level?: NsNotifyLevel;
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

export interface NsCommandIo {
	/** Transient, human-facing phase text. Non-contractual wording; never stdout in machine mode. */
	phase(message: string): void;
	/** Terminal human notification (success/warning/error). */
	notify(message: string, level?: NsNotifyLevel): void;
	/**
	 * Durable, human-facing scrollback message. Rich sinks (e.g. Pi custom
	 * messages) receive `details`; text-only sinks render the message as transient
	 * phase text, or drop it entirely when `isRichOnly` is set.
	 */
	message(message: string, options?: NsCommandMessageOptions): void;
	/** Clears any sticky transient phase (no-op for append-only sinks). */
	clearPhase(): void;
}

export const noopNsCommandIo: NsCommandIo = {
	phase: () => {},
	notify: () => {},
	message: () => {},
	clearPhase: () => {},
};

export type NsProgressPhaseEvent =
	| { type: "phase-started"; phaseKey: string; label?: string }
	| { type: "phase-progress"; phaseKey: string; label: string }
	| { type: "phase-done"; phaseKey: string; detail?: string }
	| { type: "phase-failed"; phaseKey: string; detail: string };

export type NsProgressPhaseListener = (event: NsProgressPhaseEvent) => void;

export interface NsProgress {
	phase(event: NsProgressPhaseEvent): void;
}

export const noopNsProgress: NsProgress = {
	phase: () => {},
};
