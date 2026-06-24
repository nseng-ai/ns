import { createCommandIo, type CommandIo, type NotifyLevel } from "@sdl/core/command-io";

interface PiCommandIoContext {
	ui: {
		setStatus?(key: string, value: string | undefined): void;
		notify(message: string, level?: NotifyLevel): void;
	};
}

export interface PiCommandIoOptions {
	statusKey: string;
	suppress?: boolean;
}

export function commandIoFromPiContext(
	ctx: PiCommandIoContext,
	options: PiCommandIoOptions,
): CommandIo {
	return createCommandIo({
		...(ctx.ui.setStatus === undefined
			? {}
			: {
					phaseSticky: (value: string | undefined) => ctx.ui.setStatus?.(options.statusKey, value),
				}),
		notifyUi: (message, level) => ctx.ui.notify(message, level),
		...(options.suppress === undefined ? {} : { suppress: options.suppress }),
	});
}
