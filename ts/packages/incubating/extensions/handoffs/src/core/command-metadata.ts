import {
	nsCommandSurface,
	specializedCommandBackedSkillsFromSpecs,
} from "@nseng-ai/foundation/command";

const HANDOFF_EXTENSION_ID = "handoff";

/**
 * Derive a stable Handoff slash-command surface (`ns:handoff:<action>`).
 *
 * The create/pickup names below are harness-independent metadata consumed
 * across packages (Skill Exposure); host adapters derive their own
 * presentation-only command names through this same function.
 */
export function handoffCommandSurface(action: string): string {
	return nsCommandSurface(HANDOFF_EXTENSION_ID, action);
}

export const CREATE_HANDOFF_COMMAND_NAME = handoffCommandSurface("create");
export const PICKUP_HANDOFF_COMMAND_NAME = handoffCommandSurface("pickup");

/**
 * Declarative command-backed skill metadata: repo-local skills that hosts
 * surface as the stable Handoff slash commands instead of ordinary
 * `/skill:<name>` invocations.
 */
export const handoffCommandBackedSkillRegistrations = specializedCommandBackedSkillsFromSpecs([
	{ skillName: "handoff-create", surface: CREATE_HANDOFF_COMMAND_NAME },
	{ skillName: "handoff-pickup", surface: PICKUP_HANDOFF_COMMAND_NAME },
]);
