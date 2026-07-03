export const BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME = "ji:branch-context:from-plan";
export const BRANCH_CONTEXT_UPSTACK_IMPL_FROM_PLAN_COMMAND_NAME =
	"ji:branch-context:upstack-impl-from-plan";
export const IMPL_BRANCH_CONTEXT_COMMAND_NAME = "ji:branch-context:impl-attached-plan";

export function formatImplBranchContextCommand(key: string): string {
	return `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${key}`;
}

export const WRITE_PLAN_COMMAND_NAME = "ji:plan:save";
export const WRITE_GRILLED_PLAN_COMMAND_NAME = "ji:plan:grill-and-save";
export const IMPL_CURRENT_SAVED_PLAN_COMMAND_NAME = "ji:plan:impl-current";

export type CommandBackedSkillRegistrationKind = "generic-backing-skill" | "specialized-command";

export interface CommandBackedSkillRegistration {
	skillName: string;
	surface: string;
	kind: CommandBackedSkillRegistrationKind;
}

export const COMMAND_BACKED_SKILL_REGISTRY = [
	{
		skillName: "branch-context-from-plan",
		surface: BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
		kind: "specialized-command",
	},
	{
		skillName: "branch-context-impl",
		surface: IMPL_BRANCH_CONTEXT_COMMAND_NAME,
		kind: "specialized-command",
	},
	{ skillName: "branch-retro", surface: "branch:retro", kind: "generic-backing-skill" },
	{ skillName: "ccc-available-work", surface: "ccc:available-work", kind: "generic-backing-skill" },
	{ skillName: "ccc-branch-triage", surface: "ccc:branch-triage", kind: "generic-backing-skill" },
	{ skillName: "ccc-sidebar", surface: "ccc:sidebar:pr-summary", kind: "specialized-command" },
	{ skillName: "ccc-stack-map", surface: "ccc:stack-map", kind: "generic-backing-skill" },
	{ skillName: "changelog-update", surface: "changelog:update", kind: "generic-backing-skill" },
	{
		skillName: "code-gt-linearize-descendants",
		surface: "code:gt-linearize-descendants",
		kind: "generic-backing-skill",
	},
	{
		skillName: "code-gt-restack-resolve",
		surface: "code:gt-restack-resolve",
		kind: "specialized-command",
	},
	{ skillName: "code-just-fix", surface: "code:just-fix", kind: "specialized-command" },
	{
		skillName: "code-just-the-stack",
		surface: "code:just-the-stack",
		kind: "generic-backing-skill",
	},
	{
		skillName: "code-resolve-merge-conflicts",
		surface: "code:resolve-merge-conflicts",
		kind: "generic-backing-skill",
	},
	{ skillName: "code-thermostack", surface: "code:thermostack", kind: "generic-backing-skill" },
	{ skillName: "code-workflows", surface: "code:workflows", kind: "generic-backing-skill" },
	{
		skillName: "context-bundle-analysis",
		surface: "context:bundle-analysis",
		kind: "generic-backing-skill",
	},
	{
		skillName: "create-bun-typescript-project",
		surface: "create:bun-typescript-project",
		kind: "generic-backing-skill",
	},
	{
		skillName: "create-python-dev-cli",
		surface: "create:python-dev-cli",
		kind: "generic-backing-skill",
	},
	{
		skillName: "create-python-package",
		surface: "create:python-package",
		kind: "generic-backing-skill",
	},
	{ skillName: "dignified-python", surface: "dignified:python", kind: "generic-backing-skill" },
	{
		skillName: "dignified-python-tripwire",
		surface: "dignified:python-tripwire",
		kind: "generic-backing-skill",
	},
	{
		skillName: "enriched-plan-save",
		surface: WRITE_PLAN_COMMAND_NAME,
		kind: "specialized-command",
	},
	{
		skillName: "fdt-refactor-mock-to-fake",
		surface: "fdt:refactor-mock-to-fake",
		kind: "generic-backing-skill",
	},
	{ skillName: "handoff-create", surface: "sdl:handoff:create", kind: "specialized-command" },
	{ skillName: "handoff-pickup", surface: "sdl:handoff:pickup", kind: "specialized-command" },
	{
		skillName: "improve-codebase-architecture",
		surface: "improve:codebase-architecture",
		kind: "generic-backing-skill",
	},
	{ skillName: "objective-close", surface: "sdl:objective:close", kind: "specialized-command" },
	{ skillName: "objective-create", surface: "sdl:objective:create", kind: "specialized-command" },
	{ skillName: "objective-next", surface: "sdl:objective:next", kind: "specialized-command" },
	{
		skillName: "objective-refresh",
		surface: "sdl:objective:refresh",
		kind: "generic-backing-skill",
	},
	{
		skillName: "objective-review-briefing",
		surface: "sdl:objective:review-briefing",
		kind: "generic-backing-skill",
	},
	{
		skillName: "objective-stack-impl",
		surface: "sdl:objective:stack-impl",
		kind: "specialized-command",
	},
	{ skillName: "objective-update", surface: "sdl:objective:update", kind: "specialized-command" },
	{ skillName: "pi-grill-ui", surface: "pi:grill-me", kind: "specialized-command" },
	{
		skillName: "pi-grill-with-docs-ui",
		surface: "pi:grill-with-docs",
		kind: "specialized-command",
	},
	{ skillName: "pytest", surface: "python:pytest", kind: "generic-backing-skill" },
	{
		skillName: "python-fake-driven-test-layout",
		surface: "python:fake-driven-test-layout",
		kind: "generic-backing-skill",
	},
	{
		skillName: "python-fake-driven-testing",
		surface: "python:fake-driven-testing",
		kind: "generic-backing-skill",
	},
	{ skillName: "refactor-swarm", surface: "refactor:swarm", kind: "generic-backing-skill" },
	{
		skillName: "reinvented-abstractions-tripwire",
		surface: "reinvented:abstractions-tripwire",
		kind: "generic-backing-skill",
	},
	{
		skillName: "roast-dry-but-not-too-dry",
		surface: "roast:dry-but-not-too-dry",
		kind: "generic-backing-skill",
	},
	{
		skillName: "roast-improve-codebase-architecture",
		surface: "roast:improve-codebase-architecture",
		kind: "generic-backing-skill",
	},
	{
		skillName: "roast-thermonuclear-review",
		surface: "roast:thermonuclear-review",
		kind: "generic-backing-skill",
	},
	{ skillName: "sdl-cli-design", surface: "sdl:cli:design", kind: "generic-backing-skill" },
	{ skillName: "sdl-flow-autobranch", surface: "ji:flow:autobranch", kind: "specialized-command" },
	{
		skillName: "sdl-flow-branch-latest-commit",
		surface: "ji:flow:branch-latest-commit",
		kind: "specialized-command",
	},
	{ skillName: "sdl-flow-cp", surface: "ji:flow:cp", kind: "specialized-command" },
	{ skillName: "sdl-flow-submit", surface: "ji:flow:submit", kind: "specialized-command" },
	{
		skillName: "sdl-typescript-style-tripwire",
		surface: "sdl:typescript:style-tripwire",
		kind: "generic-backing-skill",
	},
	{ skillName: "setup-dprint", surface: "setup:dprint", kind: "generic-backing-skill" },
	{ skillName: "setup-dprint-gh-ci", surface: "setup:dprint-gh-ci", kind: "generic-backing-skill" },
	{ skillName: "setup-graphite", surface: "setup:graphite", kind: "generic-backing-skill" },
	{ skillName: "setup-pypi-publish", surface: "setup:pypi-publish", kind: "generic-backing-skill" },
	{ skillName: "setup-python-gh-ci", surface: "setup:python-gh-ci", kind: "generic-backing-skill" },
	{ skillName: "skill-audit", surface: "skill:audit", kind: "generic-backing-skill" },
	{
		skillName: "skill-audit-improved",
		surface: "skill:audit-improved",
		kind: "generic-backing-skill",
	},
	{ skillName: "skill-creator", surface: "skill:creator", kind: "generic-backing-skill" },
	{ skillName: "skill-management", surface: "skill:management", kind: "generic-backing-skill" },
	{ skillName: "skillx", surface: "skill:x", kind: "generic-backing-skill" },
	{
		skillName: "thermo-nuclear-code-quality-review",
		surface: "thermo:nuclear-code-quality-review",
		kind: "generic-backing-skill",
	},
	{ skillName: "ts-morph-analyze", surface: "ts:morph-analyze", kind: "generic-backing-skill" },
	{
		skillName: "writing-great-skills",
		surface: "writing:great-skills",
		kind: "generic-backing-skill",
	},
] as const satisfies readonly CommandBackedSkillRegistration[];

export function commandBackedSkillRegistrations(): readonly CommandBackedSkillRegistration[] {
	return COMMAND_BACKED_SKILL_REGISTRY;
}

export function commandBackedSkillSurface(skillName: string): string | undefined {
	return COMMAND_BACKED_SKILL_REGISTRY.find((registration) => registration.skillName === skillName)
		?.surface;
}

export function genericBackingSkillRegistrations(): readonly CommandBackedSkillRegistration[] {
	return COMMAND_BACKED_SKILL_REGISTRY.filter(
		(registration) => registration.kind === "generic-backing-skill",
	);
}

export function specializedCommandBackedSkillRegistrations(): readonly CommandBackedSkillRegistration[] {
	return COMMAND_BACKED_SKILL_REGISTRY.filter(
		(registration) => registration.kind === "specialized-command",
	);
}

export function visibleCommandBackedReplacementSurfaces(): string[] {
	return COMMAND_BACKED_SKILL_REGISTRY.map((registration) => registration.surface);
}
