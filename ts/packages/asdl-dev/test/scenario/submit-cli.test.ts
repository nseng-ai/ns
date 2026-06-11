import { describe, expect, test } from "vitest";

import { runCli } from "asdl-dev/src/cli.ts";
import { GENERATED_BODY_MARKER } from "asdl-dev/src/pr-description.ts";
import type { PendingWorktreeSnapshot } from "asdl-dev/src/pending-worktree.ts";
import type { SubmitPrLink } from "asdl-dev/src/gt-output.ts";
import type { SubmitStackNewBranch } from "asdl-dev/src/submit-pr-metadata-prewrite.ts";
import type { SubmitCommandOutput, SubmitOutputStream } from "asdl-dev/src/submit.ts";
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

function newPrBranch(overrides: Partial<SubmitStackNewBranch> = {}): SubmitStackNewBranch {
	return {
		kind: "new",
		branch: "feature/demo",
		parentBranch: "main",
		commitMessages: [{ headline: "Add widget", body: "Implement widget flow." }],
		diff: "diff --git a/src/widget.ts b/src/widget.ts\n+code\n",
		...overrides,
	};
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

	test("generates descriptions for PRs newly created by submit", async () => {
		const link = prLink(456);
		const run = runWithFakes(["submit"], {
			submit: {
				submit: { kind: "success", output: output(`Created ${link.url}\n`), prLinks: [link] },
				currentPr: { kind: "present", output: output(`${link.url}\n`), prLinks: [link] },
			},
			githubPr: {
				prs: { 456: { number: 456, url: link.url, title: "Old title", body: "", headRefName: "feature/demo", baseRefName: "main" } },
				diffs: { 456: "diff --git a/src/app.ts b/src/app.ts\n+code\n" },
				commitMessages: { 456: [{ headline: "Add generated PR descriptions" }] },
			},
			textGeneration: {
				results: [
					{
						ok: true,
						text: "Generate PR descriptions\n\nThis adds asdl-owned PR description generation.\n\n## Key Changes\n\n- Adds prompt-based generation",
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Updated PR descriptions after submit:");
		expect(run.githubPr.viewPrCalls).toEqual([{ cwd: "/work", number: 456 }]);
		expect(run.githubPr.editPrCalls).toEqual([
			expect.objectContaining({ number: 456, title: "Generate PR descriptions" }),
		]);
		expect(run.githubPr.editPrCalls[0]?.body).toContain(GENERATED_BODY_MARKER);
		expect(run.textGeneration.generateTextCalls[0]?.prompt).toContain("## Context");
		expect(run.textGeneration.generateTextCalls[0]?.prompt).toContain("## Diff");
	});

	test("prewrites generated metadata before submit and skips matching post-submit edits", async () => {
		const link = prLink(456);
		const generatedBody = "This implements the widget flow.\n\n## Key Changes\n\n- Adds widget support";
		const run = runWithFakes(["submit"], {
			submitMetadata: {
				inspection: { currentBranch: "feature/demo", branches: [newPrBranch()] },
			},
			submit: {
				submit: { kind: "success", output: output(`Created ${link.url}\n`), prLinks: [link] },
				currentPr: { kind: "present", output: output(`${link.url}\n`), prLinks: [link] },
			},
			githubPr: {
				prs: { 456: { number: 456, url: link.url, title: "Prepare widget metadata", body: generatedBody, headRefName: "feature/demo", baseRefName: "main" } },
			},
			textGeneration: {
				results: [{ ok: true, text: `Prepare widget metadata\n\n${generatedBody}` }],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Prepared initial PR metadata:");
		expect(run.submitMetadata.amendBranchMetadataCommitCalls).toEqual([
			{ cwd: "/work", currentBranch: "feature/demo", branch: "feature/demo", title: "Prepare widget metadata", body: generatedBody },
		]);
		expect(run.submitMetadata.amendBranchMetadataCommitCalls[0]?.body).not.toContain(GENERATED_BODY_MARKER);
		expect(run.githubPr.editPrCalls).toEqual([]);
		expect(run.textGeneration.generateTextCalls[0]?.prompt).toContain("PR: not yet created; generate initial metadata for Graphite submit");
	});

	test("post-submit metadata mismatch falls back to editing with the generated marker", async () => {
		const link = prLink(456);
		const generatedBody = "This implements the widget flow.\n\n## Key Changes\n\n- Adds widget support";
		const run = runWithFakes(["submit"], {
			submitMetadata: { inspection: { currentBranch: "feature/demo", branches: [newPrBranch()] } },
			submit: {
				submit: { kind: "success", output: output(`Created ${link.url}\n`), prLinks: [link] },
				currentPr: { kind: "present", output: output(`${link.url}\n`), prLinks: [link] },
			},
			githubPr: {
				prs: { 456: { number: 456, url: link.url, title: "Wrong title", body: "Wrong body", headRefName: "feature/demo", baseRefName: "main" } },
			},
			textGeneration: { results: [{ ok: true, text: `Prepare widget metadata\n\n${generatedBody}` }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Updated PR descriptions after submit:");
		expect(run.githubPr.editPrCalls).toEqual([
			expect.objectContaining({ number: 456, title: "Prepare widget metadata" }),
		]);
		expect(run.githubPr.editPrCalls[0]?.body).toContain(GENERATED_BODY_MARKER);
	});

	test("prewrite generation failure stops before amendment and submit", async () => {
		const run = runWithFakes(["submit"], {
			submitMetadata: { inspection: { currentBranch: "feature/demo", branches: [newPrBranch()] } },
			textGeneration: { results: [{ ok: false, error: "model unavailable" }] },
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("Could not generate initial PR metadata for feature/demo");
		expect(run.submitMetadata.amendBranchMetadataCommitCalls).toEqual([]);
		expect(run.submit.submitCurrentStackCalls).toEqual([]);
	});

	test("multi-commit branches skip prewrite and generate after submit", async () => {
		const link = prLink(456);
		const run = runWithFakes(["submit"], {
			submitMetadata: { inspection: { currentBranch: "feature/demo", branches: [newPrBranch({ commitMessages: [{ headline: "one" }, { headline: "two" }] })] } },
			submit: {
				submit: { kind: "success", output: output(`${link.url}\n`), prLinks: [link] },
				currentPr: { kind: "present", output: output(`${link.url}\n`), prLinks: [link] },
			},
			githubPr: {
				prs: { 456: { number: 456, url: link.url, title: "Add widget", body: "", headRefName: "feature/demo", baseRefName: "main" } },
				diffs: { 456: "diff --git a/src/widget.ts b/src/widget.ts\n+code\n" },
				commitMessages: { 456: [{ headline: "one" }, { headline: "two" }] },
			},
			textGeneration: { results: [{ ok: true, text: "Generated after submit\n\nGenerated body." }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.submitMetadata.amendBranchMetadataCommitCalls).toEqual([]);
		expect(run.submit.submitCurrentStackCalls).toEqual([{ cwd: "/work" }]);
		expect(run.githubPr.editPrCalls).toEqual([expect.objectContaining({ number: 456, title: "Generated after submit" })]);
	});

	test("upstack new branches skip prewrite", async () => {
		const link = prLink(456);
		const run = runWithFakes(["submit"], {
			submitMetadata: {
				inspection: {
					currentBranch: "feature/base",
					branches: [
						newPrBranch({ branch: "feature/base", parentBranch: "main" }),
						newPrBranch({ branch: "feature/upstack", parentBranch: "feature/base" }),
					],
				},
			},
			submit: {
				submit: { kind: "success", output: output(`${link.url}\n`), prLinks: [link] },
				currentPr: { kind: "present", output: output(`${link.url}\n`), prLinks: [link] },
			},
			githubPr: {
				prs: { 456: { number: 456, url: link.url, title: "Base PR", body: "Generated body", headRefName: "feature/base", baseRefName: "main" } },
			},
			textGeneration: { results: [{ ok: true, text: "Base PR\n\nGenerated body" }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.submitMetadata.amendBranchMetadataCommitCalls).toEqual([
			{ cwd: "/work", currentBranch: "feature/base", branch: "feature/base", title: "Base PR", body: "Generated body" },
		]);
	});

	test("final submit failure after prewrite reports prepared local metadata", async () => {
		const generatedBody = "This implements the widget flow.\n\n## Key Changes\n\n- Adds widget support";
		const run = runWithFakes(["submit"], {
			submitMetadata: { inspection: { currentBranch: "feature/demo", branches: [newPrBranch()] } },
			submit: {
				submit: { kind: "failed", output: output("", "Graphite failed\n", 1) },
			},
			textGeneration: { results: [{ ok: true, text: `Prepare widget metadata\n\n${generatedBody}` }] },
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("Local PR metadata commit messages were prepared before submit");
		expect(run.submitMetadata.amendBranchMetadataCommitCalls).toHaveLength(1);
		expect(run.submit.verifyCurrentPrCalls).toEqual([]);
	});

	test("failed dry-run does not prewrite metadata", async () => {
		const run = runWithFakes(["submit"], {
			submit: {
				preflight: { kind: "failed", output: output("", "ERROR: Aborting dry run.\n", 1) },
			},
			submitMetadata: { inspection: { currentBranch: "feature/demo", branches: [newPrBranch()] } },
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("gt submit -nps --no-ai --dry-run failed");
		expect(run.submitMetadata.inspectSubmitStackCalls).toEqual([]);
		expect(run.textGeneration.generateTextCalls).toEqual([]);
		expect(run.submit.submitCurrentStackCalls).toEqual([]);
	});

	test("overwrites a gt-prefilled body that matches the commit message", async () => {
		const link = prLink(456);
		const run = runWithFakes(["submit"], {
			submit: {
				submit: { kind: "success", output: output(`Created ${link.url}\n`), prLinks: [link] },
				currentPr: { kind: "present", output: output(`${link.url}\n`), prLinks: [link] },
			},
			githubPr: {
				prs: { 456: { number: 456, url: link.url, title: "Add widget", body: "Implements the widget flow.", headRefName: "feature/demo", baseRefName: "main" } },
				diffs: { 456: "diff --git a/src/widget.ts b/src/widget.ts\n+code\n" },
				commitMessages: { 456: [{ headline: "Add widget", body: "Implements the widget flow.\n" }] },
			},
			textGeneration: {
				results: [
					{
						ok: true,
						text: "Add the widget flow\n\nThis implements the widget flow end to end.\n\n## Key Changes\n\n- Adds the widget module",
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Updated PR descriptions after submit:");
		expect(run.githubPr.editPrCalls).toEqual([
			expect.objectContaining({ number: 456, title: "Add the widget flow" }),
		]);
		expect(run.githubPr.editPrCalls[0]?.body).toContain(GENERATED_BODY_MARKER);
	});

	test("does not overwrite a manually edited PR body", async () => {
		const link = prLink(456);
		const run = runWithFakes(["submit"], {
			submit: {
				submit: { kind: "success", output: output(`${link.url}\n`), prLinks: [link] },
				currentPr: { kind: "present", output: output(`${link.url}\n`), prLinks: [link] },
			},
			githubPr: {
				prs: { 456: { number: 456, url: link.url, title: "Old title", body: "Manual body", headRefName: "feature/demo", baseRefName: "main" } },
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).not.toContain("Generated PR descriptions:");
		expect(run.stdout.join("")).toContain("Skipped PR descriptions (body looks hand-edited):");
		expect(run.stdout.join("")).toContain("#456 https://github.com/acme/project/pull/456");
		expect(run.stdout.join("")).toContain("Checkout the branch and run `asdl-dev pr-regen --force` to overwrite a hand-edited body.");
		expect(run.githubPr.viewPrCalls).toEqual([{ cwd: "/work", number: 456 }]);
		expect(run.githubPr.getPrCommitMessagesCalls).toEqual([{ cwd: "/work", number: 456 }]);
		expect(run.githubPr.editPrCalls).toEqual([]);
		expect(run.textGeneration.generateTextCalls).toEqual([]);
	});

	test("regenerates marker-bearing PR bodies on submit", async () => {
		const link = prLink(456);
		const run = runWithFakes(["submit"], {
			submit: {
				submit: { kind: "success", output: output(`${link.url}\n`), prLinks: [link] },
				currentPr: { kind: "present", output: output(`${link.url}\n`), prLinks: [link] },
			},
			githubPr: {
				prs: { 456: { number: 456, url: link.url, title: "Old title", body: `Previous generated body\n\n${GENERATED_BODY_MARKER}`, headRefName: "feature/demo", baseRefName: "main" } },
				diffs: { 456: "diff --git a/src/app.ts b/src/app.ts\n+code\n" },
				commitMessages: { 456: [{ headline: "Refresh generated PR descriptions" }] },
			},
			textGeneration: {
				results: [
					{
						ok: true,
						text: "Refresh PR descriptions\n\nThis refreshes the asdl-owned PR description.\n\n## Key Changes\n\n- Updates generated body",
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Updated PR descriptions after submit:");
		expect(run.githubPr.editPrCalls).toEqual([
			expect.objectContaining({ number: 456, title: "Refresh PR descriptions" }),
		]);
		expect(run.githubPr.editPrCalls[0]?.body).toContain(GENERATED_BODY_MARKER);
	});

	test("description failure after successful submit reports submitted PRs and pr-regen guidance", async () => {
		const link = prLink(456);
		const run = runWithFakes(["submit"], {
			submit: {
				submit: { kind: "success", output: output(`${link.url}\n`), prLinks: [link] },
				currentPr: { kind: "present", output: output(`${link.url}\n`), prLinks: [link] },
			},
			githubPr: {
				prs: { 456: { number: 456, url: link.url, title: "Old title", body: "", headRefName: "feature/demo", baseRefName: "main" } },
				diffs: { 456: { error: { code: "diff_failed", message: "diff unavailable" } } },
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("PRs were submitted; description generation failed");
		expect(run.stderr.join("")).toContain("#456 https://github.com/acme/project/pull/456");
		expect(run.stderr.join("")).toContain("asdl-dev pr-regen");
	});

	test("submit success without detected PR links skips generation with pr-regen notice", async () => {
		const run = runWithFakes(["submit"], {
			submit: {
				submit: { kind: "success", output: output("Submitted stack\n"), prLinks: [] },
				currentPr: { kind: "present", output: output("current PR ok\n"), prLinks: [] },
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("PR descriptions were not generated");
		expect(run.stdout.join("")).toContain("asdl-dev pr-regen");
		expect(run.githubPr.editPrCalls).toEqual([]);
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
		expect(run.stderr.join("")).toContain("$ gt submit -nps --no-ai --dry-run");
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
		expect(run.confirmations[0]?.message).toContain("gt submit -nps --no-ai");
		expect(run.submit.operationCalls.map((call) => call.operation)).toEqual([
			"checkSubmitReadiness",
			"restackCurrentStack",
			"checkSubmitReadiness",
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
		expect(run.stderr.join("")).toContain("$ gt submit -nps --no-ai --dry-run");
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
		expect(run.stderr.join("")).toContain("gt submit -nps --no-ai failed with exit code 1");
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
		expect(run.stderr.join("")).toContain("$ gt submit -nps --no-ai");
	});

	test("unsupported arguments fail before touching Graphite", async () => {
		const run = runWithFakes(["submit", "--bogus"]);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Unknown option: --bogus");
		expect(run.submit.checkSubmitReadinessCalls).toEqual([]);
	});
});
