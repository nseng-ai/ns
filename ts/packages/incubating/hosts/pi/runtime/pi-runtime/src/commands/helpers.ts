import type { NotifyLevel } from "../runtime/tool-types.ts";

export interface NotifiableCommandContext {
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
	};
}

export function notifyCommandUi(
	ctx: NotifiableCommandContext,
	message: string,
	level: NotifyLevel,
): void {
	if (ctx.hasUI !== false) ctx.ui.notify(message, level);
}
