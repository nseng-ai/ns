import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Metrics } from "../../src/models.ts";

export interface BundleFixtureOptions {
	runId: string;
	status?: "success" | "failed";
	runner?: string;
	model?: string | null;
	metrics?: Partial<Metrics>;
	resultBranch?: string | null;
	branchCreated?: boolean;
	startedAt?: Date;
	planText?: string;
	transcript?: string;
	diffPatch?: string;
}

export async function writeTestBundle(
	storeRoot: string,
	options: BundleFixtureOptions,
): Promise<void> {
	const runDir = join(storeRoot, "runs", options.runId);
	await mkdir(runDir, { recursive: true });

	const startedAt = options.startedAt ?? new Date("2026-05-23T12:00:00Z");
	const finishedAt = new Date(startedAt.getTime() + 1000);

	const bundle: Record<string, unknown> = {
		schema_version: 1,
		run_id: options.runId,
		status: options.status ?? "success",
		started_at: startedAt.toISOString(),
		finished_at: finishedAt.toISOString(),
		runner: options.runner ?? "fake",
		runner_version: "fake-1",
		model: options.model === undefined ? null : options.model,
		plan_source: "/tmp/plan.md",
		workdir: "/tmp/repo",
		git: {
			repo_root: "/tmp/repo",
			starting_branch: "main",
			starting_commit: "abc123",
			remotes: {},
		},
		metrics: {
			wall_time_seconds: options.metrics?.wallTimeSeconds ?? null,
			input_tokens: options.metrics?.inputTokens ?? null,
			output_tokens: options.metrics?.outputTokens ?? null,
			total_tokens: options.metrics?.totalTokens ?? null,
			cost_usd: options.metrics?.costUsd ?? null,
		},
		result_branch: options.resultBranch === undefined ? null : options.resultBranch,
		branch_created: options.branchCreated ?? false,
		runner_exit_code: 0,
		error: null,
	};

	await writeFile(join(runDir, "bundle.json"), JSON.stringify(bundle, null, 2) + "\n", "utf-8");

	if (options.planText !== undefined) {
		await writeFile(join(runDir, "plan.md"), options.planText, "utf-8");
	}

	if (options.transcript !== undefined) {
		await writeFile(join(runDir, "transcript.txt"), options.transcript, "utf-8");
	}

	if (options.diffPatch !== undefined) {
		await writeFile(join(runDir, "diff.patch"), options.diffPatch, "utf-8");
	}
}
