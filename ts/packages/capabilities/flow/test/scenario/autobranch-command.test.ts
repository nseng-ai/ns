import { afterEach, describe, expect, test, vi } from "vitest";
import { stripAnsi } from "@ns/clinkr/testing";

import {
	autobranchGtCreateFailExec,
	runFlowAutobranchCommandWithFakes,
} from "./flow-command-fakes.ts";
import { formattedExecCalls, type ScriptedExecResponse } from "./ns-cli-fakes.ts";

afterEach(() => {
	vi.useRealTimers();
});

describe("flow autobranch command outcomes", () => {
	test("dirty worktree success exits 0 on stdout with a house-style result block", async () => {
		vi.setSystemTime(new Date(123456789));
		const run = runFlowAutobranchCommandWithFakes();

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		const stdout = stripAnsi(run.stdout.join(""));
		expect(stdout).toContain("Created a Graphite branch from dirty worktree changes.");
		expect(stdout).toContain("New branch: move-work");
		expect(stdout).toContain("Stacked on: feature/source");
		expect(stdout).toContain("Commit: abc1234 [cp] Move pending work");
		expect(stdout).toContain("Working directory is clean.");
		expect(stdout).toContain("Cwd: /work");
		// Success stays concise: no subprocess transcript plumbing.
		expect(stdout).not.toContain("Exit:");
		expect(stdout).not.toContain("Killed:");
		expect(stdout).not.toContain("stdout:");
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
			"git check-ref-format --branch move-work",
			"git show-ref --verify --quiet refs/heads/move-work",
			"git for-each-ref --format=%(refname) refs/heads/move-work/",
			expect.stringMatching(/^git stash push --include-untracked -m pi-autobranch:\d+:move-work$/),
			"git stash list --format=%gd%x00%s",
			"gt create move-work --no-interactive --no-ai",
			"git stash pop stash@{0}",
			"git add -A",
			expect.stringMatching(/^git commit -F /),
			"git log -1 --oneline",
			"git status --porcelain=v1",
		]);
		expect(run.context.execCalls.some((call) => call.command === "pi")).toBe(false);
		expect(run.context.textGeneratorCalls).toHaveLength(1);
		expect(run.context.textGeneratorCalls[0]).toMatchObject({
			operation: "checkpoint-message",
			modelRef: "openai-codex/gpt-5.4-mini",
		});
	});

	test("clean worktree refuses with a warn block on stderr and does not run the flow", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
			{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/source\n" } },
			{ match: "git status --porcelain=v1", result: { stdout: "" } },
			{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
		];
		const run = runFlowAutobranchCommandWithFakes({ state: { exec, textGeneration: [] } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("`ns flow autobranch` requires pending worktree changes");
		expect(stderr).toContain("Working tree is clean.");
		expect(stderr).toContain("Use `ns flow branch-latest-commit`");
		expect(stderr).toContain("Cwd: /work");
		// The dirty autobranch transaction never started.
		const calls = formattedExecCalls(run.context);
		expect(calls.some((call) => call.startsWith("gt create"))).toBe(false);
		expect(run.context.execCalls.some((call) => call.args.includes("stash"))).toBe(false);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("invalid slug preparation failure exits 1 on stderr with a failure block", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
			{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/source\n" } },
			{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
			{ match: "git diff HEAD --no-ext-diff", result: { stdout: "diff --git a/x b/x\n" } },
		];
		const run = runFlowAutobranchCommandWithFakes({
			request: { slug: "---" },
			state: { exec, textGeneration: [] },
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Could not create a Graphite branch from dirty worktree changes.");
		expect(stderr).toContain("Invalid branch slug: ---");
		expect(stderr).toContain("Cwd: /work");
		// Slug validation precedes Graphite, stash, and model calls.
		const calls = formattedExecCalls(run.context);
		expect(calls.some((call) => call.startsWith("gt create"))).toBe(false);
		expect(run.context.execCalls.some((call) => call.args.includes("stash"))).toBe(false);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("snapshot load failure exits 1 on stderr with a failure block", async () => {
		const exec: ScriptedExecResponse[] = [
			{
				match: "git rev-parse --show-toplevel",
				result: { code: 128, stderr: "fatal: not a git repository\n" },
			},
		];
		const run = runFlowAutobranchCommandWithFakes({ state: { exec, textGeneration: [] } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Not inside a git repository.");
		expect(stderr).toContain("Command: git rev-parse --show-toplevel");
		// The git failure transcript promotes the salient cause line.
		expect(stderr).toContain("fatal: not a git repository");
	});

	test("Graphite create failure exits 1 on stderr and surfaces recovery guidance", async () => {
		vi.setSystemTime(new Date(123456789));
		const run = runFlowAutobranchCommandWithFakes({
			state: {
				exec: autobranchGtCreateFailExec(),
				textGeneration: [
					{ ok: true, text: "[cp] Move pending work\n\n- Preserve current changes" },
				],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Could not create a Graphite branch from dirty worktree changes.");
		expect(stderr).toContain("Failed to create Graphite branch move-work.");
		expect(stderr).toContain("fatal: cannot lock ref");
		expect(stderr).toContain("Restored pending changes to the original branch.");
		expect(stderr).toContain("Cwd: /work");
		expect(formattedExecCalls(run.context)).toContain("git stash pop stash@{0}");
	});
});
