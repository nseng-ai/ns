export const PI_EXTENSION_COMMAND_FINISHED_EVENT = "asdl:pi-extension-command:finished";

export interface PiExtensionCommandFinishedEvent {
	readonly commandName: string;
	readonly cwd: string;
	readonly source: string;
	readonly status: "completed" | "rejected";
	readonly exitCode?: number;
}

export interface PiExtensionCommandEventEmitter {
	emit(
		event: typeof PI_EXTENSION_COMMAND_FINISHED_EVENT,
		payload: PiExtensionCommandFinishedEvent,
	): void;
}

export interface PiExtensionCommandEventBus extends PiExtensionCommandEventEmitter {
	on(
		event: typeof PI_EXTENSION_COMMAND_FINISHED_EVENT,
		handler: PiExtensionCommandEventHandler,
	): void;
}

export type PiExtensionCommandEventHandler = (
	payload: PiExtensionCommandFinishedEvent,
) => Promise<void> | void;

export function emitPiExtensionCommandFinished(
	events: PiExtensionCommandEventEmitter | undefined,
	payload: PiExtensionCommandFinishedEvent,
): void {
	try {
		events?.emit(PI_EXTENSION_COMMAND_FINISHED_EVENT, payload);
	} catch {
		// Command lifecycle notifications are best-effort observability hooks.
	}
}
