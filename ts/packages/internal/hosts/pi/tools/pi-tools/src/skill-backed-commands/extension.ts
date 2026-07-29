export {
	genericBackingSkillRegistrations,
	skillBackedCommandRegistrations,
	skillBackedCommandSurface,
	specializedSkillBackedCommandRegistrations,
	visibleSkillBackedCommandSurfaces,
} from "@nseng-ai/skill-exposure/replacement-registry";
export type {
	SkillBackedCommandRegistration,
	SkillBackedCommandRegistrationKind,
} from "@nseng-ai/foundation/command";

export { skillBackedCommandsParity } from "./parity.ts";
export { derivePiReplacementCommand, genericSkillBackedCommandSpecs } from "./specs.ts";
export type { DerivedPiCommand } from "./specs.ts";
export { default, registerSkillBackedCommands } from "./runtime.ts";
export type {
	SkillBackedCommand,
	SkillBackedCommandContext,
	SkillBackedCommandHost,
} from "./runtime.ts";
