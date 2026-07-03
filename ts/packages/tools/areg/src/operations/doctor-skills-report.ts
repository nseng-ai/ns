import { displayWidth } from "@ji/core/text-table";

import { uniqueSortedStrings } from "../sort.ts";
import type { DoctorSkillFinding, DoctorSkillsResult } from "./doctor-skills.ts";
import {
	DOCTOR_SKILL_SEVERITY_RANK,
	type DoctorSkillFindingSeverity,
} from "./doctor-skills-severity.ts";

interface FindingGroup {
	code: string;
	severity: DoctorSkillFindingSeverity;
	remediation: string;
	findings: readonly DoctorSkillFinding[];
}

// Findings with this many or fewer occurrences show each finding's specific
// message; larger groups collapse to a wrapped list of affected labels so a
// single templated code (e.g. skill-root-shadowed) cannot bury the report.
const DETAIL_THRESHOLD = 3;
const AFFECTED_CAP = 12;
const AFFECTED_WRAP_WIDTH = 78;

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

function renderFindingBlock(group: FindingGroup): string {
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

function renderAffectedList(labels: readonly string[]): string[] {
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
		} else {
			const candidate = `${current} ${piece}`;
			if (displayWidth(candidate) > maxWidth) {
				lines.push(current);
				current = indent + piece;
			} else {
				current = candidate;
			}
		}
	});
	if (current !== "") lines.push(current);
	return lines;
}

function groupFindingsByType(findings: readonly DoctorSkillFinding[]): readonly FindingGroup[] {
	const groups = new Map<string, FindingGroup>();
	for (const finding of findings) {
		const key = `${finding.severity}\0${finding.code}\0${finding.remediation}`;
		const group = groups.get(key);
		groups.set(key, {
			code: finding.code,
			severity: finding.severity,
			remediation: finding.remediation,
			findings: group === undefined ? [finding] : [...group.findings, finding],
		});
	}
	return [...groups.values()].sort(
		(left, right) =>
			DOCTOR_SKILL_SEVERITY_RANK[left.severity] - DOCTOR_SKILL_SEVERITY_RANK[right.severity] ||
			left.code.localeCompare(right.code) ||
			left.remediation.localeCompare(right.remediation),
	);
}

function formatFindingCounts(counts: Record<DoctorSkillFindingSeverity, number>): string {
	return `${counts.error} error, ${counts.warning} warning, ${counts.info} info`;
}
