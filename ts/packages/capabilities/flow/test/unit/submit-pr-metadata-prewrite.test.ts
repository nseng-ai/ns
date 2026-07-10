import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";
import { ScriptedTextGenerator } from "@nseng-ai/capability-kit/text-generation/testing";
import { ScriptedCommandRunner, exitedResult, step } from "@nseng-ai/foundation/exec/testing";
import { formatActiveOperation, type ActiveOperation } from "@nseng-ai/kernel/sdk";
import {
	buildSubmitPlan,
	ok,
	parseCommitMessages,
	parseGtLogStack,
	parseParentBranch,
	prewriteSubmitMetadata,
	RealSubmitMetadataGateway,
	type SubmitMetadataGateway,
	type SubmitPlan,
	type TextGenerator,
} from "../../src/submit/index.ts";

const MODEL_ENV = { NS_DEV_PR_DESCRIPTION_MODEL: "openai-codex/gpt-5.4-mini" };

/**
 * One flat ordered trace of item transitions, active-operation snapshots, and fake work
 * markers, so tests can assert that operations are published exactly while work is pending.
 */
interface TraceRecorder {
	record(entry: string): void;
	read(): readonly string[];
}

function createTraceRecorder(): TraceRecorder {
	const entries: string[] = [];
	return {
		record: (entry) => entries.push(entry),
		read: () => [...entries],
	};
}

function traceListeners(trace: TraceRecorder) {
	return {
		onActiveOperations: (operations: readonly ActiveOperation[]) =>
			trace.record(`ops:${operations.map(formatActiveOperation).join("|")}`),
		onItemProgress: (event: { branch: string; state: string; reason?: string }) =>
			trace.record(`item:${event.branch}:${event.state}:${event.reason ?? ""}`),
	};
}

function tracingTextGenerator(
	trace: TraceRecorder,
	scripted: ScriptedTextGenerator,
): TextGenerator {
	return {
		generateText: async (request) => {
			trace.record("work:generate");
			return scripted.generateText(request);
		},
	};
}

async function planFromGateway(gateway: SubmitMetadataGateway): Promise<SubmitPlan> {
	const planned = await buildSubmitPlan({ cwd: "/repo", gateway });
	if (planned.kind !== "planned") {
		throw new Error(`expected a planned submit plan, got: ${planned.error}`);
	}
	return planned.plan;
}

function twoNewBranchesGateway(
	trace: TraceRecorder,
	options: { shouldAmendReject?: boolean } = {},
): SubmitMetadataGateway {
	return {
		inspectSubmitStackTopology: async () => {
			throw new Error("unexpected inspectSubmitStackTopology call");
		},
		inspectSubmitStack: async () => ({
			ok: true,
			value: {
				currentBranch: "feature/b",
				hasUpstackBranches: false,
				branches: [
					{
						kind: "new",
						branch: "feature/a",
						parentBranch: "main",
						commitMessages: [{ headline: "Add feature A" }],
						diff: "diff --git a/a.ts b/a.ts\n",
					},
					{
						kind: "new",
						branch: "feature/b",
						parentBranch: "feature/a",
						commitMessages: [{ headline: "Add feature B" }],
						diff: "diff --git a/b.ts b/b.ts\n",
					},
				],
			},
		}),
		ensureCleanWorktree: async () => ok(undefined),
		amendBranchMetadataCommit: async (params) => {
			trace.record(`work:amend:${params.branch}`);
			if (options.shouldAmendReject === true) throw new Error("gt modify crashed");
			return ok(undefined);
		},
	};
}

describe("prewriteSubmitMetadata", () => {
	test("publishes each model and amendment operation only while its work is pending", async () => {
		const trace = createTraceRecorder();
		const scripted = new ScriptedTextGenerator([
			{ ok: true, text: "Generated A\n\nGenerated body A" },
			{ ok: true, text: "Generated B\n\nGenerated body B" },
		]);
		const gateway = twoNewBranchesGateway(trace);

		const result = await prewriteSubmitMetadata(await planFromGateway(gateway), {
			cwd: "/repo",
			env: MODEL_ENV,
			git: new InMemoryGitGateway({ repoRoot: "/repo" }),
			textGenerator: tracingTextGenerator(trace, scripted),
			gateway,
			progress: traceListeners(trace),
		});

		expect(result.kind).toBe("prepared");
		expect(trace.read()).toEqual([
			"item:feature/a:active:generating-metadata",
			"ops:LM · generating PR metadata · openai-codex/gpt-5.4-mini · branch 1/2",
			"work:generate",
			"ops:",
			"item:feature/a:done:metadata-drafted",
			"item:feature/b:active:generating-metadata",
			"ops:LM · generating PR metadata · openai-codex/gpt-5.4-mini · branch 2/2",
			"work:generate",
			"ops:",
			"item:feature/b:done:metadata-drafted",
			"item:feature/a:active:amending-metadata-commit",
			"ops:gt modify --no-interactive --into feature/a",
			"work:amend:feature/a",
			"ops:",
			"item:feature/a:done:metadata-prepared",
			"item:feature/b:active:amending-metadata-commit",
			"ops:gt modify --no-interactive",
			"work:amend:feature/b",
			"ops:",
			"item:feature/b:done:metadata-prepared",
		]);
		// Operation displays never expose message arguments or generated content.
		for (const entry of trace.read().filter((item) => item.startsWith("ops:"))) {
			expect(entry).not.toMatch(/\s-m\b/);
			expect(entry).not.toContain("Generated A");
			expect(entry).not.toContain("Generated body");
		}
		scripted.assertDone();
	});

	test("a rejecting text generator still leaves the last operation snapshot empty", async () => {
		const trace = createTraceRecorder();
		const throwingGenerator: TextGenerator = {
			generateText: async () => {
				throw new Error("model transport failed");
			},
		};
		const gateway = twoNewBranchesGateway(trace);

		await expect(
			prewriteSubmitMetadata(await planFromGateway(gateway), {
				cwd: "/repo",
				env: MODEL_ENV,
				git: new InMemoryGitGateway({ repoRoot: "/repo" }),
				textGenerator: throwingGenerator,
				gateway,
				progress: traceListeners(trace),
			}),
		).rejects.toThrow("model transport failed");

		const snapshots = trace.read().filter((entry) => entry.startsWith("ops:"));
		expect(snapshots.length).toBeGreaterThan(0);
		expect(snapshots.at(-1)).toBe("ops:");
	});

	test("a rejecting amendment gateway still leaves the last operation snapshot empty", async () => {
		const trace = createTraceRecorder();
		const scripted = new ScriptedTextGenerator([
			{ ok: true, text: "Generated A\n\nGenerated body A" },
			{ ok: true, text: "Generated B\n\nGenerated body B" },
		]);
		const gateway = twoNewBranchesGateway(trace, { shouldAmendReject: true });

		await expect(
			prewriteSubmitMetadata(await planFromGateway(gateway), {
				cwd: "/repo",
				env: MODEL_ENV,
				git: new InMemoryGitGateway({ repoRoot: "/repo" }),
				textGenerator: tracingTextGenerator(trace, scripted),
				gateway,
				progress: traceListeners(trace),
			}),
		).rejects.toThrow("gt modify crashed");

		const snapshots = trace.read().filter((entry) => entry.startsWith("ops:"));
		expect(snapshots.at(-1)).toBe("ops:");
	});

	test("no amendable branches produce no active-operation events", async () => {
		const trace = createTraceRecorder();
		const gateway: SubmitMetadataGateway = {
			inspectSubmitStackTopology: async () => {
				throw new Error("unexpected inspectSubmitStackTopology call");
			},
			inspectSubmitStack: async () => ({
				ok: true,
				value: {
					currentBranch: "feature/b",
					hasUpstackBranches: false,
					branches: [
						{
							kind: "existing",
							branch: "feature/a",
							parentBranch: "main",
							pr: { label: "#123", url: "https://github.com/acme/repo/pull/123" },
						},
						{
							kind: "new",
							branch: "feature/b",
							parentBranch: "feature/a",
							commitMessages: [{ headline: "Add b" }, { headline: "Refine b" }],
							diff: "diff --git a/b b/b\n+b",
						},
					],
				},
			}),
			ensureCleanWorktree: async () => {
				throw new Error("unexpected ensureCleanWorktree call");
			},
			amendBranchMetadataCommit: async () => {
				throw new Error("unexpected amendBranchMetadataCommit call");
			},
		};

		const result = await prewriteSubmitMetadata(await planFromGateway(gateway), {
			cwd: "/repo",
			env: MODEL_ENV,
			git: new InMemoryGitGateway({ repoRoot: "/repo" }),
			textGenerator: {
				generateText: async () => {
					throw new Error("unexpected generateText call");
				},
			},
			gateway,
			progress: traceListeners(trace),
		});

		expect(result.kind).toBe("prepared");
		expect(trace.read().filter((entry) => entry.startsWith("ops:"))).toEqual([]);
	});
});

describe("RealSubmitMetadataGateway", () => {
	test("parses Graphite stack and branch metadata facts", () => {
		const log = `◯ parent-branch
│
◉ feature/demo (current)
│
◯ master
`;

		expect(parseGtLogStack(log)).toEqual({
			branches: ["parent-branch", "feature/demo", "master"],
			currentBranch: "feature/demo",
		});
		expect(parseParentBranch("feature/demo\n\nParent: parent-branch\n")).toBe("parent-branch");
		expect(parseCommitMessages("Add widget\n\nImplement widget.\0Fix tests\0")).toEqual([
			{ headline: "Add widget", body: "Implement widget." },
			{ headline: "Fix tests" },
		]);
	});

	test("inspectSubmitStack skips local diff reads for existing PR branches", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				["log", "--stack", "--reverse", "--no-interactive"],
				exitedResult({
					stdout: "◯ master\n│\n◉ feature/demo (current)\n",
				}),
			),
			step("gt", ["trunk", "--no-interactive"], exitedResult({ stdout: "master\n" })),
			step(
				"gt",
				["branch", "info", "--no-interactive", "--branch", "feature/demo"],
				exitedResult({
					stdout:
						"feature/demo\n\nPR #456 (Open) Demo PR\nhttps://github.com/acme/project/pull/456\n\nParent: master\n",
				}),
			),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		const result = await gateway.inspectSubmitStack({ cwd: "/repo" });

		expect(result).toEqual({
			ok: true,
			value: {
				currentBranch: "feature/demo",
				hasUpstackBranches: false,
				branches: [
					{
						kind: "existing",
						branch: "feature/demo",
						parentBranch: "master",
						pr: { label: "#456", url: "https://github.com/acme/project/pull/456" },
					},
				],
			},
		});
		runner.assertDone();
	});

	test("inspectSubmitStack fails when branch info reports a PR without a link", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				["log", "--stack", "--reverse", "--no-interactive"],
				exitedResult({
					stdout: "◯ master\n│\n◉ feature/demo (current)\n",
				}),
			),
			step("gt", ["trunk", "--no-interactive"], exitedResult({ stdout: "master\n" })),
			step(
				"gt",
				["branch", "info", "--no-interactive", "--branch", "feature/demo"],
				exitedResult({
					stdout: "feature/demo\n\nPR #456 (Open) Demo PR\n\nParent: master\n",
				}),
			),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		const result = await gateway.inspectSubmitStack({ cwd: "/repo" });

		expect(result).toMatchObject({ ok: false, error: { code: "submit_existing_pr_link_missing" } });
		runner.assertDone();
	});

	test("inspectSubmitStackTopology reads only topology and existing PR facts", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				["log", "--stack", "--reverse", "--no-interactive"],
				exitedResult({
					stdout: "◯ master\n│\n◯ feature/base\n│\n◉ feature/demo (current)\n",
				}),
			),
			step("gt", ["trunk", "--no-interactive"], exitedResult({ stdout: "master\n" })),
			step(
				"gt",
				["branch", "info", "--no-interactive", "--branch", "feature/demo"],
				exitedResult({
					stdout: "feature/demo\n\nParent: feature/base\n",
				}),
			),
			step(
				"gt",
				["branch", "info", "--no-interactive", "--branch", "feature/base"],
				exitedResult({
					stdout:
						"feature/base\n\nPR #456 (Open) Base PR\nhttps://github.com/acme/project/pull/456\n\nParent: master\n",
				}),
			),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		const result = await gateway.inspectSubmitStackTopology({ cwd: "/repo" });

		expect(result).toEqual({
			ok: true,
			value: {
				currentBranch: "feature/demo",
				branches: [
					{
						kind: "existing",
						branch: "feature/base",
						parentBranch: "master",
						pr: { label: "#456", url: "https://github.com/acme/project/pull/456" },
					},
					{ kind: "new", branch: "feature/demo", parentBranch: "feature/base" },
				],
			},
		});
		expect(runner.calls.map((call) => call.command)).toEqual(["gt", "gt", "gt", "gt"]);
		runner.assertDone();
	});

	test("inspectSubmitStack reads local diffs and commits for new submit branches", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				["log", "--stack", "--reverse", "--no-interactive"],
				exitedResult({
					stdout: "◯ master\n│\n◯ feature/demo (current)\n",
				}),
			),
			step("gt", ["trunk", "--no-interactive"], exitedResult({ stdout: "master\n" })),
			step(
				"gt",
				["branch", "info", "--no-interactive", "--branch", "feature/demo"],
				exitedResult({
					stdout: "feature/demo\n\nParent: master\n",
				}),
			),
			step(
				"git",
				["log", "--format=%B%x00", "master..feature/demo"],
				exitedResult({
					stdout: "Add widget\n\nImplement widget.\0",
				}),
			),
			step(
				"git",
				["diff", "master..feature/demo"],
				exitedResult({
					stdout: "diff --git a/src/widget.ts b/src/widget.ts\n+code\n",
				}),
			),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		const result = await gateway.inspectSubmitStack({ cwd: "/repo" });

		expect(result).toEqual({
			ok: true,
			value: {
				currentBranch: "feature/demo",
				hasUpstackBranches: false,
				branches: [
					{
						kind: "new",
						branch: "feature/demo",
						parentBranch: "master",
						commitMessages: [{ headline: "Add widget", body: "Implement widget." }],
						diff: "diff --git a/src/widget.ts b/src/widget.ts\n+code\n",
					},
				],
			},
		});
		runner.assertDone();
	});

	test("inspectSubmitStack ignores upstack descendants when reading branch metadata", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				["log", "--stack", "--reverse", "--no-interactive"],
				exitedResult({
					stdout:
						"◯ master\n│\n◯ downstack/base\n│\n◉ feature/current (current)\n│\n◯ feature/upstack\n",
				}),
			),
			step("gt", ["trunk", "--no-interactive"], exitedResult({ stdout: "master\n" })),
			step(
				"gt",
				["branch", "info", "--no-interactive", "--branch", "feature/current"],
				exitedResult({
					stdout:
						"feature/current\n\nPR #789 (Open) Current PR\nhttps://github.com/acme/project/pull/789\n\nParent: downstack/base\n",
				}),
			),
			step(
				"gt",
				["branch", "info", "--no-interactive", "--branch", "downstack/base"],
				exitedResult({
					stdout:
						"downstack/base\n\nPR #456 (Open) Base PR\nhttps://github.com/acme/project/pull/456\n\nParent: master\n",
				}),
			),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		const result = await gateway.inspectSubmitStack({ cwd: "/repo" });

		expect(result).toEqual({
			ok: true,
			value: {
				currentBranch: "feature/current",
				hasUpstackBranches: true,
				branches: [
					{
						kind: "existing",
						branch: "downstack/base",
						parentBranch: "master",
						pr: { label: "#456", url: "https://github.com/acme/project/pull/456" },
					},
					{
						kind: "existing",
						branch: "feature/current",
						parentBranch: "downstack/base",
						pr: { label: "#789", url: "https://github.com/acme/project/pull/789" },
					},
				],
			},
		});
		expect(runner.calls.map((call) => call.args.join(" "))).not.toContain(
			"branch info --no-interactive --branch feature/upstack",
		);
		runner.assertDone();
	});

	test("inspectSubmitStack fails on branch parent cycles", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				["log", "--stack", "--reverse", "--no-interactive"],
				exitedResult({
					stdout: "◯ master\n│\n◯ feature/base\n│\n◉ feature/current (current)\n",
				}),
			),
			step("gt", ["trunk", "--no-interactive"], exitedResult({ stdout: "master\n" })),
			step(
				"gt",
				["branch", "info", "--no-interactive", "--branch", "feature/current"],
				exitedResult({
					stdout: "feature/current\n\nParent: feature/base\n",
				}),
			),
			step(
				"gt",
				["branch", "info", "--no-interactive", "--branch", "feature/base"],
				exitedResult({
					stdout: "feature/base\n\nParent: feature/current\n",
				}),
			),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		const result = await gateway.inspectSubmitStack({ cwd: "/repo" });

		expect(result).toMatchObject({ ok: false, error: { code: "submit_branch_parent_cycle" } });
		runner.assertDone();
	});

	test("amends the current branch without --into while keeping message args", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				["modify", "--no-interactive", "-m", "Generated title", "-m", "Generated body"],
				exitedResult({
					stdout: "Modified\n",
				}),
			),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		expect(
			await gateway.amendBranchMetadataCommit({
				cwd: "/repo",
				currentBranch: "feature/demo",
				branch: "feature/demo",
				title: "Generated title",
				body: "Generated body",
			}),
		).toEqual({ ok: true, value: undefined });
		runner.assertDone();
	});

	test("amends another branch with --into while keeping message args", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"modify",
					"--no-interactive",
					"--into",
					"feature/a",
					"-m",
					"Generated title",
					"-m",
					"Generated body",
				],
				exitedResult({ stdout: "Modified\n" }),
			),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		expect(
			await gateway.amendBranchMetadataCommit({
				cwd: "/repo",
				currentBranch: "feature/b",
				branch: "feature/a",
				title: "Generated title",
				body: "Generated body",
			}),
		).toEqual({ ok: true, value: undefined });
		runner.assertDone();
	});
});
