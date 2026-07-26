import type { BaseRuntimeContext } from "./runtime-types.ts";

export interface HandoffStartMessages {
	ready: string;
}

export function setStatus(ctx: BaseRuntimeContext, key: string, value: string | undefined): void {
	if (ctx.hasUI) {
		ctx.ui.setStatus?.(key, value);
	}
}

export function createHandoffStartMessage(messages: HandoffStartMessages): string {
	return messages.ready;
}
