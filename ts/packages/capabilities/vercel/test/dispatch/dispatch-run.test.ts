import { describe, expect, it } from "vitest";

import {
	buildDispatchLandingCommand,
	DISPATCH_GRACE_SECONDS,
	DISPATCH_LANDING_TOKEN_ENV_NAME,
	DISPATCH_POLL_SECONDS,
	DISPATCH_PROMPT_MAX_CHARS,
	DISPATCH_RUN_BUDGET_SECONDS,
	DISPATCH_SANDBOX_TIMEOUT_MARGIN_SECONDS,
	DISPATCH_SUMMARY_MAX_CHARS,
	executeDispatchRun,
	isValidDispatchAnchorBranch,
	parseDispatchHarnessResult,
	planDispatchSupervision,
	resolveDispatchDisposition,
	validateDispatchRunInput,
	type DispatchLandingResult,
	type DispatchLaunchResult,
	type DispatchOutcomeReadResult,
	type DispatchReportResult,
	type DispatchRunInput,
	type DispatchRunSteps,
} from "../../src/dispatch/dispatch-run.ts";
import type {
	SupervisionCleanupResult,
	SupervisionPollResult,
} from "../../src/sandbox/supervision.ts";

const revision = "0123456789ABCDEF0123456789abcdef01234567";

function input(overrides: Partial<DispatchRunInput> = {}): DispatchRunInput {
	return {
		revision,
		anchorBranch: "dispatch/widget-refactor-a1b2c3",
		anchorPrNumber: 421,
		prompt: "Rename the widget gateway methods.",
		...overrides,
	};
}

describe("validateDispatchRunInput", () => {
	it("accepts a valid run input and normalizes the revision to lowercase", () => {
		const result = validateDispatchRunInput(input());

		expect(result).toEqual({
			ok: true,
			value: { ...input(), revision: revision.toLowerCase() },
		});
	});

	it.each([
		["short revision", { revision: "abc123" }],
		["non-hex revision", { revision: "z".repeat(40) }],
		["branch ref revision", { revision: "main" }],
		["zero PR number", { anchorPrNumber: 0 }],
		["negative PR number", { anchorPrNumber: -1 }],
		["fractional PR number", { anchorPrNumber: 4.2 }],
		["empty prompt", { prompt: "" }],
		["oversized prompt", { prompt: "x".repeat(DISPATCH_PROMPT_MAX_CHARS + 1) }],
	])("rejects a run input with a %s", (_label, overrides) => {
		const result = validateDispatchRunInput(input(overrides));

		expect(result.ok).toBe(false);
	});
});

describe("isValidDispatchAnchorBranch", () => {
	it.each(["dispatch/widget", "dispatch/widget-refactor-a1b2c3", "dispatch/feature/nested_1.2"])(
		"accepts %s",
		(name) => {
			expect(isValidDispatchAnchorBranch(name)).toBe(true);
		},
	);

	it.each([
		["missing prefix", "feature/widget"],
		["prefix only", "dispatch/"],
		["bare prefix word", "dispatch"],
		["space (shell safety)", "dispatch/widget refactor"],
		["quote (shell safety)", 'dispatch/widget"x'],
		["dollar (shell safety)", "dispatch/widget$TOKEN"],
		["semicolon (shell safety)", "dispatch/widget;ls"],
		["double dot", "dispatch/widget..other"],
		["empty segment", "dispatch//widget"],
		["dot-leading segment", "dispatch/.hidden"],
		["lock-suffixed segment", "dispatch/widget.lock"],
		["trailing slash", "dispatch/widget/"],
		["trailing dot", "dispatch/widget."],
		["over-long name", `dispatch/${"a".repeat(200)}`],
	])("rejects a name with a %s", (_label, name) => {
		expect(isValidDispatchAnchorBranch(name)).toBe(false);
	});
});

describe("planDispatchSupervision", () => {
	it("derives the fixed plan from the run budget and poll cadence", () => {
		expect(planDispatchSupervision()).toEqual({
			pollIntervalMs: DISPATCH_POLL_SECONDS * 1000,
			maxPolls: Math.ceil(
				(DISPATCH_RUN_BUDGET_SECONDS + DISPATCH_GRACE_SECONDS) / DISPATCH_POLL_SECONDS,
			),
			sandboxTimeoutMs:
				(DISPATCH_RUN_BUDGET_SECONDS + DISPATCH_SANDBOX_TIMEOUT_MARGIN_SECONDS) * 1000,
		});
	});

	it("keeps the sandbox timeout under the 5-hour sandbox cap", () => {
		expect(planDispatchSupervision().sandboxTimeoutMs).toBeLessThan(5 * 3600 * 1000);
	});
});

describe("parseDispatchHarnessResult", () => {
	it("treats a missing file as still running", () => {
		expect(parseDispatchHarnessResult(null)).toEqual({ phase: "running" });
	});

	it("parses a completed result with a summary", () => {
		expect(
			parseDispatchHarnessResult('{"outcome":"completed","summary":"Renamed 4 methods."}'),
		).toEqual({ phase: "finished", outcome: "completed", summary: "Renamed 4 methods." });
	});

	it("parses a failed result without a summary", () => {
		expect(parseDispatchHarnessResult('{"outcome":"failed"}')).toEqual({
			phase: "finished",
			outcome: "failed",
		});
	});

	it("tolerates extra keys so the harness contract can grow", () => {
		expect(parseDispatchHarnessResult('{"outcome":"completed","extra":1}')).toEqual({
			phase: "finished",
			outcome: "completed",
		});
	});

	it("caps an oversized summary", () => {
		const summary = "x".repeat(DISPATCH_SUMMARY_MAX_CHARS + 100);
		const parsed = parseDispatchHarnessResult(JSON.stringify({ outcome: "completed", summary }));

		expect(parsed).toEqual({
			phase: "finished",
			outcome: "completed",
			summary: "x".repeat(DISPATCH_SUMMARY_MAX_CHARS),
		});
	});

	it.each([
		["non-JSON content", "done"],
		["a JSON array", "[]"],
		["a JSON scalar", "42"],
		["an unknown outcome", '{"outcome":"maybe"}'],
		["a missing outcome", '{"summary":"s"}'],
		["a non-string summary", '{"outcome":"completed","summary":7}'],
	])("treats %s as invalid", (_label, content) => {
		expect(parseDispatchHarnessResult(content)).toEqual({ phase: "invalid" });
	});
});

describe("buildDispatchLandingCommand", () => {
	it("force-pushes HEAD to the anchor ref with the token taken from the command environment", () => {
		const command = buildDispatchLandingCommand({
			repository: "nseng-ai/ns",
			anchorBranch: "dispatch/widget-refactor-a1b2c3",
		});

		expect(command).toEqual({
			cmd: "sh",
			args: [
				"-c",
				'git push --force "https://x-access-token:$NS_DISPATCH_LANDING_TOKEN@github.com/' +
					'nseng-ai/ns.git" "HEAD:refs/heads/dispatch/widget-refactor-a1b2c3"',
			],
		});
		expect(command.args[1]).toContain(`$${DISPATCH_LANDING_TOKEN_ENV_NAME}`);
	});
});

interface StepCall {
	readonly step: string;
	readonly args?: unknown;
}

interface FakeStepBehavior {
	readonly launch?: DispatchLaunchResult;
	readonly polls?: readonly SupervisionPollResult[];
	readonly readOutcome?: DispatchOutcomeReadResult;
	readonly land?: DispatchLandingResult;
	readonly cleanup?: SupervisionCleanupResult;
	readonly reportLanded?: DispatchReportResult;
	readonly reportFailure?: DispatchReportResult;
}

function createFakeSteps(behavior: FakeStepBehavior = {}): {
	readonly steps: DispatchRunSteps;
	readonly calls: StepCall[];
} {
	const calls: StepCall[] = [];
	let pollIndex = 0;
	const polls = behavior.polls ?? [{ ok: true, phase: "done" }];
	const steps: DispatchRunSteps = {
		async sleep(durationMs) {
			calls.push({ step: "sleep", args: durationMs });
		},
		async launch(run) {
			calls.push({ step: "launch", args: run });
			return behavior.launch ?? { ok: true, sandboxName: "sbx_dispatch" };
		},
		async poll(sandboxName) {
			calls.push({ step: "poll", args: sandboxName });
			const result = polls[Math.min(pollIndex, polls.length - 1)];
			pollIndex += 1;
			if (result === undefined) throw new Error("no poll behavior");
			return result;
		},
		async readOutcome(sandboxName) {
			calls.push({ step: "readOutcome", args: sandboxName });
			return behavior.readOutcome ?? { ok: true, outcome: "completed", decisionLog: "- chose A" };
		},
		async land(options) {
			calls.push({ step: "land", args: options });
			return behavior.land ?? { ok: true };
		},
		async cleanup(sandboxName) {
			calls.push({ step: "cleanup", args: sandboxName });
			return behavior.cleanup ?? { ok: true };
		},
		async reportLanded(options) {
			calls.push({ step: "reportLanded", args: options });
			return behavior.reportLanded ?? { ok: true };
		},
		async reportFailure(options) {
			calls.push({ step: "reportFailure", args: options });
			return behavior.reportFailure ?? { ok: true };
		},
	};
	return { steps, calls };
}

function stepNames(calls: readonly StepCall[]): readonly string[] {
	return calls.map((call) => call.step);
}

describe("executeDispatchRun", () => {
	it("rejects invalid input before any step runs and does not report to the untrusted anchor", async () => {
		const { steps, calls } = createFakeSteps();

		const result = await executeDispatchRun(input({ revision: "main" }), steps);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected invalid input.");
		expect(result.code).toBe("invalid-input");
		expect(result.failureReported).toBe(false);
		expect(calls).toEqual([]);
	});

	it("lands a completed run, cleans up, and publishes the decision log", async () => {
		const { steps, calls } = createFakeSteps({
			polls: [
				{ ok: true, phase: "running" },
				{ ok: true, phase: "done" },
			],
		});

		const result = await executeDispatchRun(input(), steps);

		expect(result).toEqual({
			ok: true,
			sandboxName: "sbx_dispatch",
			anchorBranch: "dispatch/widget-refactor-a1b2c3",
			anchorPrNumber: 421,
			polls: 2,
			decisionLogPublished: true,
		});
		expect(stepNames(calls)).toEqual([
			"launch",
			"sleep",
			"poll",
			"sleep",
			"poll",
			"readOutcome",
			"land",
			"cleanup",
			"reportLanded",
		]);
		expect(calls[0]?.args).toEqual({ ...input(), revision: revision.toLowerCase() });
		expect(calls[6]?.args).toEqual({
			sandboxName: "sbx_dispatch",
			anchorBranch: "dispatch/widget-refactor-a1b2c3",
		});
		expect(calls[8]?.args).toEqual({ anchorPrNumber: 421, decisionLog: "- chose A" });
	});

	it("reports a launch failure on the anchor PR without polling or cleanup", async () => {
		const { steps, calls } = createFakeSteps({
			launch: { ok: false, code: "launch-failed", message: "Sandbox creation failed." },
		});

		const result = await executeDispatchRun(input(), steps);

		expect(result).toEqual({
			ok: false,
			code: "launch-failed",
			message: "Sandbox creation failed.",
			anchorBranch: "dispatch/widget-refactor-a1b2c3",
			anchorPrNumber: 421,
			failureReported: true,
		});
		expect(stepNames(calls)).toEqual(["launch", "reportFailure"]);
		expect(calls[1]?.args).toEqual({
			anchorBranch: "dispatch/widget-refactor-a1b2c3",
			anchorPrNumber: 421,
			code: "launch-failed",
			message: "Sandbox creation failed.",
		});
	});

	it("cleans up a post-create launch failure before reporting", async () => {
		const { steps, calls } = createFakeSteps({
			launch: {
				ok: false,
				code: "launch-failed",
				message: "Detached harness launch failed.",
				sandboxName: "sbx_dispatch",
			},
		});

		const result = await executeDispatchRun(input(), steps);

		expect(result).toMatchObject({
			ok: false,
			code: "launch-failed",
			sandboxName: "sbx_dispatch",
			failureReported: true,
		});
		expect(stepNames(calls)).toEqual(["launch", "cleanup", "reportFailure"]);
	});

	it("gives cleanup failure precedence over a post-create launch failure", async () => {
		const { steps } = createFakeSteps({
			launch: {
				ok: false,
				code: "launch-failed",
				message: "Detached harness launch failed.",
				sandboxName: "sbx_dispatch",
			},
			cleanup: {
				ok: false,
				code: "sandbox-cleanup-failed",
				message: "Sandbox cleanup failed.",
			},
		});

		const result = await executeDispatchRun(input(), steps);

		expect(result).toMatchObject({ ok: false, code: "sandbox-cleanup-failed" });
	});

	it("does not land a run whose harness reported failure, but still cleans up and reports", async () => {
		const { steps, calls } = createFakeSteps({
			readOutcome: { ok: true, outcome: "failed", summary: "tests failed", decisionLog: null },
		});

		const result = await executeDispatchRun(input(), steps);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("harness-failed");
		expect(result.message).toContain("tests failed");
		expect(result.failureReported).toBe(true);
		expect(stepNames(calls)).toEqual([
			"launch",
			"sleep",
			"poll",
			"readOutcome",
			"cleanup",
			"reportFailure",
		]);
	});

	it("cleans up and reports when a poll fails", async () => {
		const { steps, calls } = createFakeSteps({
			polls: [{ ok: false, code: "poll-failed", message: "Dispatch result read failed." }],
		});

		const result = await executeDispatchRun(input(), steps);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("poll-failed");
		expect(stepNames(calls)).toEqual([
			"launch",
			"sleep",
			"poll",
			"sleep",
			"poll",
			"cleanup",
			"reportFailure",
		]);
	});

	it("times out a run that never reports done, cleans up, and reports", async () => {
		const { steps, calls } = createFakeSteps({
			polls: [{ ok: true, phase: "running" }],
		});

		const result = await executeDispatchRun(input(), steps);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("run-timed-out");
		expect(result.polls).toBe(planDispatchSupervision().maxPolls);
		expect(stepNames(calls).filter((name) => name === "poll")).toHaveLength(
			planDispatchSupervision().maxPolls,
		);
		expect(stepNames(calls).slice(-2)).toEqual(["cleanup", "reportFailure"]);
	});

	it("reports a landing failure after cleanup", async () => {
		const { steps, calls } = createFakeSteps({
			land: { ok: false, code: "landing-failed", message: "Landing push failed." },
		});

		const result = await executeDispatchRun(input(), steps);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("landing-failed");
		expect(stepNames(calls)).toEqual([
			"launch",
			"sleep",
			"poll",
			"readOutcome",
			"land",
			"cleanup",
			"reportFailure",
		]);
	});

	it("keeps the run successful when only the decision-log publish fails", async () => {
		const { steps } = createFakeSteps({ reportLanded: { ok: false } });

		const result = await executeDispatchRun(input(), steps);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("Expected success.");
		expect(result.decisionLogPublished).toBe(false);
	});

	it("records an unreported failure when the failure comment cannot be posted", async () => {
		const { steps } = createFakeSteps({
			readOutcome: { ok: true, outcome: "failed", decisionLog: null },
			reportFailure: { ok: false },
		});

		const result = await executeDispatchRun(input(), steps);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.failureReported).toBe(false);
	});
});

describe("resolveDispatchDisposition", () => {
	const completedOutcome = { completed: true, polls: 3 } as const;
	const completedHarvest: DispatchOutcomeReadResult = {
		ok: true,
		outcome: "completed",
		decisionLog: "- chose A",
	};

	it("prefers a cleanup failure over everything else and names the already-landed commits", () => {
		const disposition = resolveDispatchDisposition({
			outcome: completedOutcome,
			harvest: completedHarvest,
			landing: { ok: true },
			cleanup: { ok: false, code: "sandbox-cleanup-failed", message: "Sandbox cleanup failed." },
		});

		expect(disposition).toEqual({
			kind: "failed",
			code: "sandbox-cleanup-failed",
			message: "Sandbox cleanup failed after the produced commits landed on the anchor branch.",
		});
	});

	it("maps an unreadable outcome to outcome-read-failed", () => {
		const disposition = resolveDispatchDisposition({
			outcome: completedOutcome,
			harvest: { ok: false },
			landing: null,
			cleanup: { ok: true },
		});

		expect(disposition).toEqual({
			kind: "failed",
			code: "outcome-read-failed",
			message: "Reading the dispatched run's outcome failed.",
		});
	});

	it("maps an invalid harness result to harness-result-invalid", () => {
		const disposition = resolveDispatchDisposition({
			outcome: completedOutcome,
			harvest: { ok: true, outcome: "invalid", decisionLog: null },
			landing: null,
			cleanup: { ok: true },
		});

		expect(disposition).toEqual({
			kind: "failed",
			code: "harness-result-invalid",
			message: "The dispatched harness run finished without a valid result.",
		});
	});

	it("lands a completed, pushed, cleaned run with its decision log", () => {
		const disposition = resolveDispatchDisposition({
			outcome: completedOutcome,
			harvest: completedHarvest,
			landing: { ok: true },
			cleanup: { ok: true },
		});

		expect(disposition).toEqual({ kind: "landed", decisionLog: "- chose A" });
	});
});
