import {
	objectiveRunnerCumulativeSummaryV1Schema,
	type ObjectiveRunnerCumulativeSummaryV1,
} from "./contracts.ts";

/** Renders the complete Objective-owned managed-section content deterministically. */
export function renderObjectiveRunnerCumulativeSummary(
	value: ObjectiveRunnerCumulativeSummaryV1,
): string {
	const summary = objectiveRunnerCumulativeSummaryV1Schema.parse(value);
	const lines = [
		"## Objective Runner",
		"",
		`- Objective: \`${summary.objectiveSlug}\``,
		`- Published head: \`${summary.publishedHead}\``,
		"",
		"### Published steps",
	];

	for (const [index, step] of summary.steps.entries()) {
		lines.push("", `${index + 1}. Runner commit \`${step.runnerCommitSha}\``);
		lines.push("   - Validation:");
		for (const outcome of step.validation) {
			const detail = outcome.detail === undefined ? "" : ` — ${inline(outcome.detail)}`;
			lines.push(`     - ${inline(outcome.command)}: **${outcome.result}**${detail}`);
		}
		lines.push("   - Parent decisions:");
		if (step.decisions.length === 0) {
			lines.push("     - none");
		} else {
			for (const decision of step.decisions) lines.push(`     - ${inline(decision)}`);
		}
	}

	lines.push("", "### Objective tracking commits");
	if (summary.objectiveTrackingCommits.length === 0) {
		lines.push("", "- none");
	} else {
		lines.push("");
		for (const commit of summary.objectiveTrackingCommits) {
			lines.push(`- \`${commit.sha}\` — ${inline(commit.subject)}`);
		}
	}
	return `${lines.join("\n")}\n`;
}

function inline(value: string): string {
	return value
		.replace(/\s+/g, " ")
		.trim()
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("`", "&#96;");
}
