export const BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME = "sdl:branch-context:from-plan";
export const BRANCH_CONTEXT_UPSTACK_IMPL_FROM_PLAN_COMMAND_NAME =
	"sdl:branch-context:upstack-impl-from-plan";
export const IMPL_BRANCH_CONTEXT_COMMAND_NAME = "sdl:branch-context:impl-attached-plan";

export function formatImplBranchContextCommand(key: string): string {
	return `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${key}`;
}

export const WRITE_PLAN_COMMAND_NAME = "sdl:plan:save";
export const WRITE_GRILLED_PLAN_COMMAND_NAME = "sdl:plan:grill-and-save";
export const IMPL_CURRENT_SAVED_PLAN_COMMAND_NAME = "sdl:plan:impl-current";

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

export const COMMAND_STYLE_LOCAL_SKILLS = [
	"branch-context-from-plan",
	"branch-context-impl",
	"branch-retro",
	"ccc-available-work",
	"ccc-branch-triage",
	"ccc-sidebar",
	"ccc-stack-map",
	"changelog-update",
	"cli-push-down",
	"code-autobranch",
	"code-checkpoint",
	"code-gh",
	"code-gt-linearize-descendants",
	"code-just-fix",
	"code-just-the-stack",
	"code-resolve-merge-conflicts",
	"code-thermostack",
	"code-workflows",
	"context-bundle-analysis",
	"create-bun-typescript-project",
	"create-python-dev-cli",
	"create-python-package",
	"dignified-python",
	"dignified-python-tripwire",
	"duplicative-abstractions-tripwire",
	"enriched-plan-save",
	"fdt-refactor-mock-to-fake",
	"handoff-create",
	"handoff-pickup",
	"improve-codebase-architecture",
	"objective-close",
	"objective-create",
	"objective-next",
	"objective-refresh",
	"objective-review-briefing",
	"objective-stack-impl",
	"objective-update",
	"pi-grill-ui",
	"pi-grill-with-docs-ui",
	"pr-address",
	"pytest",
	"python-fake-driven-test-layout",
	"python-fake-driven-testing",
	"refactor-swarm",
	"roast-dry-but-not-too-dry",
	"roast-improve-codebase-architecture",
	"roast-thermonuclear-review",
	"sdl-cli-design",
	"sdl-flow-submit",
	"sdl-typescript-style-tripwire",
	"setup-dprint",
	"setup-dprint-gh-ci",
	"setup-graphite",
	"setup-pypi-publish",
	"setup-python-gh-ci",
	"skill-audit",
	"skill-audit-improved",
	"skill-creator",
	"skill-management",
	"skillx",
	"thermo-nuclear-code-quality-review",
	"ts-morph-analyze",
	"ts-morph-refactor",
	"typescript-fake-driven-testing",
	"typescript-style",
	"writing-great-skills",
] as const;

export const SPECIALIZED_SKILL_REPLACEMENTS = {
	"branch-context-from-plan": BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	"branch-context-impl": IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	"enriched-plan-save": WRITE_PLAN_COMMAND_NAME,
	"handoff-create": "handoff:create",
	"handoff-pickup": "handoff:pickup",
	"objective-close": "objective:close",
	"objective-create": "objective:create",
	"objective-current": "objective:current",
	"objective-next": "objective:next",
	"objective-stack-impl": "objective:stack-impl",
	"objective-update": "objective:update",
	"pi-grill-ui": "pi:grill-me",
	"pi-grill-with-docs-ui": "pi:grill-with-docs",
	"code-autobranch": "sdl:flow:autobranch",
	"code-checkpoint": "sdl:flow:cp",
	"code-gt-restack-resolve": "code:gt-restack-resolve",
	"code-just-fix": "code:just-fix",
	"code-submit": "sdl:flow:submit",
	"sdl-flow-submit": "sdl:flow:submit",
	"ccc-sidebar": "ccc:sidebar:pr-summary",
	pytest: "python:pytest",
	skillx: "skill:x",
} as const satisfies Record<string, string>;

export const SPECIALIZED_PI_COMMAND_SURFACES = new Set<string>(
	Object.values(SPECIALIZED_SKILL_REPLACEMENTS),
);

export function derivePiReplacementSurface(
	skillName: string,
	namespaces: readonly string[] = KNOWN_PI_COMMAND_NAMESPACES,
): string | undefined {
	for (const [specializedSkillName, surface] of Object.entries(SPECIALIZED_SKILL_REPLACEMENTS).sort(
		(left, right) => right[0].length - left[0].length,
	)) {
		if (skillName === specializedSkillName) return surface;

		const prefix = `${specializedSkillName}-`;
		if (skillName.startsWith(prefix)) return `${surface}-${skillName.slice(prefix.length)}`;
	}

	for (const namespace of [...namespaces].sort((left, right) => right.length - left.length)) {
		const prefix = `${namespace}-`;
		if (skillName.startsWith(prefix)) return `${namespace}:${skillName.slice(prefix.length)}`;
	}

	const firstHyphen = skillName.indexOf("-");
	if (firstHyphen <= 0 || firstHyphen === skillName.length - 1) return undefined;
	return `${skillName.slice(0, firstHyphen)}:${skillName.slice(firstHyphen + 1)}`;
}

export function genericCommandStyleSkillNames(
	skillNames: readonly string[] = COMMAND_STYLE_LOCAL_SKILLS,
): string[] {
	return skillNames.filter((skillName) => {
		if (skillName in SPECIALIZED_SKILL_REPLACEMENTS) return false;
		const surface = derivePiReplacementSurface(skillName);
		return surface !== undefined && !SPECIALIZED_PI_COMMAND_SURFACES.has(surface);
	});
}

export function deriveVisiblePiReplacementSurfaces(
	skillNames: readonly string[] = COMMAND_STYLE_LOCAL_SKILLS,
): string[] {
	const surfaces: string[] = [...SPECIALIZED_PI_COMMAND_SURFACES];
	for (const skillName of genericCommandStyleSkillNames(skillNames)) {
		const surface = derivePiReplacementSurface(skillName);
		if (surface !== undefined) surfaces.push(surface);
	}
	return surfaces;
}
