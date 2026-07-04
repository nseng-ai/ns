import { IMPL_BRANCH_CONTEXT_COMMAND_NAME } from "@ns/core/command";

export {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	BRANCH_CONTEXT_UPSTACK_IMPL_FROM_PLAN_COMMAND_NAME,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	IMPL_CURRENT_SAVED_PLAN_COMMAND_NAME,
	WRITE_GRILLED_PLAN_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
	specializedCommandBackedSkillsFromSpecs,
} from "@ns/core/command";
export type {
	CommandBackedSkillRegistration,
	CommandBackedSkillRegistrationKind,
	SpecializedCommandBackedSkillSpec,
} from "@ns/core/command";

export function formatImplBranchContextCommand(key: string): string {
	return `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${key}`;
}
