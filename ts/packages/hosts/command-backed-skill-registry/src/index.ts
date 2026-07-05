import { cccCommandBackedSkillRegistrations } from "@ns/ccc/pi";
import { flowCommandBackedSkillRegistrations } from "@ns/flow/pi";
import { handoffCommandBackedSkillRegistrations } from "@ns/handoff/pi";
import { objectiveCommandBackedSkillRegistrations } from "@ns/objective/pi";
import {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
} from "@ns/branch-context/pi";
import type {
	CommandBackedSkillRegistration,
	CommandBackedSkillRegistrationKind,
} from "@ns/core/command";

export type {
	CommandBackedSkillRegistration,
	CommandBackedSkillRegistrationKind,
} from "@ns/core/command";

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
	// These ns:ccc:* rows are generic backing-skill aliases, not CCC provider-owned
	// Pi commands; real CCC command registrations come from @ns/ccc/pi below.
	{
		skillName: "ccc-available-work",
		surface: "ns:ccc:available-work",
		kind: "generic-backing-skill",
	},
	{
		skillName: "ccc-branch-triage",
		surface: "ns:ccc:branch-triage",
		kind: "generic-backing-skill",
	},
	...cccCommandBackedSkillRegistrations,
	{ skillName: "ccc-stack-map", surface: "ns:ccc:stack-map", kind: "generic-backing-skill" },
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
		skillName: "objective-review-briefing",
		surface: "ns:objective:review-briefing",
		kind: "generic-backing-skill",
	},
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
	{ skillName: "ns-cli-design", surface: "ns:cli:design", kind: "generic-backing-skill" },
	...flowCommandBackedSkillRegistrations,
	{
		skillName: "ns-typescript-style-tripwire",
		surface: "ns:typescript:style-tripwire",
		kind: "generic-backing-skill",
	},
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
	{ skillName: "ts-morph-refactor", surface: "ts:morph-refactor", kind: "generic-backing-skill" },
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
