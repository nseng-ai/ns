/**
 * ADR0024-LEGACY-DELETE(whole file): marker-block report parsing for the
 * legacy blocking `runner-step`. The decomposed flow reads a JSON report file
 * (`report-file.ts`) instead. When the word is given after dogfooding, delete
 * this file with the rest of the legacy set — grep `ADR0024-LEGACY-DELETE`
 * for the complete checklist and see the `delete-legacy-runner-step-machinery`
 * handoff for order of operations.
 *
 * Child report contract: one marker-delimited block with typed header lines
 * followed by the five mandated narrative sections. Parsing is deliberately
 * diagnostic-rich — every missing/empty field or section becomes its own
 * problem so a report-integrity malfunction checkpoint can list them all.
 */
import {
	buildRunnerReport,
	isRunnerReportStatus,
	requiresCommitSubject,
	RUNNER_REPORT_SECTION_TITLES,
	RUNNER_REPORT_STATUSES,
	type ParseRunnerReportResult,
} from "./report.ts";

export const OBJECTIVE_RUNNER_REPORT_BEGIN = "OBJECTIVE_RUNNER_REPORT_BEGIN";
export const OBJECTIVE_RUNNER_REPORT_END = "OBJECTIVE_RUNNER_REPORT_END";

interface ParsedReportHeader {
	status?: string;
	branch?: string;
	commitSubject?: string;
	stopReason?: string;
	roadmapItems: string[];
	commitBody: string[];
}

const HEADER_LIST_FIELDS = ["roadmapItems", "commitBody"] as const;
type HeaderListField = (typeof HEADER_LIST_FIELDS)[number];

const HEADER_TEXT_FIELDS = ["status", "branch", "commitSubject", "stopReason"] as const;
type HeaderTextField = (typeof HEADER_TEXT_FIELDS)[number];

export function parseRunnerReport(finalText: string): ParseRunnerReportResult {
	const start = finalText.indexOf(OBJECTIVE_RUNNER_REPORT_BEGIN);
	const end = finalText.indexOf(OBJECTIVE_RUNNER_REPORT_END);
	if (start < 0 || end <= start) return { type: "missing" };
	const body = finalText.slice(start + OBJECTIVE_RUNNER_REPORT_BEGIN.length, end).trim();

	const { headerLines, sectionsText } = splitHeaderFromSections(body);
	const header = parseReportHeader(headerLines);
	const sections = splitMarkdownSections(sectionsText);

	const problems = [...headerProblems(header), ...sectionProblems(sections)];
	const { status, branch } = header;
	// headerProblems reports missing/invalid status and branch, so the extra
	// conditions only re-state for the type system what an empty problem list
	// already guarantees.
	if (problems.length > 0 || status === undefined || !isRunnerReportStatus(status)) {
		return { type: "invalid", problems };
	}
	if (branch === undefined) return { type: "invalid", problems };
	return {
		type: "ok",
		report: buildRunnerReport({
			status,
			branch,
			roadmapItems: header.roadmapItems,
			...(header.commitSubject === undefined ? {} : { commitSubject: header.commitSubject }),
			...(header.commitBody.length === 0 ? {} : { commitBody: header.commitBody.join("\n") }),
			...(header.stopReason === undefined ? {} : { stopReason: header.stopReason }),
			sections: {
				summary: sections.get("Summary") ?? "",
				objectiveImpact: sections.get("Objective Impact") ?? "",
				risksBlockers: sections.get("Risks/Blockers") ?? "",
				followUps: sections.get("Follow-Ups") ?? "",
				validation: sections.get("Validation") ?? "",
			},
		}),
	};
}

function splitHeaderFromSections(body: string): { headerLines: string[]; sectionsText: string } {
	const lines = body.split("\n");
	const firstSectionIndex = lines.findIndex((line) => line.trimStart().startsWith("## "));
	if (firstSectionIndex < 0) return { headerLines: lines, sectionsText: "" };
	return {
		headerLines: lines.slice(0, firstSectionIndex),
		sectionsText: lines.slice(firstSectionIndex).join("\n"),
	};
}

// Ported from the autopilot prototype's parseMarkerBlock line discipline:
// `key: value` text fields, `key:` opening a `- ` list, unknown lines reset
// list state. Specialized to the runner's fixed field set instead of the
// prototype's generic report shape.
function parseReportHeader(lines: readonly string[]): ParsedReportHeader {
	const header: ParsedReportHeader = { roadmapItems: [], commitBody: [] };
	let activeListField: HeaderListField | undefined;
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		if (trimmed.startsWith("- ") && activeListField !== undefined) {
			const item = trimmed.slice(2).trim();
			if (item !== "") header[activeListField].push(item);
			continue;
		}
		const colon = trimmed.indexOf(":");
		if (colon <= 0) {
			activeListField = undefined;
			continue;
		}
		const key = trimmed.slice(0, colon).trim();
		const value = trimmed.slice(colon + 1).trim();
		if (value === "" && isHeaderListField(key)) {
			activeListField = key;
			continue;
		}
		activeListField = undefined;
		if (isHeaderTextField(key) && value !== "") header[key] = value;
	}
	return header;
}

function splitMarkdownSections(sectionsText: string): Map<string, string> {
	const sections = new Map<string, string>();
	if (sectionsText === "") return sections;
	let currentTitle: string | undefined;
	let currentLines: string[] = [];
	const flush = () => {
		if (currentTitle !== undefined && !sections.has(currentTitle)) {
			sections.set(currentTitle, currentLines.join("\n").trim());
		}
	};
	for (const line of sectionsText.split("\n")) {
		const trimmed = line.trimStart();
		if (trimmed.startsWith("## ")) {
			flush();
			currentTitle = trimmed.slice(3).trim();
			currentLines = [];
			continue;
		}
		currentLines.push(line);
	}
	flush();
	return sections;
}

function headerProblems(header: ParsedReportHeader): string[] {
	const problems: string[] = [];
	if (header.status === undefined) {
		problems.push("Missing required header field `status`.");
	} else if (!isRunnerReportStatus(header.status)) {
		problems.push(
			`Invalid \`status\` value ${JSON.stringify(header.status)}; expected one of: ${RUNNER_REPORT_STATUSES.join(" | ")}.`,
		);
	}
	if (header.branch === undefined) {
		problems.push("Missing required header field `branch`.");
	}
	if (header.roadmapItems.length === 0) {
		problems.push("Missing or empty required header list `roadmapItems`.");
	}
	if (
		header.status !== undefined &&
		isRunnerReportStatus(header.status) &&
		requiresCommitSubject(header.status) &&
		header.commitSubject === undefined
	) {
		problems.push(
			"Missing required header field `commitSubject` (required when status is ready-for-parent-commit).",
		);
	}
	return problems;
}

function sectionProblems(sections: ReadonlyMap<string, string>): string[] {
	const problems: string[] = [];
	for (const title of RUNNER_REPORT_SECTION_TITLES) {
		const content = sections.get(title);
		if (content === undefined) {
			problems.push(`Missing required section \`## ${title}\`.`);
		} else if (content === "") {
			problems.push(`Section \`## ${title}\` is empty.`);
		}
	}
	return problems;
}

function isHeaderListField(key: string): key is HeaderListField {
	return (HEADER_LIST_FIELDS as readonly string[]).includes(key);
}

function isHeaderTextField(key: string): key is HeaderTextField {
	return (HEADER_TEXT_FIELDS as readonly string[]).includes(key);
}
