import type {
	SdlCommandIo,
	SdlCommandMessageOptions,
	SdlExtensionApi,
	SdlNotifyLevel,
	SdlOutputStream,
} from "sdl-sdk";

export interface SdlExtensionCommandIoOptions {
	statusKey?: string;
	shouldSuppress?: boolean;
}

export interface CliCommandIoInput {
	stdout?: (text: string) => void;
	stderr?: (text: string) => void;
	onOutput?: (stream: SdlOutputStream, text: string) => void;
}

export interface CliCommandIoOptions {
	/** Invoked once per error-level notification, e.g. to flip a CLI exit flag. */
	onNotifyError?: () => void;
	/** Suppress transient phase and info notifications for structured output modes. */
	shouldSuppress?: boolean;
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
	notifyUi?: (message: string, level?: SdlNotifyLevel) => void;
	/**
	 * Rich scrollback sink that renders durable messages and can carry opaque
	 * structured presentation details (e.g. a Pi custom message). When absent,
	 * `message` falls back to transient phase text (or is dropped when isRichOnly).
	 */
	richMessage?: (message: string, options: { level: SdlNotifyLevel; details?: unknown }) => void;
	/** Suppress transient phase entirely (machine/structured output). */
	shouldSuppress?: boolean;
}

export { noopSdlCommandIo, noopSdlProgress } from "sdl-sdk";

export async function runWithSdlCommandIo<T>(
	io: SdlCommandIo,
	fn: (io: SdlCommandIo) => Promise<T>,
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
): SdlCommandIo {
	const io = createCommandIo({
		...(input.onOutput === undefined
			? {}
			: { phaseTransient: (text: string) => input.onOutput?.("stderr", text) }),
		...(input.stderr === undefined ? {} : { phaseFallback: input.stderr }),
		...(input.stdout === undefined ? {} : { notifyInfo: input.stdout }),
		...(input.stderr === undefined ? {} : { notifyDiagnostic: input.stderr }),
		...(options.shouldSuppress === undefined ? {} : { shouldSuppress: options.shouldSuppress }),
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

export function createCommandIo(channels: CommandIoChannels): SdlCommandIo {
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

	function notify(message: string, level: SdlNotifyLevel = "info"): void {
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

	function message(text: string, options: SdlCommandMessageOptions = {}): void {
		const level = options.level ?? "info";
		if (channels.richMessage !== undefined) {
			channels.richMessage(text, {
				level,
				...(options.details === undefined ? {} : { details: options.details }),
			});
			return;
		}
		if (options.isRichOnly === true) return;
		phase(text);
	}

	function clearPhase(): void {
		channels.phaseSticky?.(undefined);
	}

	return { phase, notify, message, clearPhase };
}

export function commandIoFromSdlExtensionApi(
	ctx: SdlExtensionApi,
	options: SdlExtensionCommandIoOptions = {},
): SdlCommandIo {
	if (options.shouldSuppress === undefined) return ctx.commandIo;
	return createCliCommandIo(
		{
			...(ctx.stdout === undefined ? {} : { stdout: ctx.stdout }),
			...(ctx.stderr === undefined ? {} : { stderr: ctx.stderr }),
			...(ctx.onOutput === undefined ? {} : { onOutput: ctx.onOutput }),
		},
		{ shouldSuppress: options.shouldSuppress },
	);
}
