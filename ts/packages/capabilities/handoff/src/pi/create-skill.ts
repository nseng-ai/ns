import { formatErrorMessage } from "@sdl/core/primitives";
import { expandRepoSkillBlock, type ExpandedSkillBlock } from "@sdl/pi/skills/expansion";
import { CREATE_HANDOFF_SKILL_NAME } from "./command-constants.ts";

export type HandoffCreateSkillLoadResult =
	| { type: "found"; skill: ExpandedSkillBlock }
	| { type: "missing" }
	| { type: "failed"; message: string };

export interface HandoffCreateSkillLoader {
	loadCreateHandoffSkill(cwd: string): Promise<HandoffCreateSkillLoadResult>;
}

export const realHandoffCreateSkillLoader = {
	async loadCreateHandoffSkill(cwd: string): Promise<HandoffCreateSkillLoadResult> {
		try {
			const skill = await expandHandoffSkill(cwd, CREATE_HANDOFF_SKILL_NAME);
			if (skill === undefined) {
				return { type: "missing" };
			}
			return { type: "found", skill };
		} catch (error) {
			return { type: "failed", message: formatErrorMessage(error) };
		}
	},
} satisfies HandoffCreateSkillLoader;

export async function expandHandoffSkill(
	cwd: string,
	skillName: string,
): Promise<ExpandedSkillBlock | undefined> {
	try {
		return await expandRepoSkillBlock({ cwd, skillName });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.startsWith("Could not find ")) {
			return undefined;
		}
		throw error;
	}
}
