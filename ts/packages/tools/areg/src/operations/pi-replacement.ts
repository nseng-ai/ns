import { derivePiReplacementSurface, KNOWN_PI_COMMAND_NAMESPACES } from "@sdl/pi/commands";

export { KNOWN_PI_COMMAND_NAMESPACES, SPECIALIZED_SKILL_REPLACEMENTS } from "@sdl/pi/commands";

export interface PiReplacementFacts {
	verifiedSurfaces: readonly string[];
}

export interface PiReplacementVerification {
	verified: boolean;
	surface?: string | undefined;
}

export function derivePiReplacementCommand(
	skillName: string,
	namespaces: readonly string[] = KNOWN_PI_COMMAND_NAMESPACES,
): string | undefined {
	return derivePiReplacementSurface(skillName, namespaces);
}

export function verifyPiReplacement(
	skillName: string,
	facts: PiReplacementFacts,
): PiReplacementVerification {
	const surface = derivePiReplacementCommand(skillName);
	if (surface === undefined) return { verified: false };
	return { verified: facts.verifiedSurfaces.includes(surface), surface };
}

export function formatReplacementLabel(replacement: PiReplacementVerification): string {
	const prefix = replacement.verified ? "replacement-verified" : "replacement-missing";
	return replacement.surface === undefined ? prefix : `${prefix}:${replacement.surface}`;
}

export function replacementAdvice(skillName: string, surface: string | undefined): string {
	const expected = surface === undefined ? "a replacement Pi command" : `/${surface}`;
	return [
		`Skill '${skillName}' would hide /skill:${skillName} in Pi, but ${expected} is not verified.`,
		`Add a replacement command that reads skills/${skillName}/SKILL.md directly because native Pi skill discovery will exclude /skill:${skillName}.`,
		"Add tests proving the command works while the backing skill is excluded.",
	].join(" ");
}
