import { describe, expect, test } from "vitest";

import { runFlowChangesCommandWithFakes } from "./flow-command-fakes.ts";
import { formattedExecCalls, type ScriptedExecResponse } from "./ns-cli-fakes.ts";

function runChangesWithFakes(options: Parameters<typeof runFlowChangesCommandWithFakes>[0] = {}) {
	return runFlowChangesCommandWithFakes(options);
}

function cleanSnapshotResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
	];
}

describe("project-local changes extension behavior", () => {
	test("clean worktree reports no outstanding changes without model generation", async () => {
		const run = runChangesWithFakes({ state: { exec: cleanSnapshotResponses() } });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("Working tree is clean; no outstanding changes.\n");
		expect(run.stderr.join("")).toBe("");
		expect(run.liveOutput).toEqual([{ stream: "stderr", text: "Inspecting worktree…\n" }]);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("dirty worktree prints model bullets and raw status without mutation", async () => {
		const run = runChangesWithFakes({
			state: {
				textGeneration: [{ ok: true, text: "- Update app behavior\n- Add reviewer notes" }],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Outstanding changes on feature/demo");
		expect(output).toContain("Summary\n• Update app behavior");
		expect(output).toContain("• Add reviewer notes");
		expect(output).toContain("Files\n• modified   src/app.ts\n• untracked  notes.md");
		expect(run.stderr.join("")).toBe("");
		expect(run.liveOutput).toContainEqual({ stream: "stderr", text: "Inspecting worktree…\n" });
		expect(run.liveOutput).toContainEqual({
			stream: "stderr",
			text: "Generating changes summary…\n",
		});
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
		expect(
			formattedExecCalls(run.context).some((call) => /git (add|commit|stash)|^gt |^gh /.test(call)),
		).toBe(false);
		expect(run.context.textGeneratorCalls).toEqual([
			expect.objectContaining({
				modelRef: "openai-codex/gpt-5.6-luna",
				operation: "changes-summary",
				maxTokens: 512,
				reasoning: "low",
			}),
		]);
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain("## branch\n\nfeature/demo");
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain("M src/app.ts\n?? notes.md");
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain(
			"diff --git a/src/app.ts b/src/app.ts",
		);
	});

	test("dirty worktree labels common git porcelain status codes", async () => {
		const run = runChangesWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{
						match: "git status --porcelain=v1",
						result: {
							stdout: [
								"UU conflict.txt",
								"R  old.ts -> new.ts",
								"C  template.ts -> copy.ts",
								"A  added.ts",
								"AM staged-and-modified.ts",
								" D removed.ts",
								"M  staged.ts",
								"!! ignored.log",
							].join("\n"),
						},
					},
					{ match: "git diff HEAD --no-ext-diff", result: { stdout: "diff" } },
				],
				textGeneration: [{ ok: true, text: "- Summarize status labels" }],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("• unmerged   conflict.txt");
		expect(output).toContain("• renamed    old.ts -> new.ts");
		expect(output).toContain("• copied     template.ts -> copy.ts");
		expect(output).toContain("• added      added.ts");
		expect(output).toContain("• added      staged-and-modified.ts");
		expect(output).toContain("• deleted    removed.ts");
		expect(output).toContain("• modified   staged.ts");
		expect(output).toContain("• !!         ignored.log");
	});

	test("changes generation receives the resolved model reference explicitly", async () => {
		const run = runChangesWithFakes();

		expect(await run.exit).toBe(0);
		expect(run.context.textGeneratorCalls[0]?.modelRef).toBe("openai-codex/gpt-5.6-luna");
	});

	test("model generation and validation failures exit 2 without mutation", async () => {
		const invalid = runChangesWithFakes({
			state: { textGeneration: [{ ok: true, text: "Summary\n- bullet" }] },
		});
		expect(await invalid.exit).toBe(2);
		expect(invalid.stdout.join("")).toBe("");
		expect(invalid.stderr.join("")).toContain("Model returned an invalid changes summary");
		expect(formattedExecCalls(invalid.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);

		const failed = runChangesWithFakes({
			state: { textGeneration: [{ ok: false, error: "auth failed" }] },
		});
		expect(await failed.exit).toBe(2);
		expect(failed.stderr.join("")).toBe("error: auth failed\n");
		expect(
			formattedExecCalls(failed.context).some((call) =>
				/git (add|commit|stash)|^gt |^gh /.test(call),
			),
		).toBe(false);
	});

	test("git errors fail with command details", async () => {
		const notGit = runChangesWithFakes({
			state: {
				exec: [
					{
						match: "git rev-parse --show-toplevel",
						result: { code: 128, stderr: "fatal: not a git repository" },
					},
				],
			},
		});
		expect(await notGit.exit).toBe(2);
		expect(notGit.stderr.join("")).toBe(
			"error: Not inside a git repository.\nexit code 128: fatal: not a git repository\n",
		);
		expect(notGit.context.textGeneratorCalls).toEqual([]);

		const statusFailed = runChangesWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { code: 1, stderr: "index locked" } },
				],
			},
		});
		expect(await statusFailed.exit).toBe(2);
		expect(statusFailed.stderr.join("")).toBe(
			"error: Could not inspect git status.\nexit code 1: index locked\n",
		);
		expect(statusFailed.context.textGeneratorCalls).toEqual([]);
	});

	test("raw status output is capped at 50 file lines", async () => {
		const status = Array.from({ length: 52 }, (_value, index) => ` M file-${index}.ts`).join("\n");
		const run = runChangesWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: status } },
					{ match: "git diff HEAD --no-ext-diff", result: { stdout: "diff" } },
				],
				textGeneration: [{ ok: true, text: "- Update many files" }],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain(
			"Outstanding changes on feature/demo\n\nSummary\n• Update many files\n\nFiles",
		);
		expect(output).toContain("• modified   file-49.ts");
		expect(output).not.toContain("file-50.ts");
		expect(output).toContain("… 2 more file(s)");
	});
});
