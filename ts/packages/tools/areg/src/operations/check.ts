import { failure, ok, negative, type ClinkrExit } from "@ji/clinkr";
import type { Result } from "@ji/core/result";
import { z } from "zod";

import type { AregCliContext } from "../context.ts";
import { missingCheckSkillInspection } from "../gateways.ts";
import type { AregCheckSkillInspection } from "../gateways.ts";
import { sortStrings } from "../sort.ts";
import { isPathStateError } from "./file-state.ts";
import { parseSkillFrontmatterBlock } from "./frontmatter.ts";
import {
	parseInspectedLockfile,
	parseLockfileData,
	type LockfileSkill,
	type SkillsLockfile,
} from "./lockfile.ts";
import { derivePiReplacementCommand, verifyPiReplacement } from "./pi-replacement.ts";
import { parsePiSettings } from "./pi-settings.ts";
import {
	expectedAgentsSkillSymlinkTarget,
	expectedClaudeSkillSymlinkTarget,
	isAgentsSkillMirror,
	isClaudeSkillMirror,
} from "./skill-mirror-conventions.ts";
import {
	inferSkillKindRecord,
	inspectSkillFrontmatter,
	isManagedOpenaiPolicyContent,
} from "./skill-kind-inference.ts";
import { inspectCheckProject, type AregCheckProjectInspection } from "./project-inspection.ts";

const CHECK_ISSUE_CODES = [
	"invalid-lock-hash",
	"missing-skills-dir",
	"skills-dir-is-symlink",
	"invalid-local-lock-source",
	"agents-not-symlink",
	"agents-wrong-target",
	"agents-missing",
	"claude-not-symlink",
	"claude-wrong-target",
	"claude-missing",
	"invalid-skill-md",
	"invoke-only-missing-openai-policy",
	"openai-policy-without-invoke-only",
	"non-managed-openai-policy",
	"command-converted-missing-pi-exclusion",
	"command-converted-missing-pi-replacement",
	"agents-not-real-dir",
	"unexpected-skills-dir",
	"orphan-in-skills",
	"orphan-in-agents",
	"dangling-lockfile",
	"claude-md-missing-peer",
	"agents-md-missing-peer",
	"claude-md-missing-agents-ref",
	"pi-settings-unusable",
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
	projectDir: z.string(),
	issueCount: z.number().int().nonnegative(),
	issues: z.array(checkIssueSchema),
});

export const checkRequestSchema = z.object({
	path: z
		.string()
		.default(".")
		.describe("Project directory to check (default: current directory)."),
});

export const checkResultSchema = checkReportSchema;

export type CheckRequest = z.infer<typeof checkRequestSchema>;
export type CheckReport = z.infer<typeof checkReportSchema>;

type CheckProjectInspection = AregCheckProjectInspection;

export async function runCheck(
	ctx: AregCliContext,
	request: CheckRequest,
): Promise<ClinkrExit<CheckReport>> {
	const inspection = await inspectCheckProject(ctx, request.path);
	if (inspection.projectPathState.type !== "directory") {
		return failure("invalid-project", `${inspection.projectDir} is not a directory`);
	}
	const lockfileResult = parseInspectedLockfile(inspection);
	if (!lockfileResult.ok) {
		return failure("lockfile-invalid", lockfileResult.error.message);
	}
	const hasManagedSkills = lockfileResult.value.skills.length > 0;
	const piSettings = hasManagedSkills
		? parsePiSettings(inspection.piDir, inspection.piSettings)
		: { ok: true as const, value: { exclusions: [] } };
	if (!piSettings.ok) {
		if (!isPathStateError(piSettings.error))
			return failure("pi-settings-invalid", piSettings.error.message);
		const report = piSettingsPathFailureReport(inspection.projectDir, piSettings.error.message);
		return negative(formatCheckReport(report), { data: report });
	}
	const report = buildCheckReport(inspection, lockfileResult.value, piSettings.value.exclusions);
	if (report.ok) return ok(report);
	return negative(formatCheckReport(report), { data: report });
}

export function renderCheck(report: CheckReport): string {
	if (report.ok) return "All skills OK.";
	return formatCheckReport(report);
}

export function buildCheckReport(
	inspection: CheckProjectInspection,
	lockfile: SkillsLockfile,
	piExclusions: readonly string[] = [],
): CheckReport {
	const issues: CheckIssue[] = [];
	const byName = new Map(inspection.skills.map((skill) => [skill.name, skill]));
	for (const entry of lockfile.skills) {
		const inspected = byName.get(entry.name) ?? missingCheckSkillInspection(entry.name);
		if (entry.sourceType === "local") issues.push(...checkLocalSkill(entry, inspected));
		if (entry.sourceType !== "local") issues.push(...checkRemoteSkill(entry, inspected));
		issues.push(...checkSkillMd(entry, inspected));
		issues.push(...checkSkillInvocationKind({ entry, inspected, inspection, piExclusions }));
	}
	issues.push(...checkLockfileHashes(lockfile));
	issues.push(...checkOrphansAndDangling(lockfile, inspection));
	issues.push(...checkPairing(inspection));
	return {
		ok: issues.length === 0,
		projectDir: inspection.projectDir,
		issueCount: issues.length,
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
		issues.push(
			issue(
				entry.name,
				"invalid-local-lock-source",
				`Local skill lockfile source must be '${expectedSource}', found '${entry.source}'`,
			),
		);
	}
	if (inspected.skillsPath.type === "missing") {
		issues.push(
			issue(
				entry.name,
				"missing-skills-dir",
				`Local skill missing canonical source: skills/${entry.name}/ does not exist`,
			),
		);
	} else if (inspected.skillsPath.type === "symlink") {
		issues.push(
			issue(
				entry.name,
				"skills-dir-is-symlink",
				`skills/${entry.name} is a symlink but should be a real directory (canonical source)`,
			),
		);
	}
	const expectedAgentsTarget = expectedAgentsSkillSymlinkTarget(entry.name);
	if (inspected.agentsPath.type === "missing") {
		issues.push(issue(entry.name, "agents-missing", `.agents/skills/${entry.name} does not exist`));
	} else if (inspected.agentsPath.type !== "symlink") {
		issues.push(
			issue(
				entry.name,
				"agents-not-symlink",
				`.agents/skills/${entry.name} is a real directory, expected symlink to ${expectedAgentsTarget}`,
			),
		);
	} else if (!isAgentsSkillMirror(inspected.agentsPath, entry.name)) {
		issues.push(
			issue(
				entry.name,
				"agents-wrong-target",
				`.agents/skills/${entry.name} symlink points to ${inspected.agentsPath.target}, expected ${expectedAgentsTarget}`,
			),
		);
	}
	issues.push(...checkClaudeSymlink(entry.name, inspected));
	return issues;
}

function checkRemoteSkill(entry: LockfileSkill, inspected: AregCheckSkillInspection): CheckIssue[] {
	const issues: CheckIssue[] = [];
	if (inspected.agentsPath.type === "missing") {
		issues.push(
			issue(entry.name, "agents-not-real-dir", `.agents/skills/${entry.name}/ does not exist`),
		);
	} else if (inspected.agentsPath.type === "symlink") {
		issues.push(
			issue(
				entry.name,
				"agents-not-real-dir",
				`.agents/skills/${entry.name} is a symlink but should be a real directory (vendored)`,
			),
		);
	}
	issues.push(...checkClaudeSymlink(entry.name, inspected));
	if (inspected.skillsPath.type !== "missing")
		issues.push(
			issue(
				entry.name,
				"unexpected-skills-dir",
				`GitHub-sourced skill should not have skills/${entry.name}/ entry`,
			),
		);
	return issues;
}

function checkClaudeSymlink(name: string, inspected: AregCheckSkillInspection): CheckIssue[] {
	const expectedTarget = expectedClaudeSkillSymlinkTarget(name);
	if (inspected.claudePath.type === "missing")
		return [issue(name, "claude-missing", `.claude/skills/${name} does not exist`)];
	if (inspected.claudePath.type !== "symlink")
		return [
			issue(
				name,
				"claude-not-symlink",
				`.claude/skills/${name} is a real directory, expected symlink to ${expectedTarget}`,
			),
		];
	if (!isClaudeSkillMirror(inspected.claudePath, name))
		return [
			issue(
				name,
				"claude-wrong-target",
				`.claude/skills/${name} symlink points to ${inspected.claudePath.target}, expected ${expectedTarget}`,
			),
		];
	return [];
}

function checkSkillMd(entry: LockfileSkill, inspected: AregCheckSkillInspection): CheckIssue[] {
	const relativePath =
		entry.sourceType === "local"
			? `skills/${entry.name}/SKILL.md`
			: `.agents/skills/${entry.name}/SKILL.md`;
	const skillMd = entry.sourceType === "local" ? inspected.localSkillMd : inspected.remoteSkillMd;
	if (skillMd.type !== "file")
		return [issue(entry.name, "invalid-skill-md", `${relativePath} does not exist`)];
	const frontmatter = parseSkillFrontmatterText(skillMd.text);
	if (!frontmatter.ok)
		return [
			issue(
				entry.name,
				"invalid-skill-md",
				`${relativePath} invalid frontmatter: ${frontmatter.error.message}`,
			),
		];
	const description = frontmatter.value.description;
	if (description !== undefined && description.length > MAX_SKILL_DESCRIPTION_CHARS) {
		return [
			issue(
				entry.name,
				"invalid-skill-md",
				`${relativePath} invalid description: exceeds maximum length of 1024 characters (got ${description.length})`,
			),
		];
	}
	return [];
}

interface CheckSkillInvocationKindOptions {
	entry: LockfileSkill;
	inspected: AregCheckSkillInspection;
	inspection: CheckProjectInspection;
	piExclusions: readonly string[];
}

function skillBaseRelativePath(entry: LockfileSkill): string {
	return entry.sourceType === "local" ? `skills/${entry.name}` : `.agents/skills/${entry.name}`;
}

function checkSkillInvocationKind(options: CheckSkillInvocationKindOptions): CheckIssue[] {
	const { entry, inspected, inspection, piExclusions } = options;
	const relativePath =
		entry.sourceType === "local"
			? `skills/${entry.name}/SKILL.md`
			: `.agents/skills/${entry.name}/SKILL.md`;
	const skillMd = entry.sourceType === "local" ? inspected.localSkillMd : inspected.remoteSkillMd;
	if (skillMd.type !== "file") return [];
	const frontmatter = inspectSkillFrontmatter(skillMd.text, relativePath);
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
	if (record.artifacts.isModelInvocationDisabled && !record.artifacts.hasCodexSidecar)
		issues.push(
			issue(
				entry.name,
				"invoke-only-missing-openai-policy",
				`${skillBaseRelativePath(entry)}/agents/openai.yaml missing for invoke-only skill`,
			),
		);
	if (!record.artifacts.isModelInvocationDisabled && record.artifacts.hasCodexSidecar)
		issues.push(
			issue(
				entry.name,
				"openai-policy-without-invoke-only",
				`${skillBaseRelativePath(entry)}/agents/openai.yaml exists but SKILL.md does not set disable-model-invocation: true`,
			),
		);
	if (
		inspected.openaiPolicy.type === "file" &&
		!isManagedOpenaiPolicyContent(inspected.openaiPolicy.text)
	)
		issues.push(
			issue(
				entry.name,
				"non-managed-openai-policy",
				`${skillBaseRelativePath(entry)}/agents/openai.yaml exists with non-managed content`,
			),
		);
	if (
		record.artifacts.isModelInvocationDisabled &&
		record.artifacts.hasCodexSidecar &&
		record.replacement.verified &&
		!record.artifacts.isPiExcluded
	) {
		issues.push(
			issue(
				entry.name,
				"command-converted-missing-pi-exclusion",
				`.pi/settings.json missing -skills/${entry.name} for command-backed skill`,
			),
		);
	}
	if (record.artifacts.isPiExcluded && !record.replacement.verified) {
		const expected =
			record.replacement.surface === undefined
				? "a derived command"
				: `/${record.replacement.surface}`;
		issues.push(
			issue(
				entry.name,
				"command-converted-missing-pi-replacement",
				`Pi skill is excluded but no verified replacement command exists; expected ${expected}`,
			),
		);
	}
	return issues;
}

function checkLockfileHashes(lockfile: SkillsLockfile): CheckIssue[] {
	const issues: CheckIssue[] = [];
	for (const entry of lockfile.skills) {
		if (entry.computedHash === PLACEHOLDER_HASH) {
			issues.push(
				issue(
					entry.name,
					"invalid-lock-hash",
					`skills-lock.json entry for ${entry.name} has placeholder computedHash ${PLACEHOLDER_HASH}; regenerate or normalize the lockfile before relying on areg check.`,
				),
			);
		} else if (!SHA256_HEX_RE.test(entry.computedHash)) {
			issues.push(
				issue(
					entry.name,
					"invalid-lock-hash",
					`skills-lock.json entry for ${entry.name} has invalid computedHash '${entry.computedHash}'; expected 64 lowercase hex characters.`,
				),
			);
		}
	}
	return issues;
}

function checkOrphansAndDangling(
	lockfile: SkillsLockfile,
	inspection: CheckProjectInspection,
): CheckIssue[] {
	const lockNames = new Set(lockfile.skills.map((skill) => skill.name));
	const excluded = new Set(inspection.excludedSkillNames);
	const byName = new Map(inspection.skills.map((skill) => [skill.name, skill]));
	const issues: CheckIssue[] = [];
	for (const name of sortStrings(inspection.skillsDirectoryNames)) {
		if (!lockNames.has(name) && !excluded.has(name))
			issues.push(
				issue(
					name,
					"orphan-in-skills",
					`Orphaned directory skills/${name}/ has no entry in skills-lock.json`,
				),
			);
	}
	for (const name of sortStrings(inspection.agentsSkillNames)) {
		if (!lockNames.has(name) && !excluded.has(name))
			issues.push(
				issue(
					name,
					"orphan-in-agents",
					`Orphaned directory .agents/skills/${name}/ has no entry in skills-lock.json`,
				),
			);
	}
	for (const name of sortStrings([...lockNames])) {
		const inspected = byName.get(name) ?? missingCheckSkillInspection(name);
		if (
			inspected.skillsPath.type === "missing" &&
			inspected.agentsPath.type === "missing" &&
			inspected.claudePath.type === "missing"
		) {
			issues.push(
				issue(
					name,
					"dangling-lockfile",
					`Dangling lockfile entry: no directories found on disk for ${name}`,
				),
			);
		}
	}
	return issues;
}

function checkPairing(inspection: CheckProjectInspection): CheckIssue[] {
	const issues: CheckIssue[] = [];
	for (const directory of inspection.pairingDirectories) {
		const agentsRel =
			directory.relativeDir.length === 0 ? "AGENTS.md" : `${directory.relativeDir}/AGENTS.md`;
		const claudeRel =
			directory.relativeDir.length === 0 ? "CLAUDE.md" : `${directory.relativeDir}/CLAUDE.md`;
		if (directory.hasAgents && !directory.hasClaude) {
			issues.push(
				issue(
					agentsRel,
					"claude-md-missing-peer",
					`AGENTS.md at ${agentsRel} has no peer CLAUDE.md in the same directory`,
				),
			);
		} else if (directory.hasClaude && !directory.hasAgents) {
			issues.push(
				issue(
					claudeRel,
					"agents-md-missing-peer",
					`CLAUDE.md at ${claudeRel} has no peer AGENTS.md in the same directory`,
				),
			);
		} else if (
			directory.hasAgents &&
			directory.hasClaude &&
			!directory.claudeText?.includes("@AGENTS.md")
		) {
			issues.push(
				issue(
					claudeRel,
					"claude-md-missing-agents-ref",
					`CLAUDE.md at ${claudeRel} does not include peer AGENTS.md via @AGENTS.md syntax`,
				),
			);
		}
	}
	return issues;
}

function piSettingsPathFailureReport(projectDir: string, message: string): CheckReport {
	const issues = [issue(".pi/settings.json", "pi-settings-unusable", message)];
	return { ok: false, projectDir: projectDir, issueCount: issues.length, issues };
}

function issue(skill: string, code: CheckIssueCode, message: string): CheckIssue {
	return { skill, code, message };
}
