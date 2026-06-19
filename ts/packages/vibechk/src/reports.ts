import type { RenderCapabilities } from "@asdl/clinkr";
import { renderTextTable, type TextTableColumn } from "@asdl/core/text-table";

import type { LoadedBundle } from "./models.ts";
import { encodeMetrics } from "./models.ts";

type MetricRow = [string, keyof LoadedBundle["bundle"]["metrics"]];

const METRIC_ROWS: MetricRow[] = [
	["Wall time seconds", "wallTimeSeconds"],
	["Input tokens", "inputTokens"],
	["Output tokens", "outputTokens"],
	["Total tokens", "totalTokens"],
	["Cost USD", "costUsd"],
];

const RUNS_TABLE_COLUMNS = [
	{ header: "RUN ID" },
	{ header: "STARTED AT" },
	{ header: "STATUS" },
	{ header: "RUNNER" },
	{ header: "MODEL" },
	{ header: "BRANCH" },
	{ header: "WORKDIR" },
] satisfies readonly TextTableColumn[];

export function renderRunReport(loaded: LoadedBundle): string {
	const bundle = loaded.bundle;
	const resultBranch = bundle.resultBranch ?? "null";
	const diffPatch = diffBody(loaded.diffPatch);
	const transcript = transcriptBody(loaded.transcript);

	const lines = [
		`# Vibechk Run \`${bundle.runId}\``,
		"",
		"## Summary",
		"",
		`- Status: ${bundle.status}`,
		`- Runner: ${bundle.runner}`,
		`- Model: ${formatValue(bundle.model)}`,
		`- Workdir: ${bundle.workdir}`,
		`- Started: ${bundle.startedAt.toISOString()}`,
		`- Finished: ${bundle.finishedAt.toISOString()}`,
		`- Starting branch: ${bundle.git.startingBranch}`,
		`- Starting commit: ${bundle.git.startingCommit}`,
		`- Result branch: ${resultBranch}`,
		"",
		"## Metrics",
		"",
		"| Metric | Value |",
		"| --- | --- |",
	];

	for (const [label, fieldName] of METRIC_ROWS) {
		lines.push(`| ${label} | ${formatValue(bundle.metrics[fieldName])} |`);
	}

	lines.push(
		"",
		"<details>",
		"<summary>Plan</summary>",
		"",
		"```markdown",
		loaded.planText,
		"```",
		"",
		"</details>",
		"",
		"<details>",
		"<summary>Transcript</summary>",
		"",
		"```text",
		transcript,
		"```",
		"",
		"</details>",
		"",
		"## Diff",
		"",
		"```diff",
		diffPatch,
		"```",
		"",
	);

	return lines.join("\n");
}

export function renderRunsTable(
	loadedBundles: LoadedBundle[],
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	return renderTextTable({
		columns: RUNS_TABLE_COLUMNS,
		rows: loadedBundles.map((loaded) => runsTableRow(loaded)),
		canEmitAnsi: caps.canEmitAnsi,
	});
}

export function runListEntryToJson(loaded: LoadedBundle): Record<string, unknown> {
	const bundle = loaded.bundle;
	return {
		run_id: bundle.runId,
		started_at: bundle.startedAt.toISOString(),
		finished_at: bundle.finishedAt.toISOString(),
		status: bundle.status,
		runner: bundle.runner,
		runner_version: bundle.runnerVersion,
		model: bundle.model,
		workdir: bundle.workdir,
		starting_branch: bundle.git.startingBranch,
		starting_commit: bundle.git.startingCommit,
		result_branch: bundle.resultBranch,
		branch_created: bundle.branchCreated,
		runner_exit_code: bundle.runnerExitCode,
		metrics: encodeMetrics(bundle.metrics),
		run_dir: loaded.runDir,
	};
}

export function renderComparisonReport(baseline: LoadedBundle, treatment: LoadedBundle): string {
	const baselineBundle = baseline.bundle;
	const treatmentBundle = treatment.bundle;

	const lines = [
		"# Vibechk Comparison",
		"",
		`Baseline: \`${baselineBundle.runId}\`  `,
		`Treatment: \`${treatmentBundle.runId}\``,
		"",
		"## Biggest Metric Deltas",
		"",
		deltaBullet(
			"Wall time seconds",
			baselineBundle.metrics.wallTimeSeconds,
			treatmentBundle.metrics.wallTimeSeconds,
		),
		deltaBullet(
			"Total tokens",
			baselineBundle.metrics.totalTokens,
			treatmentBundle.metrics.totalTokens,
		),
		deltaBullet(
			"Input tokens",
			baselineBundle.metrics.inputTokens,
			treatmentBundle.metrics.inputTokens,
		),
		deltaBullet(
			"Output tokens",
			baselineBundle.metrics.outputTokens,
			treatmentBundle.metrics.outputTokens,
		),
		deltaBullet("Cost USD", baselineBundle.metrics.costUsd, treatmentBundle.metrics.costUsd),
		"",
		"## Configuration",
		"",
		"| Field | Baseline | Treatment |",
		"| --- | --- | --- |",
		configRow("Runner", baselineBundle.runner, treatmentBundle.runner),
		configRow("Runner version", baselineBundle.runnerVersion, treatmentBundle.runnerVersion),
		configRow("Model", baselineBundle.model, treatmentBundle.model),
		configRow(
			"Starting branch",
			baselineBundle.git.startingBranch,
			treatmentBundle.git.startingBranch,
		),
		configRow(
			"Starting commit",
			baselineBundle.git.startingCommit,
			treatmentBundle.git.startingCommit,
		),
		configRow("Result branch", baselineBundle.resultBranch, treatmentBundle.resultBranch),
		"",
		"## Metrics",
		"",
		"| Metric | Baseline | Treatment | Delta |",
		"| --- | --- | --- | --- |",
	];

	for (const [label, fieldName] of METRIC_ROWS) {
		const baselineValue = baselineBundle.metrics[fieldName];
		const treatmentValue = treatmentBundle.metrics[fieldName];
		lines.push(
			`| ${label} | ${formatValue(baselineValue)} | ${formatValue(treatmentValue)} | ${formatDelta(baselineValue, treatmentValue)} |`,
		);
	}

	lines.push("");
	lines.push(...renderPlanComparison(baseline.planText, treatment.planText));
	lines.push(
		"",
		"## Baseline Diff",
		"",
		"```diff",
		diffBody(baseline.diffPatch),
		"```",
		"",
		"## Treatment Diff",
		"",
		"```diff",
		diffBody(treatment.diffPatch),
		"```",
		"",
	);

	return lines.join("\n");
}

function deltaBullet(label: string, baseline: number | null, treatment: number | null): string {
	if (baseline === null || treatment === null) {
		return `- ${label}: ${formatValue(baseline)} -> ${formatValue(treatment)} (n/a)`;
	}
	const delta = treatment - baseline;
	const sign = delta >= 0 ? "+" : "";
	return `- ${label}: ${baseline} -> ${treatment} (${sign}${delta})`;
}

function formatDelta(baseline: number | null, treatment: number | null): string {
	if (baseline === null || treatment === null) {
		return "n/a";
	}
	const delta = treatment - baseline;
	const sign = delta >= 0 ? "+" : "";
	return `${sign}${delta}`;
}

function configRow(label: string, baseline: string | null, treatment: string | null): string {
	return `| ${label} | ${formatValue(baseline)} | ${formatValue(treatment)} |`;
}

function renderPlanComparison(baselinePlan: string, treatmentPlan: string): string[] {
	if (baselinePlan === treatmentPlan) {
		return [
			"<details>",
			"<summary>Plan</summary>",
			"",
			"```markdown",
			baselinePlan,
			"```",
			"",
			"</details>",
		];
	}
	return [
		"> Warning: baseline and treatment plans differ.",
		"",
		"<details>",
		"<summary>Baseline Plan</summary>",
		"",
		"```markdown",
		baselinePlan,
		"```",
		"",
		"</details>",
		"",
		"<details>",
		"<summary>Treatment Plan</summary>",
		"",
		"```markdown",
		treatmentPlan,
		"```",
		"",
		"</details>",
	];
}

function formatValue(value: string | number | null): string {
	return value === null ? "null" : String(value);
}

function runsTableRow(loaded: LoadedBundle): string[] {
	const bundle = loaded.bundle;
	return [
		bundle.runId,
		bundle.startedAt.toISOString(),
		bundle.status,
		bundle.runner,
		formatValue(bundle.model) === "null" ? "-" : formatValue(bundle.model),
		bundle.resultBranch ?? "-",
		bundle.workdir,
	];
}

function transcriptBody(transcript: string): string {
	return transcript === "" ? "_No transcript captured._" : transcript;
}

function diffBody(diffPatch: string): string {
	return diffPatch === "" ? "_No workdir changes._" : diffPatch;
}
