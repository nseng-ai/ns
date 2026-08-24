import {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
} from "@nseng-ai/branch-context/api";
import { flowSkillBackedCommandRegistrations } from "@nseng-ai/flow/api";
import { handoffSkillBackedCommandRegistrations } from "@nseng-ai/handoffs/api";
import { objectiveSkillBackedCommandRegistrations } from "@nseng-ai/objectives/api";
import type {
	SkillBackedCommandRegistration,
	SkillBackedCommandRegistrationKind,
} from "@nseng-ai/foundation/command";

export type {
	SkillBackedCommandRegistration,
	SkillBackedCommandRegistrationKind,
} from "@nseng-ai/foundation/command";

/**
 * Single source of truth for repo-local skills that Pi surfaces as slash
 * commands instead of ordinary `/skill:<name>` invocations.
 *
 * Keep each mapping explicit: several surfaces intentionally do not follow a
 * mechanical split of the skill name, and provider-owned command packages
 * contribute their own specialized rows through this registry.
 */
const SKILL_BACKED_COMMAND_REGISTRY = [
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
		surface: "gt:stack:just",
		kind: "generic-backing-skill",
	},
	{
		skillName: "code-resolve-merge-conflicts",
		surface: "code:resolve-merge-conflicts",
		kind: "generic-backing-skill",
	},
	{
		skillName: "code-thermostack",
		surface: "gt:stack:thermostack",
		kind: "generic-backing-skill",
	},
	{ skillName: "code-workflows", surface: "code:workflows", kind: "generic-backing-skill" },
	{
		skillName: "context-bundle-analysis",
		surface: "context:bundle-analysis",
		kind: "generic-backing-skill",
	},
	{
		skillName: "fdt-refactor-mock-to-fake",
		surface: "fdt:refactor-mock-to-fake",
		kind: "generic-backing-skill",
	},
	...handoffSkillBackedCommandRegistrations,
	{
		skillName: "improve-codebase-architecture",
		surface: "improve:codebase-architecture",
		kind: "generic-backing-skill",
	},
	...objectiveSkillBackedCommandRegistrations,
	{
		skillName: "objective-refresh",
		surface: "ns:objective:refresh",
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
	...flowSkillBackedCommandRegistrations,
	{
		skillName: "ns-flow-gs-autoslot",
		surface: "ns:flow:gs:autoslot",
		kind: "generic-backing-skill",
	},
	{
		skillName: "ns-typescript-style-tripwire",
		surface: "ns:typescript:style-tripwire",
		kind: "generic-backing-skill",
	},
	{ skillName: "skill-management", surface: "skill:management", kind: "generic-backing-skill" },
	{
		skillName: "thermo-nuclear-code-quality-review",
		surface: "thermo:nuclear-code-quality-review",
		kind: "generic-backing-skill",
	},
	{
		skillName: "writing-for-agents",
		surface: "writing:for-agents",
		kind: "generic-backing-skill",
	},
] as const satisfies readonly SkillBackedCommandRegistration[];

export function skillBackedCommandRegistrations(): readonly SkillBackedCommandRegistration[] {
	return SKILL_BACKED_COMMAND_REGISTRY;
}

export function skillBackedCommandSurface(skillName: string): string | undefined {
	return SKILL_BACKED_COMMAND_REGISTRY.find((registration) => registration.skillName === skillName)
		?.surface;
}

function registrationsOfKind(
	kind: SkillBackedCommandRegistrationKind,
): readonly SkillBackedCommandRegistration[] {
	return SKILL_BACKED_COMMAND_REGISTRY.filter((registration) => registration.kind === kind);
}

export function genericBackingSkillRegistrations(): readonly SkillBackedCommandRegistration[] {
	return registrationsOfKind("generic-backing-skill");
}

export function specializedSkillBackedCommandRegistrations(): readonly SkillBackedCommandRegistration[] {
	return registrationsOfKind("specialized-command");
}

export function visibleSkillBackedCommandSurfaces(): string[] {
	return SKILL_BACKED_COMMAND_REGISTRY.map((registration) => registration.surface);
}
