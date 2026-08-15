import {
	requireEffectiveSkillBlock,
	requireEffectiveSkillSource,
	type EffectiveSkillInventoryHost,
	type ExpandedSkillBlock,
	type ResolvedSkillSource,
} from "@nseng-ai/pi-runtime/skills/expansion";
import type { CommandContext } from "./runtime-types.ts";
import { CREATE_HANDOFF_SKILL_NAME } from "./command-constants.ts";

export interface HandoffCreateSkillLoader {
	resolveCreateHandoffSkillSource(ctx: CommandContext): ResolvedSkillSource;
	loadCreateHandoffSkill(source: ResolvedSkillSource): Promise<ExpandedSkillBlock>;
}

function effectiveSkillInventoryHost(ctx: CommandContext): EffectiveSkillInventoryHost {
	const getSystemPromptOptions = ctx.getSystemPromptOptions;
	return {
		getSystemPromptOptions:
			getSystemPromptOptions === undefined ? () => ({}) : () => getSystemPromptOptions.call(ctx),
	};
}

export const realHandoffCreateSkillLoader = {
	resolveCreateHandoffSkillSource(ctx: CommandContext): ResolvedSkillSource {
		return requireEffectiveSkillSource(effectiveSkillInventoryHost(ctx), CREATE_HANDOFF_SKILL_NAME);
	},
	loadCreateHandoffSkill(source: ResolvedSkillSource): Promise<ExpandedSkillBlock> {
		return requireEffectiveSkillBlock(source);
	},
} satisfies HandoffCreateSkillLoader;
