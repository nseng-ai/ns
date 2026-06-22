import type {
	ThermoCouncilReviewerOutcome,
	ThermoCouncilScope,
	ThermoCouncilSeatStatus,
} from "../thermo-council-contract.ts";
import { SAFETY_NOTE } from "./constants.ts";
import { clusterFindings, uniqueStrings } from "./synthesis.ts";
import type { FindingCluster } from "./types.ts";

export function renderThermoCouncilReport(
	scope: ThermoCouncilScope,
	outcomes: readonly ThermoCouncilReviewerOutcome[],
): string {
	const completed = outcomes.filter((outcome) => outcome.type === "completed");
	if (completed.length === 0) return renderAllSeatsFailedReport(scope, outcomes);

	const clusters = clusterFindings(completed);
	const mainFindings = clusters.filter((cluster) => cluster.support.length > 1);
	const singleFindings = clusters.filter((cluster) => cluster.support.length === 1);
	return [
		"# Thermo Council Report",
		"",
		"## Scope",
		`- Working directory: ${scope.cwd}`,
		`- Base: ${scope.baseRef} (${scope.baseSha})`,
		`- Head: ${scope.headRef} (${scope.headSha})`,
		`- Changed files: ${scope.changedFiles.length}`,
		`- Diff included in reviewer prompts: ${scope.isDiffTruncated ? "truncated" : "full"}`,
		"",
		"```text",
		scope.diffStat,
		"```",
		"",
		"## Council Seat Status",
		renderSeatStatusTable(outcomes),
		"",
		"## Synthesis Summary",
		renderSynthesisSummary(completed, clusters),
		"",
		"## Ranked Findings",
		...(mainFindings.length === 0
			? ["No corroborated findings were reported by multiple council seats."]
			: renderFindingClusters(mainFindings)),
		"",
		"## Single-Model / Dissenting Findings",
		...(singleFindings.length === 0
			? ["No single-model findings were reported outside the corroborated set."]
			: renderFindingClusters(singleFindings)),
		"",
		"## Disagreements and Tensions",
		...renderDisagreements(completed),
		"",
		"## Validation Hints",
		...renderValidationHints(clusters),
		"",
		"## Evidence and Safety Notes",
		...outcomes.map(
			(outcome) =>
				`- ${outcome.seat.label} (${outcome.seat.model}): ${outcome.sessionFile ?? "no child session file captured"}`,
		),
		`- ${SAFETY_NOTE}`,
	].join("\n");
}

export function renderFatalReport(message: string): string {
	return [
		"# Thermo Council Report",
		"",
		"/thermo-council stopped before launching reviewer seats.",
		"",
		"## Reason",
		message,
		"",
		"## Safety Notes",
		SAFETY_NOTE,
	].join("\n");
}

function renderFindingClusters(clusters: readonly FindingCluster[]): readonly string[] {
	return clusters.flatMap((cluster, index) => {
		const sourceFindings = cluster.findings
			.map((finding) => `${finding.seat.label}:${finding.finding.id}`)
			.join(", ");
		const validationHints = uniqueStrings(
			cluster.findings.flatMap((finding) => finding.finding.validationHints),
		);
		const evidence = cluster.findings
			.map((finding) => `- ${finding.seat.label}: ${finding.finding.evidence}`)
			.join("\n");
		const problems = cluster.findings
			.map((finding) => `- ${finding.seat.label}: ${finding.finding.problem}`)
			.join("\n");
		const fixes = cluster.findings
			.map((finding) => `- ${finding.seat.label}: ${finding.finding.proposedFix}`)
			.join("\n");
		return [
			`### ${index + 1}. ${cluster.title}`,
			`- Support: ${cluster.support.map((seat) => seat.label).join(", ")}`,
			`- Confidence: ${cluster.confidence}`,
			`- Severity: ${cluster.severity}`,
			`- Files: ${cluster.files.length === 0 ? "(none supplied)" : cluster.files.join(", ")}`,
			`- Source findings: ${sourceFindings}`,
			"- Evidence:",
			evidence,
			"- Problem:",
			problems,
			"- Proposed remediation:",
			fixes,
			`- Behavior risk: ${cluster.findings.map((finding) => `${finding.seat.label}: ${finding.finding.behaviorRisk}`).join(" | ")}`,
			`- Validation hints: ${validationHints.length === 0 ? "None supplied" : validationHints.join("; ")}`,
			"",
		];
	});
}

function renderSeatStatusTable(outcomes: readonly ThermoCouncilReviewerOutcome[]): string {
	return [
		"| Seat | Model | Status | Diagnostic | Child session |",
		"| --- | --- | --- | --- | --- |",
		...outcomes.map((outcome) => {
			const status: ThermoCouncilSeatStatus = outcome.type;
			return `| ${outcome.seat.label} | \`${outcome.seat.model}\` | ${status} | ${seatDiagnostic(outcome)} | ${outcome.sessionFile ?? ""} |`;
		}),
	].join("\n");
}

function seatDiagnostic(outcome: ThermoCouncilReviewerOutcome): string {
	switch (outcome.type) {
		case "completed":
			return `${outcome.review.findings.length} findings`;
		case "blocked":
			return escapeTable(outcome.reason);
		case "failed":
			return escapeTable(outcome.diagnostic);
	}
}

function renderSynthesisSummary(
	completed: readonly Extract<ThermoCouncilReviewerOutcome, { readonly type: "completed" }>[],
	clusters: readonly FindingCluster[],
): string {
	const corroborated = clusters.filter((cluster) => cluster.support.length > 1).length;
	const single = clusters.length - corroborated;
	const summaries = completed.flatMap((outcome) =>
		outcome.review.summary === undefined
			? []
			: [`- ${outcome.seat.label}: ${outcome.review.summary}`],
	);
	return [
		`${completed.length} council seat(s) completed. The deterministic synthesizer found ${clusters.length} finding cluster(s): ${corroborated} corroborated and ${single} single-seat/dissenting.`,
		...(summaries.length === 0 ? [] : ["", ...summaries]),
	].join("\n");
}

function renderDisagreements(
	completed: readonly Extract<ThermoCouncilReviewerOutcome, { readonly type: "completed" }>[],
): readonly string[] {
	const disagreements = completed.flatMap((outcome) =>
		(outcome.review.disagreements ?? []).map((item) => `- ${outcome.seat.label}: ${item}`),
	);
	return disagreements.length === 0 ? ["No explicit disagreements were reported."] : disagreements;
}

function renderValidationHints(clusters: readonly FindingCluster[]): readonly string[] {
	const hints = uniqueStrings(
		clusters.flatMap((cluster) =>
			cluster.findings.flatMap((finding) => finding.finding.validationHints),
		),
	);
	return hints.length === 0
		? ["No validation hints were supplied."]
		: hints.map((hint) => `- ${hint}`);
}

function renderAllSeatsFailedReport(
	scope: ThermoCouncilScope,
	outcomes: readonly ThermoCouncilReviewerOutcome[],
): string {
	return [
		"# Thermo Council Report",
		"",
		"No council seat completed, so /thermo-council did not synthesize review findings.",
		"",
		"## Scope",
		`- Base: ${scope.baseRef} (${scope.baseSha})`,
		`- Head: ${scope.headRef} (${scope.headSha})`,
		"",
		"## Council Seat Status",
		renderSeatStatusTable(outcomes),
		"",
		"## Evidence and Safety Notes",
		`- ${SAFETY_NOTE}`,
	].join("\n");
}

function escapeTable(value: string): string {
	return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}
