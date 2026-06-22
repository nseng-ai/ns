import type {
	FindingConfidence,
	FindingSeverity,
	ThermoCouncilFinding,
	ThermoCouncilReviewerOutcome,
	ThermoCouncilSeatConfig,
	ThermoCouncilSeatId,
} from "../thermo-council-contract.ts";
import type { FindingCluster, FlatFinding } from "./types.ts";

export function clusterFindings(
	completed: readonly Extract<ThermoCouncilReviewerOutcome, { readonly type: "completed" }>[],
): readonly FindingCluster[] {
	const clusters: FlatFinding[][] = [];
	for (const outcome of completed) {
		for (const finding of outcome.review.findings) {
			const flat = { seat: outcome.seat, finding: withSeatFindingId(outcome.seat, finding) };
			const matchingCluster = clusters.find((cluster) =>
				cluster.some((existing) => shouldClusterFindings(existing.finding, flat.finding)),
			);
			if (matchingCluster) {
				matchingCluster.push(flat);
			} else {
				clusters.push([flat]);
			}
		}
	}
	return clusters.map(toFindingCluster).sort((left, right) => right.rankScore - left.rankScore);
}

export function uniqueStrings(values: readonly string[]): readonly string[] {
	return [...new Set(values)].sort();
}

function reviewerSeatPrefix(seat: ThermoCouncilSeatConfig): string {
	switch (seat.id) {
		case "anthropic-opus":
			return "opus";
		case "openai-high":
			return "openai";
		case "gemini-high":
			return "gemini";
	}
}

function withSeatFindingId(
	seat: ThermoCouncilSeatConfig,
	finding: ThermoCouncilFinding,
): ThermoCouncilFinding {
	return { ...finding, id: `${reviewerSeatPrefix(seat)}-${finding.id}` };
}

function shouldClusterFindings(left: ThermoCouncilFinding, right: ThermoCouncilFinding): boolean {
	const titleOverlap = termOverlap(left.title, right.title);
	const problemFixOverlap = termOverlap(
		`${left.problem} ${left.proposedFix}`,
		`${right.problem} ${right.proposedFix}`,
	);
	if (left.files.length === 0 || right.files.length === 0) {
		return (titleOverlap >= 3 && problemFixOverlap >= 5) || problemFixOverlap >= 8;
	}
	const fileOverlap = left.files.some((file) => right.files.includes(file));
	if (!fileOverlap) return false;
	return titleOverlap >= 2 || problemFixOverlap >= 3;
}

function termOverlap(left: string, right: string): number {
	const leftTerms = normalizedTerms(left);
	const rightTerms = normalizedTerms(right);
	return [...leftTerms].filter((term) => rightTerms.has(term)).length;
}

function normalizedTerms(text: string): ReadonlySet<string> {
	const stopWords = new Set([
		"the",
		"and",
		"for",
		"with",
		"that",
		"this",
		"from",
		"into",
		"review",
	]);
	return new Set(
		text
			.toLowerCase()
			.split(/[^a-z0-9_/-]+/)
			.map((term) => term.trim())
			.filter((term) => term.length >= 4 && !stopWords.has(term)),
	);
}

function toFindingCluster(findings: readonly FlatFinding[]): FindingCluster {
	const support = uniqueSeats(findings.map((finding) => finding.seat));
	const representative = findings[0]?.finding;
	if (representative === undefined) throw new Error("empty finding cluster");
	const severity = highestSeverity(findings.map((finding) => finding.finding.severity));
	const confidence = highestConfidence(findings.map((finding) => finding.finding.confidence));
	const files = uniqueStrings(findings.flatMap((finding) => finding.finding.files));
	const rankScore =
		support.length * 10_000 + severityScore(severity) * 1_000 + confidenceScore(confidence) * 100;
	return {
		title: representative.title,
		files,
		support,
		findings: [...findings],
		severity,
		confidence,
		rankScore,
	};
}

function uniqueSeats(
	seats: readonly ThermoCouncilSeatConfig[],
): readonly ThermoCouncilSeatConfig[] {
	const byId = new Map<ThermoCouncilSeatId, ThermoCouncilSeatConfig>();
	for (const seat of seats) byId.set(seat.id, seat);
	return [...byId.values()];
}

function highestSeverity(values: readonly FindingSeverity[]): FindingSeverity {
	return [...values].sort((left, right) => severityScore(right) - severityScore(left))[0] ?? "low";
}

function highestConfidence(values: readonly FindingConfidence[]): FindingConfidence {
	return (
		[...values].sort((left, right) => confidenceScore(right) - confidenceScore(left))[0] ??
		"speculative"
	);
}

function severityScore(severity: FindingSeverity): number {
	switch (severity) {
		case "critical":
			return 4;
		case "high":
			return 3;
		case "medium":
			return 2;
		case "low":
			return 1;
	}
}

function confidenceScore(confidence: FindingConfidence): number {
	switch (confidence) {
		case "trunk-likely":
			return 4;
		case "likely":
			return 3;
		case "uncertain":
			return 2;
		case "speculative":
			return 1;
	}
}
