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
	type LoadDiffOptions,
} from "../../src/gateways/local-diff.ts";
import { createLocalDiff, createRevisionRangeLocalDiff } from "../../src/core/models.ts";

const SAMPLE_DIFF =
	"diff --git a/src/app.ts b/src/app.ts\n" +
	"index 1111111..2222222 100644\n" +
	"--- a/src/app.ts\n" +
	"+++ b/src/app.ts\n" +
	"@@ -1 +1 @@\n" +
	"-old\n" +
	"+new\n";

describe("FakeLocalDiffGateway", () => {
	test("keeps base-ref compatibility while rejecting ambiguous selections at the type boundary", () => {
		const compatible: LoadDiffOptions = { cwd: "/repo", baseRef: "main" };
		expect(compatible.baseRef).toBe("main");

		const ambiguous: LoadDiffOptions = {
			cwd: "/repo",
			baseRef: "main",
			// @ts-expect-error A diff request must choose either baseRef compatibility or selection.
			selection: { type: "revision-range", revisionRange: "main..HEAD" },
		};
		expect(ambiguous.cwd).toBe("/repo");
	});

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
			'[reviews.diff]\nexclude = [".agents/skills/**/*.py"]\n',
			"utf8",
		);
		const execApi = new ScriptedCommandExecApi([exitedResult({ stdout: SAMPLE_DIFF })]);
		const gateway = new RealLocalDiffGateway({
			execApi,
			gitGateway: new InMemoryGitGateway({ repoRoot, trunkBranch: "trunk" }),
		});

		const result = await gateway.loadDiff({ cwd: repoRoot, baseRef: "main" });

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.baseRef).toBe("main");
			expect(result.value.changedPaths).toEqual(["src/app.ts"]);
		}
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

	test("passes an explicit revision range as one argv element with exclusions", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "reviews-local-range-diff-"));
		await mkdir(repoRoot, { recursive: true });
		const execApi = new ScriptedCommandExecApi([exitedResult({ stdout: SAMPLE_DIFF })]);
		const gateway = new RealLocalDiffGateway({
			execApi,
			gitGateway: new InMemoryGitGateway({ repoRoot, trunkBranch: "trunk" }),
		});

		const result = await gateway.loadDiff({
			cwd: repoRoot,
			selection: { type: "revision-range", revisionRange: "base^{commit}..topic" },
			excludeGlobs: ["vendor/**"],
		});

		expect(result.ok).toBe(true);
		if (result.ok)
			expect(result.value).toEqual(
				createRevisionRangeLocalDiff({
					revisionRange: "base^{commit}..topic",
					diffText: SAMPLE_DIFF,
					files: result.value.files,
				}),
			);
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
			"base^{commit}..topic",
			"--",
			".",
			":(exclude,glob)vendor/**",
		]);
	});

	test.each(["   ", " -c core.fsmonitor=true", "--stat"])(
		"rejects unsafe revision range %j before invoking git",
		async (revisionRange) => {
			const repoRoot = await mkdtemp(join(tmpdir(), "reviews-local-unsafe-range-"));
			const execApi = new ScriptedCommandExecApi([]);
			const gateway = new RealLocalDiffGateway({
				execApi,
				gitGateway: new InMemoryGitGateway({ repoRoot, trunkBranch: "trunk" }),
			});

			const result = await gateway.loadDiff({
				cwd: repoRoot,
				selection: { type: "revision-range", revisionRange },
			});

			expect(result).toMatchObject({ ok: false, error: { code: "git-diff-failed" } });
			expect(execApi.calls()).toEqual([]);
		},
	);

	test("falls back to trunk branch and reports git diff failures", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "reviews-local-diff-failure-"));
		await mkdir(repoRoot, { recursive: true });
		const execApi = new ScriptedCommandExecApi([
			exitedResult({ stderr: "fatal: bad revision", code: 128 }),
		]);
		const gateway = new RealLocalDiffGateway({
			execApi,
			gitGateway: new InMemoryGitGateway({ repoRoot, trunkBranch: "trunk" }),
		});

		const result = await gateway.loadDiff({ cwd: repoRoot });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("git-diff-failed");
			expect(result.error.message).toContain("git -c diff.noprefix=false");
			expect(result.error.message).toContain("origin/trunk...HEAD");
			expect(result.error.message).toContain(repoRoot);
			expect(result.error.message).toContain("fatal");
		}
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
			"origin/trunk...HEAD",
		]);
	});

	test("formats display commands for diagnostics", () => {
		expect(formatGitDiffDisplayCommand({ baseRef: "main", excludeGlobs: ["vendor/**/*.ts"] })).toBe(
			"git -c diff.noprefix=false -c diff.mnemonicPrefix=false -c diff.srcPrefix=a/ -c diff.dstPrefix=b/ diff --no-ext-diff origin/main...HEAD -- . ':(exclude,glob)vendor/**/*.ts'",
		);
	});
});
