import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { ScriptedTextGenerator } from "@nseng-ai/capability-kit/text-generation/testing";
import { FakeGraphiteStackGateway, fakeStackInfo } from "@nseng-ai/capability-kit/graphite/testing";
import type { StackResult } from "@nseng-ai/capability-kit/graphite/stack";
import { ScriptedCommandRunner, exitedResult, step } from "@nseng-ai/foundation/exec/testing";
import { formatActiveOperation, type ActiveOperation } from "@nseng-ai/sdk";
import { flowExtensionDescriptorSource } from "../../src/ns/extension.ts";
import {
	buildSubmitPlan,
	ok,
	parseCommitMessages,
	prewriteSubmitMetadata,
	RealSubmitMetadataGateway,
	type SubmitMetadataGateway,
	type SubmitPlan,
	type TextGenerator,
} from "../../src/submit/index.ts";

const MODEL_ENV = {};

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
			descriptorSource: flowExtensionDescriptorSource,
			modelRef: "openai-codex/gpt-5.6-luna",
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
				descriptorSource: flowExtensionDescriptorSource,
				modelRef: "openai-codex/gpt-5.6-luna",
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
				descriptorSource: flowExtensionDescriptorSource,
				modelRef: "openai-codex/gpt-5.6-luna",
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
			descriptorSource: flowExtensionDescriptorSource,
			modelRef: "openai-codex/gpt-5.6-luna",
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
	const prUrl = "https://github.com/acme/project/pull/456";

	function prListArgs(branch: string): string[] {
		return [
			"pr",
			"list",
			"--head",
			branch,
			"--state",
			"open",
			"--limit",
			"2",
			"--json",
			"number,url",
		];
	}

	function createGateway(
		graphite: FakeGraphiteStackGateway,
		runner: ScriptedCommandRunner,
	): RealSubmitMetadataGateway {
		return new RealSubmitMetadataGateway({ graphite, runner: runner.runner });
	}

	test("parses local commit messages without Graphite display output", () => {
		expect(parseCommitMessages("Add widget\n\nImplement widget.\0Fix tests\0")).toEqual([
			{ headline: "Add widget", body: "Implement widget." },
			{ headline: "Fix tests" },
		]);
	});

	test("derives trunk-to-current order, permits forks, and reads local facts only for new branches", async () => {
		const graphite = new FakeGraphiteStackGateway({
			stack: {
				type: "stack",
				stack: fakeStackInfo({
					trunk: "main",
					current: "feature/top",
					ancestors: ["main", "feature/base"],
					descendants: ["feature/child-a"],
					descendantWalk: {
						forks: [
							{
								branch: "feature/top",
								children: ["feature/child-a", "feature/child-b"],
							},
						],
						childrenCorruptions: [],
						termination: { type: "completed" },
					},
				}),
			},
		});
		const runner = new ScriptedCommandRunner([
			step(
				"gh",
				prListArgs("feature/base"),
				exitedResult({ stdout: JSON.stringify([{ number: 456, url: prUrl }]) }),
			),
			step("gh", prListArgs("feature/top"), exitedResult({ stdout: "[]" })),
			step(
				"git",
				["log", "--format=%B%x00", "feature/base..feature/top"],
				exitedResult({ stdout: "Add top\n\nTop body.\0" }),
			),
			step(
				"git",
				["diff", "feature/base..feature/top"],
				exitedResult({ stdout: "diff --git a/top.ts b/top.ts\n+code\n" }),
			),
		]);

		const result = await createGateway(graphite, runner).inspectSubmitStack({ cwd: "/repo" });

		expect(result).toEqual({
			ok: true,
			value: {
				currentBranch: "feature/top",
				hasUpstackBranches: true,
				branches: [
					{
						kind: "existing",
						branch: "feature/base",
						parentBranch: "main",
						pr: { label: "#456", url: prUrl },
					},
					{
						kind: "new",
						branch: "feature/top",
						parentBranch: "feature/base",
						commitMessages: [{ headline: "Add top", body: "Top body." }],
						diff: "diff --git a/top.ts b/top.ts\n+code\n",
					},
				],
			},
		});
		expect(graphite.operations()).toEqual([{ type: "stack", cwd: "/repo" }]);
		expect(runner.calls.map((call) => call.command)).toEqual(["gh", "gh", "git", "git"]);
		runner.assertDone();
	});

	test("uses one structured PR row as existing and performs no local diff reads", async () => {
		const graphite = new FakeGraphiteStackGateway({
			stack: {
				type: "stack",
				stack: fakeStackInfo({ trunk: "main", current: "feature/demo", ancestors: ["main"] }),
			},
		});
		const runner = new ScriptedCommandRunner([
			step(
				"gh",
				prListArgs("feature/demo"),
				exitedResult({ stdout: JSON.stringify([{ number: 456, url: prUrl }]) }),
			),
		]);

		const result = await createGateway(graphite, runner).inspectSubmitStack({ cwd: "/repo" });

		expect(result).toEqual({
			ok: true,
			value: {
				currentBranch: "feature/demo",
				hasUpstackBranches: false,
				branches: [
					{
						kind: "existing",
						branch: "feature/demo",
						parentBranch: "main",
						pr: { label: "#456", url: prUrl },
					},
				],
			},
		});
		expect(runner.calls.map((call) => call.command)).toEqual(["gh"]);
		runner.assertDone();
	});

	test("zero structured PR rows classify a branch as new", async () => {
		const graphite = new FakeGraphiteStackGateway({
			stack: {
				type: "stack",
				stack: fakeStackInfo({ trunk: "main", current: "feature/demo", ancestors: ["main"] }),
			},
		});
		const runner = new ScriptedCommandRunner([
			step("gh", prListArgs("feature/demo"), exitedResult({ stdout: "[]" })),
			step(
				"git",
				["log", "--format=%B%x00", "main..feature/demo"],
				exitedResult({ stdout: "Add demo\0" }),
			),
			step(
				"git",
				["diff", "main..feature/demo"],
				exitedResult({ stdout: "diff --git a/demo.ts b/demo.ts\n" }),
			),
		]);

		const result = await createGateway(graphite, runner).inspectSubmitStack({ cwd: "/repo" });

		expect(result).toMatchObject({
			ok: true,
			value: {
				branches: [
					{
						kind: "new",
						branch: "feature/demo",
						parentBranch: "main",
					},
				],
			},
		});
		runner.assertDone();
	});

	test("topology inspection uses structured GitHub identity without local diff reads", async () => {
		const graphite = new FakeGraphiteStackGateway({
			stack: {
				type: "stack",
				stack: fakeStackInfo({ trunk: "main", current: "feature/demo", ancestors: ["main"] }),
			},
		});
		const runner = new ScriptedCommandRunner([
			step(
				"gh",
				prListArgs("feature/demo"),
				exitedResult({ stdout: JSON.stringify([{ number: 456, url: prUrl }]) }),
			),
		]);

		expect(
			await createGateway(graphite, runner).inspectSubmitStackTopology({ cwd: "/repo" }),
		).toEqual({
			ok: true,
			value: {
				currentBranch: "feature/demo",
				branches: [
					{
						kind: "existing",
						branch: "feature/demo",
						parentBranch: "main",
						pr: { label: "#456", url: prUrl },
					},
				],
			},
		});
		runner.assertDone();
	});

	const discoveryFailures: readonly {
		name: string;
		stack: StackResult;
		code: string;
		details?: Record<string, unknown>;
	}[] = [
		{
			name: "untracked current branch",
			stack: { type: "untracked_branch", message: "feature/demo is not tracked" },
			code: "submit_stack_untracked_branch",
		},
		{
			name: "provider failure",
			stack: {
				type: "failure",
				failure: { message: "metadata store unavailable", returnCode: 17 },
			},
			code: "submit_stack_inspection_failed",
			details: { return_code: 17 },
		},
		{
			name: "ancestor cycle",
			stack: {
				type: "stack",
				stack: fakeStackInfo({
					ancestorTermination: { type: "cycle", branch: "feature/demo" },
				}),
			},
			code: "submit_stack_ancestor_cycle",
		},
		{
			name: "missing ancestor row",
			stack: {
				type: "stack",
				stack: fakeStackInfo({
					ancestorTermination: { type: "row_missing", branch: "feature/base" },
				}),
			},
			code: "submit_stack_ancestor_row_missing",
		},
		{
			name: "inconsistent trunk marker",
			stack: {
				type: "stack",
				stack: fakeStackInfo({
					trunkMarker: {
						type: "problem",
						terminus: "main",
						terminusState: "unmarked",
						markedTrunks: [],
					},
				}),
			},
			code: "submit_stack_trunk_marker_inconsistent",
		},
		{
			name: "duplicate ancestor path",
			stack: {
				type: "stack",
				stack: fakeStackInfo({
					trunk: "main",
					current: "feature/demo",
					ancestors: ["main", "feature/base", "feature/base"],
				}),
			},
			code: "submit_stack_path_inconsistent",
		},
		{
			name: "current branch is trunk",
			stack: {
				type: "stack",
				stack: fakeStackInfo({ trunk: "main", current: "main", ancestors: [] }),
			},
			code: "submit_stack_path_inconsistent",
		},
		{
			name: "corrupt current descendant list",
			stack: {
				type: "stack",
				stack: fakeStackInfo({
					descendantWalk: {
						forks: [],
						childrenCorruptions: [{ branch: "feature/current", kind: "invalid_json" }],
						termination: { type: "completed" },
					},
				}),
			},
			code: "submit_stack_descendant_metadata_inconsistent",
		},
		{
			name: "incomplete descendant walk",
			stack: {
				type: "stack",
				stack: fakeStackInfo({
					descendantWalk: {
						forks: [],
						childrenCorruptions: [],
						termination: { type: "row_missing", branch: "feature/current" },
					},
				}),
			},
			code: "submit_stack_descendant_metadata_inconsistent",
		},
	];

	test.each(discoveryFailures)("fails safely for $name", async ({ stack, code, details }) => {
		const graphite = new FakeGraphiteStackGateway({ stack });
		const runner = new ScriptedCommandRunner([]);

		const result = await createGateway(graphite, runner).inspectSubmitStack({ cwd: "/repo" });

		expect(result).toMatchObject({
			ok: false,
			error: { code, ...(details === undefined ? {} : { details }) },
		});
		expect(graphite.operations()).toEqual([{ type: "stack", cwd: "/repo" }]);
		expect(runner.calls).toEqual([]);
	});

	test("rejects ambiguous open PR identity", async () => {
		const graphite = new FakeGraphiteStackGateway();
		const runner = new ScriptedCommandRunner([
			step(
				"gh",
				prListArgs("feature/current"),
				exitedResult({
					stdout: JSON.stringify([
						{ number: 456, url: prUrl },
						{ number: 789, url: "https://github.com/acme/project/pull/789" },
					]),
				}),
			),
		]);

		const result = await createGateway(graphite, runner).inspectSubmitStack({ cwd: "/repo" });

		expect(result).toMatchObject({
			ok: false,
			error: { code: "submit_branch_pr_lookup_ambiguous" },
		});
		runner.assertDone();
	});

	test("rejects malformed GitHub PR JSON", async () => {
		const graphite = new FakeGraphiteStackGateway();
		const runner = new ScriptedCommandRunner([
			step(
				"gh",
				prListArgs("feature/current"),
				exitedResult({ stdout: '[{"number":"456","url":null}]' }),
			),
		]);

		const result = await createGateway(graphite, runner).inspectSubmitStack({ cwd: "/repo" });

		expect(result).toMatchObject({
			ok: false,
			error: { code: "submit_branch_pr_lookup_parse_failed" },
		});
		runner.assertDone();
	});

	test("reports GitHub PR lookup command errors actionably", async () => {
		const graphite = new FakeGraphiteStackGateway();
		const runner = new ScriptedCommandRunner([
			step(
				"gh",
				prListArgs("feature/current"),
				exitedResult({ code: 1, stderr: "GitHub unavailable\n" }),
			),
		]);

		const result = await createGateway(graphite, runner).inspectSubmitStack({ cwd: "/repo" });

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "submit_branch_pr_lookup_failed",
				message: "Could not query open GitHub PRs for branch feature/current.",
			},
		});
		runner.assertDone();
	});

	test("amends the current branch without --into while keeping message args", async () => {
		const graphite = new FakeGraphiteStackGateway();
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				["modify", "--no-interactive", "-m", "Generated title", "-m", "Generated body"],
				exitedResult({ stdout: "Modified\n" }),
			),
		]);
		const gateway = createGateway(graphite, runner);

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
		const graphite = new FakeGraphiteStackGateway();
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
		const gateway = createGateway(graphite, runner);

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
