import {
	captureRequiredEffectiveSkill,
	type EffectiveSkillInventoryHost,
	type RequiredEffectiveSkill,
} from "@nseng-ai/pi-runtime/skills/expansion";
import { CREATE_HANDOFF_SKILL_NAME } from "./command-constants.ts";
import type { CommandContext } from "./runtime-types.ts";

export interface HandoffCreateSkillLoader {
	captureSkill(ctx: CommandContext, name: string): RequiredEffectiveSkill;
}

function effectiveSkillInventoryHost(ctx: CommandContext): EffectiveSkillInventoryHost {
	const getSystemPromptOptions = ctx.getSystemPromptOptions;
	return {
		getSystemPromptOptions:
			getSystemPromptOptions === undefined ? () => ({}) : () => getSystemPromptOptions.call(ctx),
	};
}

export const realHandoffCreateSkillLoader = {
	captureSkill(ctx: CommandContext, name: string): RequiredEffectiveSkill {
		return captureRequiredEffectiveSkill(effectiveSkillInventoryHost(ctx), name);
	},
} satisfies HandoffCreateSkillLoader;

export function captureCreateHandoffSkill(
	loader: HandoffCreateSkillLoader,
	ctx: CommandContext,
): RequiredEffectiveSkill {
	return loader.captureSkill(ctx, CREATE_HANDOFF_SKILL_NAME);
}
