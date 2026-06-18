export const KNOWN_PI_COMMAND_NAMESPACES = [
	"branch-context",
	"enriched-plan",
	"objective",
	"handoff",
	"context",
	"changelog",
	"typescript",
	"python",
	"refactor",
	"setup",
	"create",
	"skill",
	"code",
	"ccc",
	"claude",
	"dev",
	"cli",
	"pr",
	"sdl",
	"pi",
	"stack",
] as const;

export const SPECIALIZED_SKILL_REPLACEMENTS: Readonly<Record<string, string>> = {
	"branch-context-from-plan": "branch-context:from-plan",
	"branch-context-impl": "branch-context:impl",
	"enriched-plan-save": "enriched-plan:save",
	"handoff-create": "handoff:create",
	"handoff-pickup": "handoff:pickup",
	"objective-create": "objective:create",
	"objective-current": "objective:current",
	"objective-next": "objective:next",
	"objective-stack-impl": "objective:stack-impl",
	"objective-update": "objective:update",
	"pi-grill-ui": "pi:grill-me",
	"pi-grill-with-docs-ui": "pi:grill-with-docs",
	"code-autobranch": "sdl:code:autobranch",
	"code-checkpoint": "sdl:code:checkpoint",
	"code-just-fix": "code:just-fix",
	"code-submit": "sdl:code:submit",
	"ccc-sidebar": "ccc:sidebar:pr-summary",
};

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
	for (const namespace of [...namespaces].sort((left, right) => right.length - left.length)) {
		const prefix = `${namespace}-`;
		if (skillName.startsWith(prefix)) return `${namespace}:${skillName.slice(prefix.length)}`;
	}
	const firstHyphen = skillName.indexOf("-");
	if (firstHyphen <= 0 || firstHyphen === skillName.length - 1) return undefined;
	return `${skillName.slice(0, firstHyphen)}:${skillName.slice(firstHyphen + 1)}`;
}

export function verifyPiReplacement(
	skillName: string,
	facts: PiReplacementFacts,
): PiReplacementVerification {
	const specialized = SPECIALIZED_SKILL_REPLACEMENTS[skillName];
	const surface = specialized ?? derivePiReplacementCommand(skillName);
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
