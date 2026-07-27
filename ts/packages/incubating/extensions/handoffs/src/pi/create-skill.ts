import {
	requireRepoSkillBlockFromPath,
	requireRepoSkillPath,
	type ExpandedSkillBlock,
} from "@nseng-ai/pi-runtime/skills/expansion";
import { CREATE_HANDOFF_SKILL_NAME } from "./command-constants.ts";

export interface HandoffCreateSkillLoader {
	resolveCreateHandoffSkillPath(cwd: string): Promise<string>;
	loadCreateHandoffSkill(skillPath: string): Promise<ExpandedSkillBlock>;
}

export const realHandoffCreateSkillLoader = {
	resolveCreateHandoffSkillPath(cwd: string): Promise<string> {
		return requireRepoSkillPath({ cwd, skillName: CREATE_HANDOFF_SKILL_NAME });
	},
	loadCreateHandoffSkill(skillPath: string): Promise<ExpandedSkillBlock> {
		return requireRepoSkillBlockFromPath({
			skillName: CREATE_HANDOFF_SKILL_NAME,
			skillPath,
		});
	},
} satisfies HandoffCreateSkillLoader;
