import { describe, expect, test } from "bun:test";

import { runCli } from "asdl-dev/src/cli.ts";
import type { PendingWorktreeSnapshot } from "asdl-dev/src/pending-worktree.ts";
import type { SubmitCommandOutput, SubmitPrLink } from "asdl-dev/src/submit.ts";
import { inMemoryContext, type InMemoryContextState } from "../support/in-memory-gateways.ts";

function runWithFakes(args: readonly string[], state: InMemoryContextState = {}, options: { cwd?: string } = {}) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const fakes = inMemoryContext({
		...state,
		checkpoint: state.checkpoint ?? { snapshot: cleanPendingWorktreeSnapshot() },
	});
	return {
		...fakes,
		stdout,
		stderr,
		exit: runCli(args, {
			context: fakes.context,
			cwd: options.cwd ?? "/work",
			env: {},
			stdout: (text) => {
				stdout.push(text);
			},
			stderr: (text) => {
				stderr.push(text);
			},
		}),
	};
}

function output(stdout = "", stderr = "", exitCode = 0): SubmitCommandOutput {
	return { stdout, stderr, exitCode };
}

function prLink(number: number): SubmitPrLink {
	return { label: `#${number}`, url: `https://github.com/acme/project/pull/${number}` };
}

function cleanPendingWorktreeSnapshot(): PendingWorktreeSnapshot {
	return {
		root: "/repo",
		branch: "feature/demo",
		status: "",
		diff: "",
		clean: true,
	};
}

function dirtyPendingWorktreeSnapshot(): PendingWorktreeSnapshot {
	return {
		root: "/repo",
		branch: "feature/demo",
		status: " M src/app.ts\n",
		diff: "diff --git a/src/app.ts b/src/app.ts\n",
		clean: false,
	};
}

describe("asdl-dev submit CLI behavior", () => {
	test("successful submit prints PR links and verifies the current PR", async () => {
		const run = runWithFakes(["submit"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("gt submit succeeded");
		expect(run.stdout.join("")).toContain("#123 https://github.com/acme/project/pull/123");
		expect(run.stderr.join("")).toBe("");
		expect(run.submit.checkSubmitReadinessCalls).toEqual([{ cwd: "/work" }]);
		expect(run.submit.restackCurrentStackCalls).toEqual([]);
		expect(run.submit.submitCurrentStackCalls).toEqual([{ cwd: "/work" }]);
		expect(run.submit.verifyCurrentPrCalls).toEqual([{ cwd: "/work" }]);
		expect(run.checkpoint.loadPendingWorktreeCalls).toEqual([{ cwd: "/work" }]);
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([]);
		expect(run.textGeneration.generateTextCalls).toEqual([]);
	});

	test("checkpoints outstanding worktree changes before Graphite submit", async () => {
		const message = `[cp] Checkpoint before submit

- Capture pending edits`;
		const run = runWithFakes(["submit"], {
			checkpoint: {
				snapshot: dirtyPendingWorktreeSnapshot(),
				commit: { summary: "def456 [cp] Checkpoint before submit" },
			},
			textGeneration: { results: [{ ok: true, text: message }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("").startsWith(`def456 [cp] Checkpoint before submit\n${message}\n`)).toBe(true);
		expect(run.stdout.join("")).toContain("gt submit succeeded");
		expect(run.stderr.join("")).toBe("");
		expect(run.checkpoint.loadPendingWorktreeCalls).toEqual([{ cwd: "/work" }]);
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([{ cwd: "/work", message }]);
		expect(run.textGeneration.generateTextCalls[0]?.prompt).toContain("## git status --porcelain\n\n M src/app.ts");
		expect(run.submit.checkSubmitReadinessCalls).toEqual([{ cwd: "/work" }]);
		expect(run.submit.submitCurrentStackCalls).toEqual([{ cwd: "/work" }]);
	});

	test("checkpoint failure stops before Graphite submit", async () => {
		const run = runWithFakes(["submit"], {
			checkpoint: {
				snapshot: dirtyPendingWorktreeSnapshot(),
				commit: { error: "commit failed" },
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Checkpoint before submit failed. Submission was not attempted.");
		expect(run.stderr.join("")).toContain("commit failed");
		expect(run.submit.checkSubmitReadinessCalls).toEqual([]);
		expect(run.submit.submitCurrentStackCalls).toEqual([]);
	});

	test("restack-required dry-run stops before submit without --restack", async () => {
		const run = runWithFakes(["submit"], {
			submit: {
				preflight: {
					kind: "restack_required",
					output: output("", "Restack is required before submit.\n", 1),
				},
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Graphite requires a restack before submission.");
		expect(run.stderr.join("")).toContain("--restack");
		expect(run.stderr.join("")).toContain("$ gt submit -nps --ai --dry-run");
		expect(run.submit.restackCurrentStackCalls).toEqual([]);
		expect(run.submit.submitCurrentStackCalls).toEqual([]);
	});

	test("--restack runs restack before submitting", async () => {
		const link = prLink(124);
		const run = runWithFakes(["submit", "--restack"], {
			submit: {
				preflight: {
					kind: "restack_required",
					output: output("", "Restack is required before submit.\n", 1),
				},
				restack: { kind: "success", output: output("restacked\n") },
				submit: {
					kind: "success",
					output: output(`${link.url}\n`),
					prLinks: [link],
				},
				currentPr: {
					kind: "present",
					output: output(`${link.url}\n`),
					prLinks: [link],
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("#124 https://github.com/acme/project/pull/124");
		expect(run.stderr.join("")).toBe("");
		expect(run.submit.restackCurrentStackCalls).toEqual([{ cwd: "/work" }]);
		expect(run.submit.submitCurrentStackCalls).toEqual([{ cwd: "/work" }]);
	});

	test("submit failure reports command output on stderr", async () => {
		const run = runWithFakes(["submit"], {
			submit: {
				submit: {
					kind: "failed",
					output: output("partial output\n", "submit failed\n", 1),
				},
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("gt submit -nps --ai failed with exit code 1");
		expect(run.stderr.join("")).toContain("partial output");
		expect(run.stderr.join("")).toContain("submit failed");
		expect(run.submit.verifyCurrentPrCalls).toEqual([]);
	});

	test("post-submit no-current-PR failure gives headless checkpoint guidance", async () => {
		const run = runWithFakes(["submit"], {
			submit: {
				currentPr: {
					kind: "no_current_pr",
					output: output("", "No PR found for current branch.\n", 1),
					cause: "no_current_pr",
				},
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("current branch still has no PR");
		expect(run.stderr.join("")).toContain("`asdl-dev submit` checkpoints outstanding worktree changes before submitting.");
	});

	test("post-submit empty-branch semantic failure reports formatter-owned guidance", async () => {
		const run = runWithFakes(["submit"], {
			submit: {
				submit: {
					kind: "success",
					output: output(
						"This branch does not introduce any changes:\nGraphite will not be submitted because GitHub does not allow empty PRs.\n",
					),
					prLinks: [],
					semanticFailureCause: "empty_branch_skipped",
				},
				currentPr: {
					kind: "present",
					output: output("https://github.com/acme/project/pull/123\n"),
					prLinks: [prLink(123)],
				},
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Graphite skipped submitting part of the stack because a branch is empty");
		expect(run.stderr.join("")).toContain("$ gt submit -nps --ai");
	});

	test("unsupported arguments fail before touching Graphite", async () => {
		const run = runWithFakes(["submit", "--bogus"]);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Unknown option: --bogus");
		expect(run.submit.checkSubmitReadinessCalls).toEqual([]);
	});
});
