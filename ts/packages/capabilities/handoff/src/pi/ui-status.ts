import type { ExpandedSkillBlock } from "@ji/pi/skills/expansion";
import type { BaseRuntimeContext } from "./runtime-types.ts";

export interface HandoffStartMessages {
	ready: string;
	fallbackLabel: string;
}

export function setStatus(ctx: BaseRuntimeContext, key: string, value: string | undefined): void {
	if (ctx.hasUI) {
		ctx.ui.setStatus?.(key, value);
	}
}

export function createHandoffStartMessage(
	messages: HandoffStartMessages,
	skill: ExpandedSkillBlock | undefined,
	skillReadError: string | undefined,
): string {
	if (skill !== undefined) {
		return messages.ready;
	}
	if (skillReadError !== undefined) {
		return `Could not read handoff-create skill; using fallback ${messages.fallbackLabel}. ${skillReadError}`;
	}
	return `handoff-create skill was not found; using fallback ${messages.fallbackLabel}.`;
}
