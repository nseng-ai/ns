import { createCommandIo } from "@ji/kernel/command-io";
import type { SdlCommandIo, SdlNotifyLevel } from "@ji/kernel/sdk";

interface PiCommandIoContext {
	ui: {
		setStatus?(key: string, value: string | undefined): void;
		notify(message: string, level?: SdlNotifyLevel): void;
	};
}

export interface PiCommandIoOptions {
	statusKey: string;
	shouldSuppress?: boolean;
}

export function commandIoFromPiContext(
	ctx: PiCommandIoContext,
	options: PiCommandIoOptions,
): SdlCommandIo {
	return createCommandIo({
		...(ctx.ui.setStatus === undefined
			? {}
			: {
					phaseSticky: (value: string | undefined) => ctx.ui.setStatus?.(options.statusKey, value),
				}),
		notifyUi: (message, level) => ctx.ui.notify(message, level),
		...(options.shouldSuppress === undefined ? {} : { shouldSuppress: options.shouldSuppress }),
	});
}
