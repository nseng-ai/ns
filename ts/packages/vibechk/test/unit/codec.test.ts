import { describe, expect, it } from "vitest";

import type { RunBundle } from "../../src/models.ts";
import { encodeRunBundle, parseRunBundle } from "../../src/models.ts";

const ROUND_TRIP_BUNDLES: RunBundle[] = [
	{
		schemaVersion: 1,
		runId: "aaaabbbb",
		status: "success",
		startedAt: new Date("2026-06-01T10:00:00.000Z"),
		finishedAt: new Date("2026-06-01T10:00:01.000Z"),
		runner: "fake-runner",
		runnerVersion: "fake-1",
		model: null,
		planSource: "/tmp/plan.md",
		workdir: "/tmp/workdir",
		git: {
			repoRoot: "/tmp/repo",
			startingBranch: "main",
			startingCommit: "abc123",
			remotes: {},
		},
		metrics: {
			wallTimeSeconds: null,
			inputTokens: null,
			outputTokens: null,
			totalTokens: null,
			costUsd: null,
		},
		resultBranch: null,
		branchCreated: false,
		runnerExitCode: 0,
		error: null,
	},
	{
		schemaVersion: 1,
		runId: "ccccdddd",
		status: "failed",
		startedAt: new Date("2026-06-02T11:12:13.456Z"),
		finishedAt: new Date("2026-06-02T11:13:14.456Z"),
		runner: "codex",
		runnerVersion: "2.3.4",
		model: "openai-codex/gpt-5.4-mini:medium",
		planSource: "/tmp/populated-plan.md",
		workdir: "/tmp/populated-workdir",
		git: {
			repoRoot: "/tmp/populated-repo",
			startingBranch: "feature/source",
			startingCommit: "def456",
			remotes: {
				origin: "git@example.com:org/repo.git",
				upstream: "https://example.com/org/repo.git",
			},
		},
		metrics: {
			wallTimeSeconds: 61.5,
			inputTokens: 1000,
			outputTokens: 250,
			totalTokens: 1250,
			costUsd: 0.42,
		},
		resultBranch: "vibechk/ccccdddd",
		branchCreated: true,
		runnerExitCode: 1,
		error: "runner failed",
	},
];

describe("run bundle codec", () => {
	it.each(ROUND_TRIP_BUNDLES)(
		"round trips encoded run bundle $runId through the parser",
		(bundle) => {
			expect(parseRunBundle(encodeRunBundle(bundle))).toEqual(bundle);
		},
	);
});
