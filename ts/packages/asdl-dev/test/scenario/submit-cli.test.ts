import { describe, expect, test } from "vitest";

import { runCli } from "asdl-dev/src/cli.ts";
import type { PendingWorktreeSnapshot } from "asdl-dev/src/pending-worktree.ts";
import type { SubmitCommandOutput, SubmitOutputStream, SubmitPrLink } from "asdl-dev/src/submit.ts";
import { inMemoryContext, type InMemoryContextState } from "../support/in-memory-gateways.ts";

interface OutputEvent {
	stream: SubmitOutputStream;
	text: string;
}

interface ConfirmationPrompt {
	title: string;
	message: string;
}

interface RunWithFakesOptions {
	cwd?: string;
	captureOutput?: boolean;
	confirmResponses?: readonly boolean[];
}

function runWithFakes(args: readonly string[], state: InMemoryContextState = {}, options: RunWithFakesOptions = {}) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const outputEvents: OutputEvent[] = [];
	const confirmations: ConfirmationPrompt[] = [];
	const confirmResponses = [...(options.confirmResponses ?? [])];
	const fakes = inMemoryContext({
		...state,
		checkpoint: state.checkpoint ?? { snapshot: cleanPendingWorktreeSnapshot() },
	});
	return {
		...fakes,
		stdout,
		stderr,
		outputEvents,
		confirmations,
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
			...(options.captureOutput === true
				? {
						onOutput(stream: SubmitOutputStream, text: string) {
							outputEvents.push({ stream, text });
						},
					}
				: {}),
			...(options.confirmResponses === undefined
				? {}
				: {
						confirm(title: string, message: string): boolean {
							confirmations.push({ title, message });
							return confirmResponses.shift() ?? false;
						},
					}),
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

	test("streams Graphite stdout and stderr through the live output callback", async () => {
		const run = runWithFakes(
			["submit"],
			{
				submit: {
					preflight: { kind: "ready", output: output("dry-run ok\n") },
					submit: {
						kind: "success",
						output: output("Created https://github.com/acme/project/pull/456\n", "submit warning\n"),
						prLinks: [prLink(456)],
					},
					currentPr: {
						kind: "present",
						output: output("https://github.com/acme/project/pull/456\n"),
						prLinks: [prLink(456)],
					},
				},
			},
			{ captureOutput: true },
		);

		expect(await run.exit).toBe(0);
		expect(run.outputEvents).toEqual([
			{ stream: "stdout", text: "dry-run ok\n" },
			{ stream: "stdout", text: "Created https://github.com/acme/project/pull/456\n" },
			{ stream: "stderr", text: "submit warning\n" },
			{ stream: "stdout", text: "https://github.com/acme/project/pull/456\n" },
		]);
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

	test("restack-required dry-run stops before submit when no prompt is available", async () => {
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
		expect(run.confirmations).toEqual([]);
		expect(run.submit.restackCurrentStackCalls).toEqual([]);
		expect(run.submit.submitCurrentStackCalls).toEqual([]);
	});

	test("confirmed restack prompt runs restack before submitting", async () => {
		const link = prLink(125);
		const run = runWithFakes(
			["submit"],
			{
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
			},
			{ confirmResponses: [true] },
		);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("#125 https://github.com/acme/project/pull/125");
		expect(run.stderr.join("")).toBe("");
		expect(run.confirmations).toHaveLength(1);
		expect(run.confirmations[0]?.title).toBe("Run gt restack before submit?");
		expect(run.confirmations[0]?.message).toContain("gt restack --no-interactive");
		expect(run.confirmations[0]?.message).toContain("gt submit -nps --ai");
		expect(run.submit.operationCalls.map((call) => call.operation)).toEqual([
			"checkSubmitReadiness",
			"restackCurrentStack",
			"submitCurrentStack",
			"verifyCurrentPr",
		]);
	});

	test("declined restack prompt stops before restack and submit", async () => {
		const run = runWithFakes(
			["submit"],
			{
				submit: {
					preflight: {
						kind: "restack_required",
						output: output("", "Restack is required before submit.\n", 1),
					},
				},
			},
			{ confirmResponses: [false] },
		);

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Restack was not run.");
		expect(run.stderr.join("")).toContain("Submission was not attempted.");
		expect(run.stderr.join("")).toContain("$ gt submit -nps --ai --dry-run");
		expect(run.confirmations).toHaveLength(1);
		expect(run.submit.restackCurrentStackCalls).toEqual([]);
		expect(run.submit.submitCurrentStackCalls).toEqual([]);
	});

	test("--restack runs restack before submitting", async () => {
		const link = prLink(124);
		const run = runWithFakes(
			["submit", "--restack"],
			{
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
			},
			{ confirmResponses: [false] },
		);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("#124 https://github.com/acme/project/pull/124");
		expect(run.stderr.join("")).toBe("");
		expect(run.confirmations).toEqual([]);
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
