import { commandBackedSkillSurface } from "@ji/pi/commands";

export interface PiReplacementFacts {
	verifiedSurfaces: readonly string[];
}

export interface PiReplacementVerification {
	verified: boolean;
	surface?: string;
}

export function derivePiReplacementCommand(skillName: string): string | undefined {
	return commandBackedSkillSurface(skillName);
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
		`Add a replacement command that resolves '${skillName}' with shared skill lookup / areg skill find semantics, then reads the returned preferred SKILL.md path because native Pi skill discovery will exclude /skill:${skillName}.`,
		"Add tests proving the command works while the backing skill is excluded.",
	].join(" ");
}
