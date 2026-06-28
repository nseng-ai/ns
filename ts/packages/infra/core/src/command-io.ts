import type { ExecOutputListener } from "./exec.ts";

export type NotifyLevel = "info" | "warning" | "error";

export interface CommandMessageOptions {
	/** Notification level for text-only fallback sinks. Defaults to "info". */
	level?: NotifyLevel;
	/**
	 * Opaque structured presentation payload for rich sinks (e.g. a Pi custom
	 * scrollback message's `details`). Core never inspects this value.
	 */
	details?: unknown;
	/**
	 * When true, emit only to a rich sink. Text-only sinks drop the message.
	 * Use for content already delivered through another durable channel (e.g. a
	 * CLI summary printed via notify) so it is not duplicated in fallback output.
	 */
	isRichOnly?: boolean;
}

export interface CommandIo {
	/** Transient, human-facing phase text. Non-contractual wording; never stdout in machine mode. */
	phase(message: string): void;
	/** Terminal human notification (success/warning/error). */
	notify(message: string, level?: NotifyLevel): void;
	/**
	 * Durable, human-facing scrollback message. Rich sinks (e.g. Pi custom
	 * messages) receive `details`; text-only sinks render the message as transient
	 * phase text, or drop it entirely when `isRichOnly` is set.
	 */
	message(message: string, options?: CommandMessageOptions): void;
	/** Clears any sticky transient phase (no-op for append-only sinks). */
	clearPhase(): void;
}

export interface CliCommandIoInput {
	stdout(text: string): void;
	stderr(text: string): void;
	onOutput?: ExecOutputListener | undefined;
}

export interface CliCommandIoOptions {
	/** Invoked once per error-level notification, e.g. to flip a CLI exit flag. */
	onNotifyError?: () => void;
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
	/**
	 * Rich scrollback sink that renders durable messages and can carry opaque
	 * structured presentation details (e.g. a Pi custom message). When absent,
	 * `message` falls back to transient phase text (or is dropped when isRichOnly).
	 */
	richMessage?: (message: string, options: { level: NotifyLevel; details?: unknown }) => void;
	/** Suppress transient phase entirely (machine/structured output). */
	shouldSuppress?: boolean;
}

export const noopCommandIo: CommandIo = {
	phase: () => {},
	notify: () => {},
	message: () => {},
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

export function createCliCommandIo(
	input: CliCommandIoInput,
	options: CliCommandIoOptions = {},
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

export function createCommandIo(channels: CommandIoChannels): CommandIo {
	function phase(message: string): void {
		if (channels.shouldSuppress === true) return;
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
	}

	function notify(message: string, level: NotifyLevel = "info"): void {
		if (channels.notifyUi !== undefined) {
			channels.notifyUi(message, level);
			return;
		}
		const line = `${message.trimEnd()}\n`;
		if (level === "info" && channels.shouldSuppress !== true) {
			channels.notifyInfo?.(line);
			return;
		}
		channels.notifyDiagnostic?.(line);
	}

	function message(text: string, options: CommandMessageOptions = {}): void {
		const level = options.level ?? "info";
		if (channels.richMessage !== undefined) {
			channels.richMessage(text, {
				level,
				...(options.details === undefined ? {} : { details: options.details }),
			});
			return;
		}
		if (options.isRichOnly === true) return;
		// Text-only sinks render durable scrollback as transient progress text.
		phase(text);
	}

	function clearPhase(): void {
		channels.phaseSticky?.(undefined);
	}

	return { phase, notify, message, clearPhase };
}
