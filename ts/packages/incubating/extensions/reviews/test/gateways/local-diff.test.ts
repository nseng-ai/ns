import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { exitedResult, ScriptedCommandExecApi } from "@nseng-ai/foundation/exec/testing";

import {
	FakeLocalDiffGateway,
	formatGitDiffDisplayCommand,
	RealLocalDiffGateway,
} from "../../src/gateways/local-diff.ts";
import { createLocalDiff } from "../../src/core/models.ts";

const SAMPLE_DIFF =
	"diff --git a/src/app.ts b/src/app.ts\n" +
	"index 1111111..2222222 100644\n" +
	"--- a/src/app.ts\n" +
	"+++ b/src/app.ts\n" +
	"@@ -1 +1 @@\n" +
	"-old\n" +
	"+new\n";

describe("FakeLocalDiffGateway", () => {
	test("returns copied configured diffs and records requested base refs", async () => {
		const diff = createLocalDiff({ baseRef: "main", diffText: SAMPLE_DIFF, files: [] });
		const gateway = new FakeLocalDiffGateway({ defaultDiff: { ok: true, value: diff } });

		const result = await gateway.loadDiff({ cwd: "/repo", baseRef: "main" });

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toEqual(diff);
		expect(gateway.requestedBaseRefs()).toEqual(["main"]);
	});
});

describe("RealLocalDiffGateway", () => {
	test("uses explicit base ref, config excludes, and parses changed paths", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "reviews-local-diff-"));
		await mkdir(repoRoot, { recursive: true });
		await writeFile(
			join(repoRoot, "ns.toml"),
			'[reviews.diff]\nexclude = [".agents/skills/**/*.py"]\n[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
			"utf8",
		);
		const execApi = new ScriptedCommandExecApi([exitedResult({ stdout: SAMPLE_DIFF })]);
		const gitGateway = new InMemoryGitGateway({ repoRoot });
		const gateway = new RealLocalDiffGateway({
			execApi,
			gitGateway,
			repositoryTrunkResolver: async () => {
				throw new Error("explicit base refs must bypass trunk resolution");
			},
		});

		const result = await gateway.loadDiff({ cwd: repoRoot, baseRef: "main" });

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.baseRef).toBe("main");
			expect(result.value.changedPaths).toEqual(["src/app.ts"]);
		}
		expect(gitGateway.exactRefPresenceCalls).toEqual([]);
		expect(execApi.calls()[0]).toMatchObject({
			command: "git",
			args: [
				"-c",
				"diff.noprefix=false",
				"-c",
				"diff.mnemonicPrefix=false",
				"-c",
				"diff.srcPrefix=a/",
				"-c",
				"diff.dstPrefix=b/",
				"diff",
				"--no-ext-diff",
				"origin/main...HEAD",
				"--",
				".",
				":(exclude,glob).agents/skills/**/*.py",
			],
		});
	});

	test("falls back to trunk branch and reports git diff failures", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "reviews-local-diff-failure-"));
		await mkdir(repoRoot, { recursive: true });
		const execApi = new ScriptedCommandExecApi([
			exitedResult({ stderr: "fatal: bad revision", code: 128 }),
		]);
		const gitGateway = new InMemoryGitGateway({
			repoRoot,
			existingRefs: ["refs/remotes/upstream/trunk"],
		});
		const gateway = new RealLocalDiffGateway({
			execApi,
			gitGateway,
			repositoryTrunkResolver: async () => ({
				ok: true,
				value: {
					branch: "trunk",
					remote: "upstream",
					localRef: "refs/heads/trunk",
					remoteTrackingRef: "refs/remotes/upstream/trunk",
					source: "cached-remote-head",
				},
			}),
		});

		const result = await gateway.loadDiff({ cwd: repoRoot });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("git-diff-failed");
			expect(result.error.message).toContain("git -c diff.noprefix=false");
			expect(result.error.message).toContain("refs/remotes/upstream/trunk...HEAD");
			expect(result.error.message).toContain(repoRoot);
			expect(result.error.message).toContain("fatal");
		}
		expect(gitGateway.exactRefPresenceCalls).toEqual([
			{ cwd: repoRoot, ref: "refs/remotes/upstream/trunk" },
		]);
		expect(execApi.calls()[0]?.args).toEqual([
			"-c",
			"diff.noprefix=false",
			"-c",
			"diff.mnemonicPrefix=false",
			"-c",
			"diff.srcPrefix=a/",
			"-c",
			"diff.dstPrefix=b/",
			"diff",
			"--no-ext-diff",
			"refs/remotes/upstream/trunk...HEAD",
		]);
	});

	test("reports actionable trunk resolution failure when no explicit base is given", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "reviews-local-diff-no-trunk-"));
		const gateway = new RealLocalDiffGateway({
			execApi: new ScriptedCommandExecApi([]),
			gitGateway: new InMemoryGitGateway({ repoRoot }),
			repositoryTrunkResolver: async () => ({
				ok: false,
				error: {
					code: "cached-remote-head-missing",
					message: "Cached remote HEAD is missing. Fetch remote `upstream`.",
				},
			}),
		});

		const result = await gateway.loadDiff({ cwd: repoRoot });

		expect(result).toMatchObject({
			ok: false,
			error: { code: "base-ref-unavailable" },
		});
		if (!result.ok) {
			expect(result.error.message).toContain("Cached remote HEAD is missing");
			expect(result.error.message).toContain("Fetch remote `upstream`");
			expect(result.error.message).toContain("--base-ref");
		}
	});

	test("maps missing implicit remote-tracking readiness to base-ref guidance", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "reviews-local-diff-no-tracking-"));
		const gitGateway = new InMemoryGitGateway({ repoRoot });
		const gateway = new RealLocalDiffGateway({
			execApi: new ScriptedCommandExecApi([]),
			gitGateway,
			repositoryTrunkResolver: async () => ({
				ok: true,
				value: {
					branch: "trunk",
					remote: "upstream",
					localRef: "refs/heads/trunk",
					remoteTrackingRef: "refs/remotes/upstream/trunk",
					source: "configured",
				},
			}),
		});

		const result = await gateway.loadDiff({ cwd: repoRoot });

		expect(result).toMatchObject({
			ok: false,
			error: { code: "base-ref-unavailable" },
		});
		if (!result.ok) {
			expect(result.error.message).toContain("refs/remotes/upstream/trunk");
			expect(result.error.message).toContain("Fetch remote `upstream`");
			expect(result.error.message).toContain("--base-ref");
		}
		expect(gitGateway.exactRefPresenceCalls).toEqual([
			{ cwd: repoRoot, ref: "refs/remotes/upstream/trunk" },
		]);
	});

	test("formats display commands for diagnostics", () => {
		expect(formatGitDiffDisplayCommand({ baseRef: "main", excludeGlobs: ["vendor/**/*.ts"] })).toBe(
			"git -c diff.noprefix=false -c diff.mnemonicPrefix=false -c diff.srcPrefix=a/ -c diff.dstPrefix=b/ diff --no-ext-diff origin/main...HEAD -- . ':(exclude,glob)vendor/**/*.ts'",
		);
	});
});
