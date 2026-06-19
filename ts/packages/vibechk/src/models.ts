import { z } from "zod";

export type RunStatus = "success" | "failed";

export interface Metrics {
	wallTimeSeconds: number | null;
	inputTokens: number | null;
	outputTokens: number | null;
	totalTokens: number | null;
	costUsd: number | null;
}

export interface GitProvenance {
	repoRoot: string;
	startingBranch: string;
	startingCommit: string;
	remotes: Record<string, string>;
}

export interface RunBundle {
	schemaVersion: number;
	runId: string;
	status: RunStatus;
	startedAt: Date;
	finishedAt: Date;
	runner: string;
	runnerVersion: string | null;
	model: string | null;
	planSource: string;
	workdir: string;
	git: GitProvenance;
	metrics: Metrics;
	resultBranch: string | null;
	branchCreated: boolean;
	runnerExitCode: number;
	error: string | null;
}

export interface LoadedBundle {
	bundle: RunBundle;
	runDir: string;
	planText: string;
	transcript: string;
	diffPatch: string;
}

// Zod schema for parsing bundle.json with snake_case keys
const metricsSchema = z.object({
	wall_time_seconds: z.number().nullable(),
	input_tokens: z.number().int().nullable(),
	output_tokens: z.number().int().nullable(),
	total_tokens: z.number().int().nullable(),
	cost_usd: z.number().nullable(),
});

const gitProvenanceSchema = z.object({
	repo_root: z.string(),
	starting_branch: z.string(),
	starting_commit: z.string(),
	remotes: z.record(z.string(), z.string()),
});

const runBundleSchema = z.object({
	schema_version: z.number().int(),
	run_id: z.string(),
	status: z.enum(["success", "failed"]),
	started_at: z.string(),
	finished_at: z.string(),
	runner: z.string(),
	runner_version: z.string().nullable(),
	model: z.string().nullable(),
	plan_source: z.string(),
	workdir: z.string(),
	git: gitProvenanceSchema,
	metrics: metricsSchema,
	result_branch: z.string().nullable(),
	branch_created: z.boolean(),
	runner_exit_code: z.number().int(),
	error: z.string().nullable(),
});

export function parseRunBundle(data: unknown): RunBundle {
	const parsed = runBundleSchema.parse(data);
	return {
		schemaVersion: parsed.schema_version,
		runId: parsed.run_id,
		status: parsed.status,
		startedAt: new Date(parsed.started_at),
		finishedAt: new Date(parsed.finished_at),
		runner: parsed.runner,
		runnerVersion: parsed.runner_version,
		model: parsed.model,
		planSource: parsed.plan_source,
		workdir: parsed.workdir,
		git: {
			repoRoot: parsed.git.repo_root,
			startingBranch: parsed.git.starting_branch,
			startingCommit: parsed.git.starting_commit,
			remotes: parsed.git.remotes as Record<string, string>,
		},
		metrics: {
			wallTimeSeconds: parsed.metrics.wall_time_seconds,
			inputTokens: parsed.metrics.input_tokens,
			outputTokens: parsed.metrics.output_tokens,
			totalTokens: parsed.metrics.total_tokens,
			costUsd: parsed.metrics.cost_usd,
		},
		resultBranch: parsed.result_branch,
		branchCreated: parsed.branch_created,
		runnerExitCode: parsed.runner_exit_code,
		error: parsed.error,
	};
}
