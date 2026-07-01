import { failure, negative, ok, type ClinkrExit } from "@sdl/clinkr";
import { optionalEntry } from "@sdl/core/primitives";
import { z } from "zod";

import type { AregCliContext } from "../context.ts";
import type {
	AregCheckSkillInspection,
	AregPathState,
	AregPiSkillInventoryInspection,
	AregProjectBaseInspection,
	AregReplacementInspection,
	AregSkillKindSkillInspection,
	AregSkillNameInventory,
	AregTextFileState,
} from "../gateways.ts";
import { uniqueSortedStrings } from "../sort.ts";
import { parsePiSettings } from "./pi-settings.ts";
import { derivePiReplacementCommand } from "./pi-replacement.ts";
import { collectCheckSkillInspections, collectSkillKindInspections } from "./project-inspection.ts";
import { buildSkillKindRecords, type SkillKindRecord } from "./skill-kind-inference.ts";

const findingSeverities = ["error", "warning", "info"] as const;
const doctorStatusValues = ["ok", "warning", "error"] as const;

export type DoctorSkillFindingSeverity = (typeof findingSeverities)[number];
export type DoctorSkillsStatus = (typeof doctorStatusValues)[number];

export interface DoctorSkillFinding {
	code: string;
	severity: DoctorSkillFindingSeverity;
	message: string;
	remediation: string;
	skill?: string;
	path?: string;
	surface?: string;
	evidence?: Record<string, string | boolean | number | string[]>;
}

export interface DoctorSkillsResult {
	projectDir: string;
	summary: {
		status: DoctorSkillsStatus;
		findingCounts: Record<DoctorSkillFindingSeverity, number>;
	};
	findings: readonly DoctorSkillFinding[];
}

export interface DoctorSkillsInspection {
	projectDir: string;
	base: AregProjectBaseInspection;
	skillInventory: AregSkillNameInventory;
	piSkillInventory: AregPiSkillInventoryInspection;
	replacement: AregReplacementInspection;
	piDir: AregPathState;
	piSettings: AregTextFileState;
	checkSkills: readonly AregCheckSkillInspection[];
	skillKindSkills: readonly AregSkillKindSkillInspection[];
}

const doctorSkillFindingSchema: z.ZodType<DoctorSkillFinding> = z
	.object({
		code: z.string(),
		severity: z.enum(findingSeverities),
		message: z.string(),
		remediation: z.string(),
		skill: z.string().optional(),
		path: z.string().optional(),
		surface: z.string().optional(),
		evidence: z
			.record(z.string(), z.union([z.string(), z.boolean(), z.number(), z.array(z.string())]))
			.optional(),
	})
	.transform(
		(finding): DoctorSkillFinding => ({
			code: finding.code,
			severity: finding.severity,
			message: finding.message,
			remediation: finding.remediation,
			...optionalEntry("skill", finding.skill),
			...optionalEntry("path", finding.path),
			...optionalEntry("surface", finding.surface),
			...optionalEntry("evidence", finding.evidence),
		}),
	);

export const doctorSkillsRequestSchema = z.object({
	path: z
		.string()
		.default(".")
		.describe("Project directory or subdirectory to inspect (default: current directory)."),
});

export const doctorSkillsResultSchema = z.object({
	projectDir: z.string(),
	summary: z.object({
		status: z.enum(doctorStatusValues),
		findingCounts: z.object({
			error: z.number(),
			warning: z.number(),
			info: z.number(),
		}),
	}),
	findings: z.array(doctorSkillFindingSchema),
});

export type DoctorSkillsRequest = z.infer<typeof doctorSkillsRequestSchema>;

export async function runDoctorSkills(
	ctx: AregCliContext,
	request: DoctorSkillsRequest,
): Promise<ClinkrExit<DoctorSkillsResult>> {
	const inspection = await inspectDoctorSkillsProject(ctx, request.path);
	if (inspection.type === "error") return failure("project-inspection-failed", inspection.message);
	const result = buildDoctorSkillsResult(inspection.value);
	if (result.findings.length === 0) return ok(result);
	return negative("Skill registry drift found.", {
		data: result,
		human: renderDoctorSkills(result),
	});
}

export function buildDoctorSkillsResult(inspection: DoctorSkillsInspection): DoctorSkillsResult {
	const findings = buildDoctorSkillFindings(inspection);
	const findingCounts = countFindings(findings);
	return {
		projectDir: inspection.projectDir,
		summary: {
			status: statusForCounts(findingCounts),
			findingCounts,
		},
		findings,
	};
}

export function buildDoctorSkillFindings(
	inspection: DoctorSkillsInspection,
): readonly DoctorSkillFinding[] {
	const piSettings = parsePiSettings(inspection.piDir, inspection.piSettings);
	if (!piSettings.ok) {
		return [
			{
				code: "pi-settings-unreadable",
				severity: "error",
				message: piSettings.error.message,
				remediation:
					"Fix .pi/settings.json so skill inventory and replacement diagnostics can run.",
				path: ".pi/settings.json",
			},
		];
	}
	const skillKindRecords = buildSkillKindRecords({
		projectDir: inspection.projectDir,
		projectPathState: inspection.base.projectPathState,
		piDir: inspection.piDir,
		piSettings: inspection.piSettings,
		replacement: inspection.replacement,
		skills: inspection.skillKindSkills,
	});
	const records = skillKindRecords.ok ? skillKindRecords.value : [];
	const findings: DoctorSkillFinding[] = [];
	findings.push(...filesystemFindings(inspection));
	findings.push(...piInventoryFindings(inspection));
	findings.push(...replacementFindings(records, piSettings.value.exclusions));
	if (!skillKindRecords.ok) {
		findings.push({
			code: "skill-kind-inspection-invalid",
			severity: "error",
			message: skillKindRecords.error.message,
			remediation:
				"Fix the managed skill metadata so command-backed replacement diagnostics can inspect it.",
		});
	}
	return sortFindings(findings);
}

export function renderDoctorSkills(result: DoctorSkillsResult): string {
	if (result.findings.length === 0) return "No skill registry drift found.";
	const blocks = groupFindingsByType(result.findings).map(renderFindingBlock);
	return [
		`Skill doctor: ${result.summary.status} (${formatFindingCounts(result.summary.findingCounts)})`,
		`Project: ${result.projectDir}`,
		"",
		blocks.join("\n\n"),
		"",
		"Run `areg doctor skills --format json` for full machine-readable evidence.",
	].join("\n");
}

async function inspectDoctorSkillsProject(
	ctx: AregCliContext,
	requestPath: string,
): Promise<{ type: "ok"; value: DoctorSkillsInspection } | { type: "error"; message: string }> {
	const base = await ctx.project.inspectProjectBase({
		cwd: ctx.cwd,
		projectPath: requestPath,
		env: ctx.env,
	});
	if (base.projectPathState.type === "missing")
		return { type: "error", message: `Target ${base.projectDir} does not exist.` };
	if (base.projectPathState.type !== "directory")
		return { type: "error", message: `${base.projectDir} is not a directory.` };
	const repoRoot = await ctx.git.optionalRepoRoot({ cwd: base.projectDir });
	if (repoRoot.type === "error") return { type: "error", message: repoRoot.error.message };
	if (repoRoot.type === "missing")
		return { type: "error", message: `No Git root found containing ${base.projectDir}.` };
	const projectDir = repoRoot.value;
	const rootBase =
		projectDir === base.projectDir
			? base
			: await ctx.project.inspectProjectBase({ cwd: projectDir, projectPath: ".", env: ctx.env });
	const piArtifacts = await ctx.project.inspectPiArtifacts({ projectDir, env: ctx.env });
	const skillInventory = await ctx.project.inspectSkillNameInventory({ projectDir, env: ctx.env });
	const piSkillInventory = await ctx.project.inspectPiSkillInventory({ projectDir, env: ctx.env });
	const skillNames = uniqueSortedStrings([
		...skillInventory.skillsDirectoryNames,
		...skillInventory.agentsSkillNames,
		...skillInventory.claudeSkillNames,
		...skillInventory.skillKindNames,
	]);
	const checkSkills = await collectCheckSkillInspections(ctx, projectDir, skillNames);
	const skillKindSkills = await collectSkillKindInspections(ctx, projectDir, skillNames);
	return {
		type: "ok",
		value: {
			projectDir,
			base: rootBase,
			skillInventory,
			piSkillInventory,
			replacement: piArtifacts.replacement,
			piDir: piArtifacts.piDir,
			piSettings: piArtifacts.piSettings,
			checkSkills,
			skillKindSkills,
		},
	};
}

function filesystemFindings(inspection: DoctorSkillsInspection): readonly DoctorSkillFinding[] {
	const findings: DoctorSkillFinding[] = [];
	const managed = new Set(inspection.skillInventory.skillKindNames);
	const skillNames = uniqueSortedStrings([
		...inspection.skillInventory.skillsDirectoryNames,
		...inspection.skillInventory.agentsSkillNames,
		...inspection.skillInventory.claudeSkillNames,
	]);
	const checkSkillsByName = new Map(inspection.checkSkills.map((skill) => [skill.name, skill]));
	for (const skillName of skillNames) {
		const roots = rootsForSkill(inspection.skillInventory, skillName);
		const independentRoots = independentRootsForSkill(
			skillName,
			roots,
			checkSkillsByName.get(skillName),
		);
		if (independentRoots.length > 1) {
			findings.push({
				code: "skill-root-shadowed",
				severity: "warning",
				skill: skillName,
				message: `${skillName} appears in multiple canonical skill roots: ${independentRoots.join(", ")}.`,
				remediation:
					"Keep one canonical skill root; use areg-managed symlink mirrors for agent-specific skill roots.",
				evidence: { roots, independentRoots: [...independentRoots] },
			});
		}
		if (!managed.has(skillName)) {
			findings.push({
				code: "skill-root-unmanaged",
				severity: "warning",
				skill: skillName,
				message: `${skillName} exists on disk but is absent from areg's managed skill-kind inventory.`,
				remediation:
					"Run areg skill list/show to confirm the root is intentionally unmanaged, then move or reconcile the skill root.",
				evidence: { roots },
			});
		}
	}
	for (const skill of inspection.skillKindSkills) {
		if (skill.skillDir.type !== "symlink") continue;
		findings.push({
			code: "skill-root-symlink-refused",
			severity: "error",
			skill: skill.name,
			path: skill.baseRelativePath,
			message: `${skill.baseRelativePath} is a symlink; diagnostics refuse to treat it as a canonical skill root.`,
			remediation: "Replace the symlink with a real skill directory or remove the shadowing root.",
			evidence: { target: skill.skillDir.target },
		});
	}
	for (const skill of inspection.checkSkills) {
		if (skill.skillsPath.type !== "missing" && skill.localSkillMd.type !== "file") {
			findings.push(missingSkillMdFinding(skill.name, `skills/${skill.name}/SKILL.md`));
		}
		if (skill.agentsPath.type !== "missing" && skill.remoteSkillMd.type !== "file") {
			findings.push(missingSkillMdFinding(skill.name, `.agents/skills/${skill.name}/SKILL.md`));
		}
	}
	return findings;
}

function piInventoryFindings(inspection: DoctorSkillsInspection): readonly DoctorSkillFinding[] {
	const findings: DoctorSkillFinding[] = [];
	const expected = new Set(inspection.skillInventory.skillKindNames);
	const exposed = new Set(inspection.piSkillInventory.skillNames);
	for (const skill of [...expected].sort()) {
		if (exposed.has(skill)) continue;
		findings.push({
			code: "pi-inventory-missing-skill",
			severity: "warning",
			skill,
			message: `Areg sees ${skill}, but Pi's model-facing skill inventory ${inventoryQualifier(inspection.piSkillInventory)} does not expose it.`,
			remediation:
				"Refresh Pi startup skill inventory or add/verify a replacement command with areg skill apply command-backed if the skill is command-backed.",
			evidence: {
				piInventoryApproximation: inspection.piSkillInventory.isApproximation,
				piInventorySource: inspection.piSkillInventory.source,
				exposedSkillNames: [...inspection.piSkillInventory.skillNames],
			},
		});
	}
	for (const skill of [...exposed].sort()) {
		if (expected.has(skill)) continue;
		findings.push({
			code: "pi-inventory-extra-skill",
			severity: "info",
			skill,
			message: `Pi's model-facing skill inventory ${inventoryQualifier(inspection.piSkillInventory)} exposes ${skill}, but areg does not manage it.`,
			remediation:
				"Remove stale Pi skill inventory entries or add the skill to an areg-managed root.",
			evidence: { piInventorySource: inspection.piSkillInventory.source },
		});
	}
	return findings;
}

function replacementFindings(
	records: readonly SkillKindRecord[],
	exclusions: readonly string[],
): readonly DoctorSkillFinding[] {
	const findings: DoctorSkillFinding[] = [];
	const excludedSkills = new Set(
		exclusions
			.filter((entry) => entry.startsWith("-skills/"))
			.map((entry) => entry.slice("-skills/".length)),
	);
	for (const record of records) {
		if (record.artifacts.isPiExcluded && !record.replacement.verified) {
			findings.push(
				replacementFinding(record.skill, record.replacement.surface, {
					code: "excluded-skill-without-replacement",
					severity: "error",
					message: `${record.skill} is excluded in .pi/settings.json without a verified replacement surface.`,
					remediation:
						"Add the replacement Pi command surface and keep the exclusion, or remove the exclusion.",
				}),
			);
		}
		if (record.replacement.verified && !record.artifacts.isPiExcluded) {
			findings.push(
				replacementFinding(record.skill, record.replacement.surface, {
					code: "command-backed-skill-not-excluded",
					severity: "warning",
					message: `${record.skill} has a verified replacement command but is not excluded from Pi skill discovery.`,
					remediation:
						"Run areg skill apply command-backed <skill> if this skill is command-backed, or remove the stale replacement surface expectation.",
				}),
			);
		}
	}
	for (const skill of [...excludedSkills].sort()) {
		if (records.some((record) => record.skill === skill)) continue;
		const surface = derivePiReplacementCommand(skill);
		findings.push(
			replacementFinding(skill, surface, {
				code: "excluded-skill-without-replacement",
				severity: "error",
				message: `${skill} is excluded in .pi/settings.json but was not found in areg's skill inventory.`,
				remediation: "Remove the stale exclusion or restore the skill and its replacement command.",
			}),
		);
	}
	return findings;
}

function replacementFinding(
	skill: string,
	surface: string | undefined,
	finding: Pick<DoctorSkillFinding, "code" | "severity" | "message" | "remediation">,
): DoctorSkillFinding {
	return {
		...finding,
		skill,
		...optionalEntry("surface", surface),
	};
}

type SkillRoot = "skills" | ".agents/skills" | ".claude/skills";

function rootsForSkill(inventory: AregSkillNameInventory, skillName: string): SkillRoot[] {
	const roots: SkillRoot[] = [];
	if (inventory.skillsDirectoryNames.includes(skillName)) roots.push("skills");
	if (inventory.agentsSkillNames.includes(skillName)) roots.push(".agents/skills");
	if (inventory.claudeSkillNames.includes(skillName)) roots.push(".claude/skills");
	return roots;
}

function independentRootsForSkill(
	skillName: string,
	roots: readonly SkillRoot[],
	checkSkill: AregCheckSkillInspection | undefined,
): readonly SkillRoot[] {
	return roots.filter((root) => !isAregManagedMirrorRoot(skillName, root, checkSkill));
}

function isAregManagedMirrorRoot(
	skillName: string,
	root: SkillRoot,
	checkSkill: AregCheckSkillInspection | undefined,
): boolean {
	if (checkSkill === undefined) return false;
	switch (root) {
		case "skills":
			return false;
		case ".agents/skills":
			return (
				checkSkill.agentsPath.type === "symlink" &&
				checkSkill.agentsPath.target === `../../skills/${skillName}`
			);
		case ".claude/skills":
			return (
				checkSkill.claudePath.type === "symlink" &&
				checkSkill.claudePath.target === `../../.agents/skills/${skillName}`
			);
	}
}

function missingSkillMdFinding(skill: string, path: string): DoctorSkillFinding {
	return {
		code: "skill-root-missing-skill-md",
		severity: "error",
		skill,
		path,
		message: `${path} is missing or unreadable.`,
		remediation: "Add a readable SKILL.md or remove the directory from the skill root.",
	};
}

// Findings with this many or fewer occurrences show each finding's specific
// message; larger groups collapse to a wrapped list of affected labels so a
// single templated code (e.g. skill-root-shadowed) cannot bury the report.
const DETAIL_THRESHOLD = 3;
const AFFECTED_CAP = 12;
const AFFECTED_WRAP_WIDTH = 78;

function renderFindingBlock(group: {
	code: string;
	severity: DoctorSkillFindingSeverity;
	remediation: string;
	findings: readonly DoctorSkillFinding[];
}): string {
	const lines = [
		`${group.severity}  ${group.code}  (${group.findings.length})`,
		`  Fix: ${group.remediation}`,
	];
	if (group.findings.length <= DETAIL_THRESHOLD) {
		for (const finding of group.findings) {
			lines.push(`  ${affectedLabel(finding)}: ${finding.message}`);
		}
	} else {
		lines.push(...renderAffectedList(uniqueSortedStrings(group.findings.map(affectedLabel))));
	}
	return lines.join("\n");
}

function affectedLabel(finding: DoctorSkillFinding): string {
	return finding.skill ?? finding.path ?? finding.surface ?? "project";
}

function renderAffectedList(labels: readonly string[]): readonly string[] {
	const shown = labels.slice(0, AFFECTED_CAP);
	const remaining = labels.length - shown.length;
	const lines = wrapCommaList(shown, "  ", AFFECTED_WRAP_WIDTH);
	if (remaining > 0) {
		lines.push(`  (+${remaining} more; run with --format json for the full list)`);
	}
	return lines;
}

function wrapCommaList(items: readonly string[], indent: string, maxWidth: number): string[] {
	const lines: string[] = [];
	let current = "";
	items.forEach((item, index) => {
		const piece = index === items.length - 1 ? item : `${item},`;
		if (current === "") {
			current = indent + piece;
		} else if (current.length + 1 + piece.length > maxWidth) {
			lines.push(current);
			current = indent + piece;
		} else {
			current = `${current} ${piece}`;
		}
	});
	if (current !== "") lines.push(current);
	return lines;
}

function groupFindingsByType(findings: readonly DoctorSkillFinding[]): readonly {
	code: string;
	severity: DoctorSkillFindingSeverity;
	remediation: string;
	findings: readonly DoctorSkillFinding[];
}[] {
	const groups = new Map<
		string,
		{
			code: string;
			severity: DoctorSkillFindingSeverity;
			remediation: string;
			findings: DoctorSkillFinding[];
		}
	>();
	for (const finding of findings) {
		const key = `${finding.severity}\0${finding.code}\0${finding.remediation}`;
		const group = groups.get(key) ?? {
			code: finding.code,
			severity: finding.severity,
			remediation: finding.remediation,
			findings: [],
		};
		group.findings.push(finding);
		groups.set(key, group);
	}
	return [...groups.values()].sort((left, right) => {
		const severityRank: Record<DoctorSkillFindingSeverity, number> = {
			error: 0,
			warning: 1,
			info: 2,
		};
		return (
			severityRank[left.severity] - severityRank[right.severity] ||
			left.code.localeCompare(right.code) ||
			left.remediation.localeCompare(right.remediation)
		);
	});
}

function formatFindingCounts(counts: Record<DoctorSkillFindingSeverity, number>): string {
	return `${counts.error} error, ${counts.warning} warning, ${counts.info} info`;
}

function countFindings(
	findings: readonly DoctorSkillFinding[],
): Record<DoctorSkillFindingSeverity, number> {
	return {
		error: findings.filter((finding) => finding.severity === "error").length,
		warning: findings.filter((finding) => finding.severity === "warning").length,
		info: findings.filter((finding) => finding.severity === "info").length,
	};
}

function statusForCounts(counts: Record<DoctorSkillFindingSeverity, number>): DoctorSkillsStatus {
	if (counts.error > 0) return "error";
	if (counts.warning > 0) return "warning";
	return "ok";
}

function inventoryQualifier(inventory: AregPiSkillInventoryInspection): string {
	return inventory.isApproximation ? "approximation" : "snapshot";
}

function sortFindings(findings: readonly DoctorSkillFinding[]): readonly DoctorSkillFinding[] {
	const severityRank: Record<DoctorSkillFindingSeverity, number> = {
		error: 0,
		warning: 1,
		info: 2,
	};
	return [...findings].sort(
		(left, right) =>
			severityRank[left.severity] - severityRank[right.severity] ||
			left.code.localeCompare(right.code) ||
			(left.skill ?? "").localeCompare(right.skill ?? "") ||
			(left.path ?? left.surface ?? "").localeCompare(right.path ?? right.surface ?? ""),
	);
}
