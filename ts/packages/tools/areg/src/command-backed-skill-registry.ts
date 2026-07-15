import { flowCommandBackedSkillRegistrations } from "@nseng-ai/flow/pi";
import { handoffCommandBackedSkillRegistrations } from "@nseng-ai/handoffs/pi";
import { objectiveCommandBackedSkillRegistrations } from "@nseng-ai/objectives/pi";
import {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
} from "@nseng-ai/branch-context/pi";
import type {
	CommandBackedSkillRegistration,
	CommandBackedSkillRegistrationKind,
} from "@nseng-ai/foundation/command";

export type {
	CommandBackedSkillRegistration,
	CommandBackedSkillRegistrationKind,
} from "@nseng-ai/foundation/command";

/**
 * Single source of truth for repo-local skills that Pi surfaces as slash
 * commands instead of ordinary `/skill:<name>` invocations.
 *
 * Keep each mapping explicit: several surfaces intentionally do not follow a
 * mechanical split of the skill name, and provider-owned command packages
 * contribute their own specialized rows through this registry.
 */
const COMMAND_BACKED_SKILL_REGISTRY = [
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
		skillName: "enriched-plan-save",
		surface: WRITE_PLAN_COMMAND_NAME,
		kind: "specialized-command",
	},
	{
		skillName: "fdt-refactor-mock-to-fake",
		surface: "fdt:refactor-mock-to-fake",
		kind: "generic-backing-skill",
	},
	...handoffCommandBackedSkillRegistrations,
	{
		skillName: "improve-codebase-architecture",
		surface: "improve:codebase-architecture",
		kind: "generic-backing-skill",
	},
	...objectiveCommandBackedSkillRegistrations,
	{
		skillName: "objective-refresh",
		surface: "ns:objective:refresh",
		kind: "generic-backing-skill",
	},
	{
		skillName: "objective-retro",
		surface: "ns:objective:retro",
		kind: "generic-backing-skill",
	},
	{ skillName: "pi-grill-ui", surface: "pi:grill-me", kind: "specialized-command" },
	{
		skillName: "pi-grill-with-docs-ui",
		surface: "pi:grill-with-docs",
		kind: "specialized-command",
	},
	{ skillName: "refactor-swarm", surface: "refactor:swarm", kind: "generic-backing-skill" },
	{
		skillName: "reinvented-abstractions-tripwire",
		surface: "reinvented:abstractions-tripwire",
		kind: "generic-backing-skill",
	},
	{
		skillName: "review-dry-but-not-too-dry",
		surface: "review:dry-but-not-too-dry",
		kind: "generic-backing-skill",
	},
	{
		skillName: "review-improve-codebase-architecture",
		surface: "review:improve-codebase-architecture",
		kind: "generic-backing-skill",
	},
	{
		skillName: "review-thermonuclear-review",
		surface: "review:thermonuclear-review",
		kind: "generic-backing-skill",
	},
	{ skillName: "ns-cli-design", surface: "ns:cli:design", kind: "generic-backing-skill" },
	...flowCommandBackedSkillRegistrations,
	{
		skillName: "ns-typescript-style-tripwire",
		surface: "ns:typescript:style-tripwire",
		kind: "generic-backing-skill",
	},
	{ skillName: "skill-audit", surface: "skill:audit", kind: "generic-backing-skill" },
	{ skillName: "skill-management", surface: "skill:management", kind: "generic-backing-skill" },
	{
		skillName: "thermo-nuclear-code-quality-review",
		surface: "thermo:nuclear-code-quality-review",
		kind: "generic-backing-skill",
	},
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

function registrationsOfKind(
	kind: CommandBackedSkillRegistrationKind,
): readonly CommandBackedSkillRegistration[] {
	return COMMAND_BACKED_SKILL_REGISTRY.filter((registration) => registration.kind === kind);
}

export function genericBackingSkillRegistrations(): readonly CommandBackedSkillRegistration[] {
	return registrationsOfKind("generic-backing-skill");
}

export function specializedCommandBackedSkillRegistrations(): readonly CommandBackedSkillRegistration[] {
	return registrationsOfKind("specialized-command");
}

export function visibleCommandBackedReplacementSurfaces(): string[] {
	return COMMAND_BACKED_SKILL_REGISTRY.map((registration) => registration.surface);
}
