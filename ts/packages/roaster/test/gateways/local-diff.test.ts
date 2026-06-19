import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@asdl/core/git/testing";
import { ScriptedCommandExecApi } from "@asdl/core/testing";

import {
	FakeLocalDiffGateway,
	formatGitDiffDisplayCommand,
	RealLocalDiffGateway,
} from "../../src/gateways/local-diff.ts";
import { createLocalDiff } from "../../src/models.ts";

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
		const gateway = new FakeLocalDiffGateway({ defaultDiff: { type: "ok", value: diff } });

		const result = await gateway.loadDiff({ cwd: "/repo", baseRef: "main" });

		expect(result.type).toBe("ok");
		if (result.type === "ok") expect(result.value).toEqual(diff);
		expect(gateway.requestedBaseRefs()).toEqual(["main"]);
	});
});

describe("RealLocalDiffGateway", () => {
	test("uses explicit base ref, config excludes, and parses changed paths", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "roaster-local-diff-"));
		await mkdir(repoRoot, { recursive: true });
		await writeFile(
			join(repoRoot, "asdl.toml"),
			'[roaster.diff]\nexclude = [".agents/skills/**/*.py"]\n',
			"utf8",
		);
		const execApi = new ScriptedCommandExecApi([{ stdout: SAMPLE_DIFF }]);
		const gateway = new RealLocalDiffGateway({
			execApi,
			gitGateway: new InMemoryGitGateway({ repoRoot, trunkBranch: "trunk" }),
		});

		const result = await gateway.loadDiff({ cwd: repoRoot, baseRef: "main" });

		expect(result.type).toBe("ok");
		if (result.type === "ok") {
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

	test("falls back to trunk branch and reports git diff failures", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "roaster-local-diff-failure-"));
		await mkdir(repoRoot, { recursive: true });
		const execApi = new ScriptedCommandExecApi([{ stderr: "fatal: bad revision", code: 128 }]);
		const gateway = new RealLocalDiffGateway({
			execApi,
			gitGateway: new InMemoryGitGateway({ repoRoot, trunkBranch: "trunk" }),
		});

		const result = await gateway.loadDiff({ cwd: repoRoot });

		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.error.type).toBe("git_diff_failed");
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
