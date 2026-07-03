export {
	commandBackedSkillRegistrations,
	commandBackedSkillSurface,
	genericBackingSkillRegistrations,
	specializedCommandBackedSkillRegistrations,
	visibleCommandBackedReplacementSurfaces,
} from "@ns/command-backed-skill-registry";
export type {
	CommandBackedSkillRegistration,
	CommandBackedSkillRegistrationKind,
} from "@ns/command-backed-skill-registry";

export { backingSkillCommandsParity } from "./parity.ts";
export { derivePiReplacementCommand, genericBackingSkillCommandSpecs } from "./specs.ts";
export type { DerivedPiCommand } from "./specs.ts";
export { default, registerBackingSkillCommands } from "./runtime.ts";
export type {
	BackingSkillCommand,
	BackingSkillCommandContext,
	BackingSkillCommandHost,
} from "./runtime.ts";
