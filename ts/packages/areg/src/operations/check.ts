import { failure, negative, ok, shellNegative, type ClinkrExit } from "@asdl/clinkr";
import type { Result } from "@asdl/core/result";
import { z } from "zod";

import type { AregCliContext } from "../context.ts";
import type { AregCheckSkillInspection } from "../gateways.ts";
import { sortStrings } from "../sort.ts";
import { isPathStateError } from "./file-state.ts";
import { parseSkillFrontmatterBlock } from "./frontmatter.ts";
import { parseInspectedLockfile, parseLockfileData, type LockfileSkill, type SkillsLockfile } from "./lockfile.ts";
import { derivePiReplacementCommand, verifyPiReplacement } from "./pi-replacement.ts";
import { parsePiSettings } from "./pi-settings.ts";
import { inferSkillKindRecord, inspectSkillFrontmatter } from "./skill-kind.ts";
import { inspectCheckProject, type AregCheckProjectInspection } from "./project-inspection.ts";

const CHECK_ISSUE_CODES = [
	"invalid_lock_hash",
	"missing_skills_dir",
	"skills_dir_is_symlink",
	"invalid_local_lock_source",
	"agents_not_symlink",
	"agents_wrong_target",
	"agents_missing",
	"claude_not_symlink",
	"claude_wrong_target",
	"claude_missing",
	"invalid_skill_md",
	"invoke_only_missing_openai_policy",
	"openai_policy_without_invoke_only",
	"command_converted_missing_pi_exclusion",
	"command_converted_missing_pi_replacement",
	"agents_not_real_dir",
	"unexpected_skills_dir",
	"orphan_in_skills",
	"orphan_in_agents",
	"dangling_lockfile",
	"claude_md_missing_peer",
	"agents_md_missing_peer",
	"claude_md_missing_agents_ref",
	"pi_settings_unusable",
] as const;

const MAX_SKILL_DESCRIPTION_CHARS = 1024;
const PLACEHOLDER_HASH = "PENDING_REGEN";
const SHA256_HEX_RE = /^[0-9a-f]{64}$/u;
type CheckIssueCode = (typeof CHECK_ISSUE_CODES)[number];

interface CheckIssue {
	skill: string;
	code: CheckIssueCode;
	message: string;
}

export { parseLockfileData };

const checkIssueSchema = z.object({
	skill: z.string(),
	code: z.enum(CHECK_ISSUE_CODES),
	message: z.string(),
});

const checkReportSchema = z.object({
	ok: z.boolean(),
	project_dir: z.string(),
	issue_count: z.number().int().nonnegative(),
	issues: z.array(checkIssueSchema),
});

export const checkRequestSchema = z.object({
	path: z.string().default(".").describe("Project directory to check (default: current directory)."),
});

export const checkResultSchema = checkReportSchema;

export type CheckRequest = z.infer<typeof checkRequestSchema>;
export type CheckReport = z.infer<typeof checkReportSchema>;

type CheckProjectInspection = AregCheckProjectInspection;

export async function runCheck(ctx: AregCliContext, request: CheckRequest): Promise<ClinkrExit<CheckReport>> {
	const inspection = await inspectCheckProject(ctx, request.path);
	if (inspection.projectPathState.type !== "directory") {
		return failure("invalid_project", `${inspection.projectDir} is not a directory`);
	}
	const lockfileResult = parseInspectedLockfile(inspection);
	if (!lockfileResult.ok) {
		return failure("lockfile_invalid", lockfileResult.error.message);
	}
	const hasLocalSkills = lockfileResult.value.skills.some((skill) => skill.sourceType === "local");
	const piSettings = hasLocalSkills ? parsePiSettings(inspection.piDir, inspection.piSettings) : { ok: true as const, value: { exclusions: [] } };
	if (!piSettings.ok) {
		if (!isPathStateError(piSettings.error)) return failure("pi_settings_invalid", piSettings.error.message);
		const report = piSettingsPathFailureReport(inspection.projectDir, piSettings.error.message);
		return shellNegative(formatCheckReport(report), report);
	}
	const report = buildCheckReport(inspection, lockfileResult.value, piSettings.value.exclusions);
	if (report.ok) return ok(report);
	return negative(formatCheckReport(report), report);
}

export function renderCheck(report: CheckReport): string {
	if (report.ok) return "All skills OK.";
	return formatCheckReport(report);
}

export function buildCheckReport(inspection: CheckProjectInspection, lockfile: SkillsLockfile, piExclusions: readonly string[] = []): CheckReport {
	const issues: CheckIssue[] = [];
	const byName = new Map(inspection.skills.map((skill) => [skill.name, skill]));
	for (const entry of lockfile.skills) {
		const inspected = byName.get(entry.name) ?? missingSkillInspection(entry.name);
		if (entry.sourceType === "local") issues.push(...checkLocalSkill(entry, inspected));
		if (entry.sourceType !== "local") issues.push(...checkRemoteSkill(entry, inspected));
		issues.push(...checkSkillMd(entry, inspected));
		if (entry.sourceType === "local") issues.push(...checkSkillInvocationKind({ entry, inspected, inspection, piExclusions }));
	}
	issues.push(...checkLockfileHashes(lockfile));
	issues.push(...checkOrphansAndDangling(lockfile, inspection));
	issues.push(...checkPairing(inspection));
	return {
		ok: issues.length === 0,
		project_dir: inspection.projectDir,
		issue_count: issues.length,
		issues,
	};
}

export function parseSkillFrontmatterText(text: string): Result<Readonly<Record<string, string>>> {
	const parsed = parseSkillFrontmatterBlock(text);
	if (!parsed.ok) return parsed;
	return { ok: true, value: parsed.value.fields };
}

export { derivePiReplacementCommand };

export function formatCheckReport(report: Pick<CheckReport, "issues">): string {
	const grouped = new Map<string, CheckIssue[]>();
	for (const issue of report.issues) {
		const existing = grouped.get(issue.skill) ?? [];
		existing.push(issue);
		grouped.set(issue.skill, existing);
	}
	const lines: string[] = [];
	for (const skill of sortStrings([...grouped.keys()])) {
		lines.push("", `${skill}:`);
		for (const issue of grouped.get(skill) ?? []) lines.push(`  ${issue.message}`);
	}
	lines.push("", `${report.issues.length} error(s)`);
	return lines.join("\n");
}

function checkLocalSkill(entry: LockfileSkill, inspected: AregCheckSkillInspection): CheckIssue[] {
	const issues: CheckIssue[] = [];
	const expectedSource = `skills/${entry.name}`;
	if (entry.source !== expectedSource) {
		issues.push(issue(entry.name, "invalid_local_lock_source", `Local skill lockfile source must be '${expectedSource}', found '${entry.source}'`));
	}
	if (inspected.skillsPath.type === "missing") {
		issues.push(issue(entry.name, "missing_skills_dir", `Local skill missing canonical source: skills/${entry.name}/ does not exist`));
	} else if (inspected.skillsPath.type === "symlink") {
		issues.push(issue(entry.name, "skills_dir_is_symlink", `skills/${entry.name} is a symlink but should be a real directory (canonical source)`));
	}
	const expectedAgentsTarget = `../../skills/${entry.name}`;
	if (inspected.agentsPath.type === "missing") {
		issues.push(issue(entry.name, "agents_missing", `.agents/skills/${entry.name} does not exist`));
	} else if (inspected.agentsPath.type !== "symlink") {
		issues.push(issue(entry.name, "agents_not_symlink", `.agents/skills/${entry.name} is a real directory, expected symlink to ${expectedAgentsTarget}`));
	} else if (inspected.agentsPath.target !== expectedAgentsTarget) {
		issues.push(issue(entry.name, "agents_wrong_target", `.agents/skills/${entry.name} symlink points to ${inspected.agentsPath.target}, expected ${expectedAgentsTarget}`));
	}
	issues.push(...checkClaudeSymlink(entry.name, inspected));
	return issues;
}

function checkRemoteSkill(entry: LockfileSkill, inspected: AregCheckSkillInspection): CheckIssue[] {
	const issues: CheckIssue[] = [];
	if (inspected.agentsPath.type === "missing") {
		issues.push(issue(entry.name, "agents_not_real_dir", `.agents/skills/${entry.name}/ does not exist`));
	} else if (inspected.agentsPath.type === "symlink") {
		issues.push(issue(entry.name, "agents_not_real_dir", `.agents/skills/${entry.name} is a symlink but should be a real directory (vendored)`));
	}
	issues.push(...checkClaudeSymlink(entry.name, inspected));
	if (inspected.skillsPath.type !== "missing") issues.push(issue(entry.name, "unexpected_skills_dir", `GitHub-sourced skill should not have skills/${entry.name}/ entry`));
	return issues;
}

function checkClaudeSymlink(name: string, inspected: AregCheckSkillInspection): CheckIssue[] {
	const expectedTarget = `../../.agents/skills/${name}`;
	if (inspected.claudePath.type === "missing") return [issue(name, "claude_missing", `.claude/skills/${name} does not exist`)];
	if (inspected.claudePath.type !== "symlink") return [issue(name, "claude_not_symlink", `.claude/skills/${name} is a real directory, expected symlink to ${expectedTarget}`)];
	if (inspected.claudePath.target !== expectedTarget) return [issue(name, "claude_wrong_target", `.claude/skills/${name} symlink points to ${inspected.claudePath.target}, expected ${expectedTarget}`)];
	return [];
}

function checkSkillMd(entry: LockfileSkill, inspected: AregCheckSkillInspection): CheckIssue[] {
	const relativePath = entry.sourceType === "local" ? `skills/${entry.name}/SKILL.md` : `.agents/skills/${entry.name}/SKILL.md`;
	const skillMd = entry.sourceType === "local" ? inspected.localSkillMd : inspected.remoteSkillMd;
	if (skillMd.type !== "file") return [issue(entry.name, "invalid_skill_md", `${relativePath} does not exist`)];
	const frontmatter = parseSkillFrontmatterText(skillMd.text);
	if (!frontmatter.ok) return [issue(entry.name, "invalid_skill_md", `${relativePath} invalid frontmatter: ${frontmatter.error.message}`)];
	const description = frontmatter.value.description;
	if (description !== undefined && description.length > MAX_SKILL_DESCRIPTION_CHARS) {
		return [issue(entry.name, "invalid_skill_md", `${relativePath} invalid description: exceeds maximum length of 1024 characters (got ${description.length})`)];
	}
	return [];
}

interface CheckSkillInvocationKindOptions {
	entry: LockfileSkill;
	inspected: AregCheckSkillInspection;
	inspection: CheckProjectInspection;
	piExclusions: readonly string[];
}

function checkSkillInvocationKind(options: CheckSkillInvocationKindOptions): CheckIssue[] {
	const { entry, inspected, inspection, piExclusions } = options;
	if (inspected.localSkillMd.type !== "file") return [];
	const frontmatter = inspectSkillFrontmatter(inspected.localSkillMd.text, `skills/${entry.name}/SKILL.md`);
	if (!frontmatter.ok) return [];
	const isPiExcluded = piExclusions.includes(`-skills/${entry.name}`);
	const replacement = verifyPiReplacement(entry.name, inspection.replacement);
	const record = inferSkillKindRecord({
		skillName: entry.name,
		frontmatter: frontmatter.value,
		hasCodexSidecar: inspected.openaiPolicy.type === "file",
		isPiExcluded,
		replacement,
	});
	const issues: CheckIssue[] = [];
	if (record.artifacts.isModelInvocationDisabled && !record.artifacts.hasCodexSidecar) issues.push(issue(entry.name, "invoke_only_missing_openai_policy", `skills/${entry.name}/agents/openai.yaml missing for invoke-only skill`));
	if (!record.artifacts.isModelInvocationDisabled && record.artifacts.hasCodexSidecar) issues.push(issue(entry.name, "openai_policy_without_invoke_only", `skills/${entry.name}/agents/openai.yaml exists but SKILL.md does not set disable-model-invocation: true`));
	if (record.artifacts.isModelInvocationDisabled && record.artifacts.hasCodexSidecar && record.replacement.verified && !record.artifacts.isPiExcluded) {
		issues.push(issue(entry.name, "command_converted_missing_pi_exclusion", `.pi/settings.json missing -skills/${entry.name} for command-backed skill`));
	}
	if (record.artifacts.isPiExcluded && !record.replacement.verified) {
		const expected = record.replacement.surface === undefined ? "a derived command" : `/${record.replacement.surface}`;
		issues.push(issue(entry.name, "command_converted_missing_pi_replacement", `Pi skill is excluded but no verified replacement command exists; expected ${expected}`));
	}
	return issues;
}

function checkLockfileHashes(lockfile: SkillsLockfile): CheckIssue[] {
	const issues: CheckIssue[] = [];
	for (const entry of lockfile.skills) {
		if (entry.computedHash === PLACEHOLDER_HASH) {
			issues.push(issue(entry.name, "invalid_lock_hash", `skills-lock.json entry for ${entry.name} has placeholder computedHash ${PLACEHOLDER_HASH}; regenerate or normalize the lockfile before relying on areg check.`));
		} else if (!SHA256_HEX_RE.test(entry.computedHash)) {
			issues.push(issue(entry.name, "invalid_lock_hash", `skills-lock.json entry for ${entry.name} has invalid computedHash '${entry.computedHash}'; expected 64 lowercase hex characters.`));
		}
	}
	return issues;
}

function checkOrphansAndDangling(lockfile: SkillsLockfile, inspection: CheckProjectInspection): CheckIssue[] {
	const lockNames = new Set(lockfile.skills.map((skill) => skill.name));
	const excluded = new Set(inspection.excludedSkillNames);
	const byName = new Map(inspection.skills.map((skill) => [skill.name, skill]));
	const issues: CheckIssue[] = [];
	for (const name of sortStrings(inspection.skillsDirectoryNames)) {
		if (!lockNames.has(name) && !excluded.has(name)) issues.push(issue(name, "orphan_in_skills", `Orphaned directory skills/${name}/ has no entry in skills-lock.json`));
	}
	for (const name of sortStrings(inspection.agentsSkillNames)) {
		if (!lockNames.has(name) && !excluded.has(name)) issues.push(issue(name, "orphan_in_agents", `Orphaned directory .agents/skills/${name}/ has no entry in skills-lock.json`));
	}
	for (const name of sortStrings([...lockNames])) {
		const inspected = byName.get(name) ?? missingSkillInspection(name);
		if (inspected.skillsPath.type === "missing" && inspected.agentsPath.type === "missing" && inspected.claudePath.type === "missing") {
			issues.push(issue(name, "dangling_lockfile", `Dangling lockfile entry: no directories found on disk for ${name}`));
		}
	}
	return issues;
}

function checkPairing(inspection: CheckProjectInspection): CheckIssue[] {
	const issues: CheckIssue[] = [];
	for (const directory of inspection.pairingDirectories) {
		const agentsRel = directory.relativeDir.length === 0 ? "AGENTS.md" : `${directory.relativeDir}/AGENTS.md`;
		const claudeRel = directory.relativeDir.length === 0 ? "CLAUDE.md" : `${directory.relativeDir}/CLAUDE.md`;
		if (directory.hasAgents && !directory.hasClaude) {
			issues.push(issue(agentsRel, "claude_md_missing_peer", `AGENTS.md at ${agentsRel} has no peer CLAUDE.md in the same directory`));
		} else if (directory.hasClaude && !directory.hasAgents) {
			issues.push(issue(claudeRel, "agents_md_missing_peer", `CLAUDE.md at ${claudeRel} has no peer AGENTS.md in the same directory`));
		} else if (directory.hasAgents && directory.hasClaude && !directory.claudeText?.includes("@AGENTS.md")) {
			issues.push(issue(claudeRel, "claude_md_missing_agents_ref", `CLAUDE.md at ${claudeRel} does not include peer AGENTS.md via @AGENTS.md syntax`));
		}
	}
	return issues;
}

function piSettingsPathFailureReport(projectDir: string, message: string): CheckReport {
	const issues = [issue(".pi/settings.json", "pi_settings_unusable", message)];
	return { ok: false, project_dir: projectDir, issue_count: issues.length, issues };
}

function issue(skill: string, code: CheckIssueCode, message: string): CheckIssue {
	return { skill, code, message };
}

function missingSkillInspection(name: string): AregCheckSkillInspection {
	const missing = { type: "missing" as const };
	return { name, skillsPath: missing, agentsPath: missing, claudePath: missing, localSkillMd: missing, remoteSkillMd: missing, openaiPolicy: missing };
}
