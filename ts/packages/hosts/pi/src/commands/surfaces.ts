export const BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME = "ji:branch-context:from-plan";
export const BRANCH_CONTEXT_UPSTACK_IMPL_FROM_PLAN_COMMAND_NAME =
	"ji:branch-context:upstack-impl-from-plan";
export const IMPL_BRANCH_CONTEXT_COMMAND_NAME = "ji:branch-context:impl-attached-plan";

export function formatImplBranchContextCommand(key: string): string {
	return `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${key}`;
}

export const WRITE_PLAN_COMMAND_NAME = "ji:plan:save";
export const WRITE_GRILLED_PLAN_COMMAND_NAME = "ji:plan:grill-and-save";
export const IMPL_CURRENT_SAVED_PLAN_COMMAND_NAME = "ji:plan:impl-current";

export type CommandBackedSkillRegistrationKind = "generic-backing-skill" | "specialized-command";

export interface CommandBackedSkillRegistration {
	skillName: string;
	surface: string;
	kind: CommandBackedSkillRegistrationKind;
}

export function specializedCommandBackedSkill(
	skillName: string,
	surface: string,
): CommandBackedSkillRegistration {
	return { skillName, surface, kind: "specialized-command" };
}
