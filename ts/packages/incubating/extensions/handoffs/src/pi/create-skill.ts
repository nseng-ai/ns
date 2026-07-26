import {
	requireRepoSkillBlock,
	type ExpandedSkillBlock,
} from "@nseng-ai/pi-runtime/skills/expansion";
import { CREATE_HANDOFF_SKILL_NAME } from "./command-constants.ts";

export interface HandoffCreateSkillLoader {
	loadCreateHandoffSkill(cwd: string): Promise<ExpandedSkillBlock>;
}

export const realHandoffCreateSkillLoader = {
	loadCreateHandoffSkill(cwd: string): Promise<ExpandedSkillBlock> {
		return requireRepoSkillBlock({ cwd, skillName: CREATE_HANDOFF_SKILL_NAME });
	},
} satisfies HandoffCreateSkillLoader;
