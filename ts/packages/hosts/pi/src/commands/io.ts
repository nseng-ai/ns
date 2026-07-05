import { createCommandIo } from "@ns/kernel/command-io";
import type { NsCommandIo, NsNotifyLevel } from "@ns/kernel/sdk";

interface PiCommandIoContext {
	ui: {
		setStatus?(key: string, value: string | undefined): void;
		notify(message: string, level?: NsNotifyLevel): void;
	};
}

export interface PiCommandIoOptions {
	statusKey: string;
	shouldSuppress?: boolean;
}

export function commandIoFromPiContext(
	ctx: PiCommandIoContext,
	options: PiCommandIoOptions,
): NsCommandIo {
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
