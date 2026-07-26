export {
	commandBackedSkillRegistrations,
	commandBackedSkillSurface,
	genericBackingSkillRegistrations,
	specializedCommandBackedSkillRegistrations,
	visibleCommandBackedReplacementSurfaces,
} from "@nseng-ai/skill-exposure/replacement-registry";
export type {
	CommandBackedSkillRegistration,
	CommandBackedSkillRegistrationKind,
} from "@nseng-ai/skill-exposure/replacement-registry";

export { backingSkillCommandsParity } from "./parity.ts";
export { derivePiReplacementCommand, genericBackingSkillCommandSpecs } from "./specs.ts";
export type { DerivedPiCommand } from "./specs.ts";
export { default, registerBackingSkillCommands } from "./runtime.ts";
export type {
	BackingSkillCommand,
	BackingSkillCommandContext,
	BackingSkillCommandHost,
} from "./runtime.ts";
