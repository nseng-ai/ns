import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "../../src/stack-view/exec.ts";
import {
	objectiveSlugsForBranch,
	objectiveSlugsFromDiffOutput,
} from "../../src/stack-view/objectives.ts";

/** A single recorded call to the faked exec seam. */
interface RecordedCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

/** A canned `ExecResult`; success unless overridden. */
function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return { stdout: "", stderr: "", code: 0, killed: false, ...overrides };
}

/**
 * A minimal manual `CommandExecApi` fake: it runs no processes, records every
 * call, and returns the same canned result. No real git, no timers, no network.
 */
function fakeExecApi(result: ExecResult): { execApi: CommandExecApi; calls: RecordedCall[] } {
	const calls: RecordedCall[] = [];
	const execApi: CommandExecApi = {
		async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
			calls.push({ command, args: [...args], options });
			return result;
		},
	};
	return { execApi, calls };
}

/** Join path entries the way `git diff --name-only -z` does: NUL-separated. */
function nulJoin(paths: string[]): string {
	return paths.join("\0");
}

describe("objectiveSlugsFromDiffOutput", () => {
	test("maps `.ns/objectives/<slug>/…` paths to their slugs", () => {
		const stdout = nulJoin([".ns/objectives/alpha/roadmap.md", ".ns/objectives/beta/objective.md"]);
		expect(objectiveSlugsFromDiffOutput(stdout)).toEqual(["alpha", "beta"]);
	});

	test("dedupes multiple files under the same slug", () => {
		const stdout = nulJoin([
			".ns/objectives/alpha/a.md",
			".ns/objectives/alpha/b.md",
			".ns/objectives/alpha/nested/c.md",
		]);
		expect(objectiveSlugsFromDiffOutput(stdout)).toEqual(["alpha"]);
	});

	test("sorts multiple slugs by locale order regardless of input order", () => {
		const stdout = nulJoin([
			".ns/objectives/zeta/f.md",
			".ns/objectives/alpha/f.md",
			".ns/objectives/mid/f.md",
		]);
		expect(objectiveSlugsFromDiffOutput(stdout)).toEqual(["alpha", "mid", "zeta"]);
	});

	test("accepts arbitrarily deep child paths, attributing to the top slug", () => {
		expect(objectiveSlugsFromDiffOutput(".ns/objectives/slug/a/b/c.md")).toEqual(["slug"]);
	});

	test("returns an empty list for empty output", () => {
		expect(objectiveSlugsFromDiffOutput("")).toEqual([]);
	});

	describe("ignores paths not shaped like `.ns/objectives/<slug>/<child>`", () => {
		test("paths outside the objectives root", () => {
			const stdout = nulJoin([
				"ts/foo.ts",
				".ns/objectives-evil/x.md",
				"nested/.ns/objectives/slug/f.md",
			]);
			expect(objectiveSlugsFromDiffOutput(stdout)).toEqual([]);
		});

		test("the bare root with no trailing separator", () => {
			expect(objectiveSlugsFromDiffOutput(".ns/objectives")).toEqual([]);
		});

		test("a direct file child with no slug directory", () => {
			expect(objectiveSlugsFromDiffOutput(".ns/objectives/README.md")).toEqual([]);
		});

		test("an empty slug segment", () => {
			expect(objectiveSlugsFromDiffOutput(".ns/objectives//file.md")).toEqual([]);
		});

		test("`.` and `..` slugs", () => {
			const stdout = nulJoin([".ns/objectives/../escape.md", ".ns/objectives/./here.md"]);
			expect(objectiveSlugsFromDiffOutput(stdout)).toEqual([]);
		});

		test("a slug containing a backslash", () => {
			expect(objectiveSlugsFromDiffOutput(".ns/objectives/sl\\ug/f.md")).toEqual([]);
		});

		test("trailing NUL producing an empty final entry", () => {
			const stdout = `${nulJoin([".ns/objectives/alpha/f.md"])}\0`;
			expect(objectiveSlugsFromDiffOutput(stdout)).toEqual(["alpha"]);
		});
	});

	test("keeps only valid slugs from a mixed adversarial blob", () => {
		const stdout = nulJoin([
			"ts/foo.ts",
			".ns/objectives/beta/objective.md",
			".ns/objectives-evil/x.md",
			".ns/objectives/README.md",
			".ns/objectives//file.md",
			".ns/objectives/../escape.md",
			".ns/objectives/sl\\ug/f.md",
			".ns/objectives/alpha/deep/child.md",
			"",
		]);
		expect(objectiveSlugsFromDiffOutput(stdout)).toEqual(["alpha", "beta"]);
	});
});

describe("objectiveSlugsForBranch", () => {
	test("invokes git with the exact diff argv and cwd option", async () => {
		const { execApi, calls } = fakeExecApi(execResult());
		await objectiveSlugsForBranch({
			execApi,
			cwd: "/repo",
			lineage: { branch: "feature", parentBranch: "main" },
		});
		expect(calls).toHaveLength(1);
		expect(calls[0]?.command).toBe("git");
		expect(calls[0]?.args).toEqual([
			"diff",
			"--name-only",
			"-z",
			"main...feature",
			"--",
			".ns/objectives",
		]);
		expect(calls[0]?.options).toEqual({ cwd: "/repo" });
	});

	test("maps a successful diff through the parser into sorted unique slugs", async () => {
		const stdout = nulJoin([
			".ns/objectives/zeta/f.md",
			".ns/objectives/alpha/a.md",
			".ns/objectives/alpha/b.md",
		]);
		const { execApi } = fakeExecApi(execResult({ stdout }));
		const result = await objectiveSlugsForBranch({
			execApi,
			cwd: "/repo",
			lineage: { branch: "feature", parentBranch: "main" },
		});
		expect(result).toEqual({ type: "ok", slugs: ["alpha", "zeta"] });
	});

	test("yields an empty slug list when the diff touches no objectives", async () => {
		const { execApi } = fakeExecApi(execResult({ stdout: "" }));
		const result = await objectiveSlugsForBranch({
			execApi,
			cwd: "/repo",
			lineage: { branch: "feature", parentBranch: "main" },
		});
		expect(result).toEqual({ type: "ok", slugs: [] });
	});

	test("returns an exec-error carrying stderr when git fails", async () => {
		const { execApi } = fakeExecApi(execResult({ code: 128, stderr: "fatal: bad revision\n" }));
		const result = await objectiveSlugsForBranch({
			execApi,
			cwd: "/repo",
			lineage: { branch: "feature", parentBranch: "main" },
		});
		expect(result).toEqual({ type: "exec-error", message: "fatal: bad revision" });
	});

	test("reports the exit code when git fails without stderr", async () => {
		const { execApi } = fakeExecApi(execResult({ code: 1 }));
		const result = await objectiveSlugsForBranch({
			execApi,
			cwd: "/repo",
			lineage: { branch: "feature", parentBranch: "main" },
		});
		expect(result).toEqual({ type: "exec-error", message: "exit code 1" });
	});

	test("treats a killed process as an exec-error", async () => {
		const { execApi } = fakeExecApi(execResult({ code: 0, killed: true }));
		const result = await objectiveSlugsForBranch({
			execApi,
			cwd: "/repo",
			lineage: { branch: "feature", parentBranch: "main" },
		});
		expect(result).toEqual({ type: "exec-error", message: "exit code 0 (killed)" });
	});
});
