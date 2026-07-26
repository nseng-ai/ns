import {
	expandRepoSkillBlock,
	type ExpandedSkillBlock,
} from "@nseng-ai/pi-runtime/skills/expansion";
import { CREATE_HANDOFF_SKILL_NAME } from "./command-constants.ts";

export interface HandoffCreateSkillLoader {
	loadCreateHandoffSkill(cwd: string): Promise<ExpandedSkillBlock>;
}

export const realHandoffCreateSkillLoader = {
	async loadCreateHandoffSkill(cwd: string): Promise<ExpandedSkillBlock> {
		try {
			return await expandRepoSkillBlock({ cwd, skillName: CREATE_HANDOFF_SKILL_NAME });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Could not load required skill "${CREATE_HANDOFF_SKILL_NAME}": ${message}`, {
				cause: error,
			});
		}
	},
} satisfies HandoffCreateSkillLoader;

export async function expandHandoffSkill(
	cwd: string,
	skillName: string,
): Promise<ExpandedSkillBlock> {
	try {
		return await expandRepoSkillBlock({ cwd, skillName });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Could not load required skill "${skillName}": ${message}`, { cause: error });
	}
}
