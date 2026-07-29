import {
	nsCommandSurface,
	specializedSkillBackedCommandsFromSpecs,
} from "@nseng-ai/foundation/command";

const HANDOFF_EXTENSION_ID = "handoff";
type HandoffCommandAction = "create" | "pickup";

function handoffCommandSurface(action: HandoffCommandAction): string {
	return nsCommandSurface(HANDOFF_EXTENSION_ID, action);
}

export const CREATE_HANDOFF_COMMAND_NAME = handoffCommandSurface("create");
export const PICKUP_HANDOFF_COMMAND_NAME = handoffCommandSurface("pickup");

export const handoffSkillBackedCommandRegistrations = specializedSkillBackedCommandsFromSpecs([
	{ skillName: "handoff-create", surface: CREATE_HANDOFF_COMMAND_NAME },
	{ skillName: "handoff-pickup", surface: PICKUP_HANDOFF_COMMAND_NAME },
]);
