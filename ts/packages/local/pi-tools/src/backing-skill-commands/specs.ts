import {
	derivePiReplacementSurface,
	genericCommandStyleSkillNames,
	KNOWN_PI_COMMAND_NAMESPACES,
} from "@ji/pi/commands";

export interface DerivedPiCommand {
	surface: string;
	skillName: string;
	namespace: string;
	command: string;
}

export function derivePiReplacementCommand(skillName: string): DerivedPiCommand | undefined {
	const surface = derivePiReplacementSurface(skillName, KNOWN_PI_COMMAND_NAMESPACES);
	return surface === undefined ? undefined : buildDerivedPiCommand({ skillName, surface });
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
	for (const skillName of genericCommandStyleSkillNames()) {
		const derived = derivePiReplacementCommand(skillName);
		if (derived !== undefined) specs.push(derived);
	}
	return specs;
}
