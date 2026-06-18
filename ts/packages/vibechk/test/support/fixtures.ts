import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Metrics, RunBundle } from "../../src/models.ts";
import { encodeRunBundle } from "../../src/models.ts";

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

	const bundle: RunBundle = {
		schemaVersion: 1,
		runId: options.runId,
		status: options.status ?? "success",
		startedAt,
		finishedAt,
		runner: options.runner ?? "fake",
		runnerVersion: "fake-1",
		model: options.model === undefined ? null : options.model,
		planSource: "/tmp/plan.md",
		workdir: "/tmp/repo",
		git: {
			repoRoot: "/tmp/repo",
			startingBranch: "main",
			startingCommit: "abc123",
			remotes: {},
		},
		metrics: {
			wallTimeSeconds: options.metrics?.wallTimeSeconds ?? null,
			inputTokens: options.metrics?.inputTokens ?? null,
			outputTokens: options.metrics?.outputTokens ?? null,
			totalTokens: options.metrics?.totalTokens ?? null,
			costUsd: options.metrics?.costUsd ?? null,
		},
		resultBranch: options.resultBranch === undefined ? null : options.resultBranch,
		branchCreated: options.branchCreated ?? false,
		runnerExitCode: 0,
		error: null,
	};

	await writeFile(
		join(runDir, "bundle.json"),
		JSON.stringify(encodeRunBundle(bundle), null, 2) + "\n",
		"utf-8",
	);

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
