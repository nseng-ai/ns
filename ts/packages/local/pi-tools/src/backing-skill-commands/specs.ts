import { genericBackingSkillRegistrations } from "./registry.ts";

export interface DerivedPiCommand {
	surface: string;
	skillName: string;
	namespace: string;
	command: string;
}

export function derivePiReplacementCommand(skillName: string): DerivedPiCommand | undefined {
	const registration = genericBackingSkillRegistrations().find(
		(candidate) => candidate.skillName === skillName,
	);
	return registration === undefined
		? undefined
		: buildDerivedPiCommand({ skillName: registration.skillName, surface: registration.surface });
}

function buildDerivedPiCommand(options: {
	skillName: string;
	surface: string;
}): DerivedPiCommand | undefined {
	const { skillName, surface } = options;
	const separator = surface.indexOf(":");
	if (separator <= 0 || separator === surface.length - 1) return undefined;
	return {
		surface,
		skillName,
		namespace: surface.slice(0, separator),
		command: surface.slice(separator + 1),
	};
}

export function genericBackingSkillCommandSpecs(): DerivedPiCommand[] {
	const specs: DerivedPiCommand[] = [];
	for (const registration of genericBackingSkillRegistrations()) {
		const derived = buildDerivedPiCommand({
			skillName: registration.skillName,
			surface: registration.surface,
		});
		if (derived !== undefined) specs.push(derived);
	}
	return specs;
}
