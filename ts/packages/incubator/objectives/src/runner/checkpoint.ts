import type { RunnerStepMode } from "./context.ts";
import type { GateCheckResult } from "./gate.ts";

export type RunnerCheckpointStatus =
	| "committed"
	| "stop"
	| "blocked"
	| "verification-failed"
	| "malfunction";

/**
 * Runner-attested facts for the verified zone of a Runner Checkpoint. Every
 * field here is something the runner itself observed or performed; the child's
 * narrative never enters this shape.
 */
export interface CheckpointFacts {
	slug: string;
	mode: RunnerStepMode;
	status: RunnerCheckpointStatus;
	baseBranch: string;
	branch: string;
	commitSha?: string;
	changedPaths?: readonly string[];
	gateChecks?: readonly GateCheckResult[];
	/** Stop/blocked reason as stated in the child's parsed report. */
	stopReason?: string;
	diagnostics?: readonly string[];
}

/**
 * Renders the two-zone Runner Checkpoint: runner-attested facts first, then
 * the child-reported narrative explicitly labeled as unverified claims.
 */
export function renderRunnerCheckpoint(
	facts: CheckpointFacts,
	narrative: string | undefined,
): string {
	const lines = [
		`# Runner Checkpoint: ${facts.slug} (${facts.status})`,
		"",
		"## Verified facts (runner-attested)",
		"",
		`- objective: ${facts.slug}`,
		`- mode: ${facts.mode}`,
		`- status: ${facts.status}`,
		`- base branch: ${facts.baseBranch}`,
		`- branch: ${facts.branch}`,
	];
	if (facts.commitSha !== undefined) lines.push(`- commit: ${facts.commitSha}`);
	if (facts.stopReason !== undefined) {
		lines.push(`- child-reported reason: ${facts.stopReason}`);
	}
	if (facts.changedPaths !== undefined) {
		lines.push(`- changed paths (${facts.changedPaths.length}):`);
		for (const path of facts.changedPaths) lines.push(`  - ${path}`);
	}
	if (facts.gateChecks !== undefined) {
		lines.push("- gate checks:");
		for (const check of facts.gateChecks) lines.push(`  - ${formatGateCheck(check)}`);
	}
	if (facts.diagnostics !== undefined && facts.diagnostics.length > 0) {
		lines.push("- diagnostics:");
		for (const diagnostic of facts.diagnostics) {
			lines.push(...indentDiagnostic(diagnostic));
		}
	}

	lines.push(
		"",
		"## Child-reported narrative (unverified claims)",
		"",
		narrative === undefined || narrative === ""
			? "_No child report available; everything above is runner-attested._"
			: [
					"_Everything below is the child's own report, verbatim and unverified._",
					"",
					narrative,
				].join("\n"),
	);
	return lines.join("\n");
}

function formatGateCheck(check: GateCheckResult): string {
	const base = `${check.id}: ${check.status}`;
	return check.detail === undefined ? base : `${base} — ${check.detail}`;
}

function indentDiagnostic(diagnostic: string): string[] {
	const [first, ...rest] = diagnostic.split("\n");
	return [`  - ${first ?? ""}`, ...rest.map((line) => `    ${line}`)];
}
