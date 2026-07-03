export {
	COMMAND_BACKED_SKILL_REGISTRY,
	commandBackedSkillRegistrations,
	commandBackedSkillSurface,
	genericBackingSkillRegistrations,
	specializedCommandBackedSkillRegistrations,
	visibleCommandBackedReplacementSurfaces,
} from "@ji/pi/commands";
export type {
	CommandBackedSkillRegistration,
	CommandBackedSkillRegistrationKind,
} from "@ji/pi/commands";

export { backingSkillCommandsParity } from "./parity.ts";
export { derivePiReplacementCommand, genericBackingSkillCommandSpecs } from "./specs.ts";
export type { DerivedPiCommand } from "./specs.ts";
export { default, registerBackingSkillCommands } from "./runtime.ts";
export type {
	BackingSkillCommand,
	BackingSkillCommandContext,
	BackingSkillCommandHost,
} from "./runtime.ts";
