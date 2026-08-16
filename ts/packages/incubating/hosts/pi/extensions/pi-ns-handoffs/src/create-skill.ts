import {
	captureRequiredEffectiveSkill,
	type RequiredEffectiveSkill,
} from "@nseng-ai/pi-runtime/skills/expansion";
import { CREATE_HANDOFF_SKILL_NAME } from "./command-constants.ts";
import type { CommandContext } from "./runtime-types.ts";

export interface HandoffCreateSkillLoader {
	captureSkill(ctx: CommandContext, name: string): RequiredEffectiveSkill;
}

export const realHandoffCreateSkillLoader = {
	captureSkill(ctx: CommandContext, name: string): RequiredEffectiveSkill {
		return captureRequiredEffectiveSkill(ctx, name);
	},
} satisfies HandoffCreateSkillLoader;

export function captureCreateHandoffSkill(
	loader: HandoffCreateSkillLoader,
	ctx: CommandContext,
): RequiredEffectiveSkill {
	return loader.captureSkill(ctx, CREATE_HANDOFF_SKILL_NAME);
}
