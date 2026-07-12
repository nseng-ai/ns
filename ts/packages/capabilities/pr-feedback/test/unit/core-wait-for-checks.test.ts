import { describe, expect, test } from "vitest";

import {
	createManualTimerHarness,
	type ManualTimerHarness,
} from "@nseng-ai/foundation/time/testing";

import type { GithubStatusChecks, PrAddressGithubGateway } from "../../src/api.ts";
import { waitForBranchPrChecks, type WaitForChecksResult } from "../../src/core/wait-for-checks.ts";
import {
	fakePrFeedbackFailure,
	InMemoryGithubPrFeedbackGateway,
	prSummary,
	SequencedBranchPrChecksGateway,
	type InMemoryPrFeedbackState,
} from "../support/in-memory-pr-address-gateways.ts";

function checks(counts: Partial<GithubStatusChecks["counts"]> = {}): GithubStatusChecks {
	return {
		counts: {
			passing: 0,
			pending: 0,
			failing: 0,
			cancelled: 0,
			unknown: 0,
			hasMore: false,
			...counts,
		},
		checks: [],
	};
}

function stateWithChecks(byPr: Record<number, GithubStatusChecks>): InMemoryPrFeedbackState {
	return {
		prs: [
			prSummary({ number: 11, headRefName: "feature-a" }),
			prSummary({ number: 12, headRefName: "feature-b" }),
		],
		checks: byPr,
	};
}

function startWait(options: {
	prFeedback: PrAddressGithubGateway;
	harness: ManualTimerHarness;
	branches?: readonly string[];
	timeoutMs?: number;
	intervalMs?: number;
}): Promise<WaitForChecksResult> {
	return waitForBranchPrChecks({
		branches: options.branches ?? ["feature-a", "feature-b"],
		prFeedback: options.prFeedback,
		gatewayOptions: { cwd: "/repo", env: {} },
		clock: options.harness.clock,
		timers: options.harness.timers,
		timeoutMs: options.timeoutMs ?? 900_000,
		intervalMs: options.intervalMs ?? 15_000,
	});
}

async function drainMicrotasks(): Promise<void> {
	for (let i = 0; i < 32; i += 1) await Promise.resolve();
}

/** Drive the manual harness until the wait settles; every sleep fires its due timer. */
async function settledResult(
	harness: ManualTimerHarness,
	promise: Promise<WaitForChecksResult>,
): Promise<WaitForChecksResult> {
	let settled: WaitForChecksResult | undefined;
	void promise.then((value) => {
		settled = value;
	});
	for (let i = 0; i < 1000; i += 1) {
		await drainMicrotasks();
		if (settled !== undefined) return settled;
		if (harness.pendingTimerCount() === 0)
			throw new Error("wait stalled without a scheduled timer");
		harness.runNextTimer();
	}
	throw new Error("wait did not settle after 1000 timer rounds");
}

function reportOf(result: WaitForChecksResult) {
	if (result.type !== "ok") throw new Error(`expected ok result, got ${result.type}`);
	return result.report;
}

describe("waitForBranchPrChecks", () => {
	test("reports passing on the first poll without sleeping when no checks are pending", async () => {
		const harness = createManualTimerHarness(1_000);
		const prFeedback = new InMemoryGithubPrFeedbackGateway(
			stateWithChecks({ 11: checks({ passing: 2 }), 12: checks({ passing: 1 }) }),
		);
		const report = reportOf(await startWait({ prFeedback, harness }));
		expect(report.outcome).toBe("passing");
		expect(report.polls).toBe(1);
		expect(report.waitedMs).toBe(0);
		expect(report.counts).toEqual({
			passing: 3,
			pending: 0,
			failing: 0,
			cancelled: 0,
			unknown: 0,
			hasMore: false,
		});
		expect(harness.pendingTimerCount()).toBe(0);
	});

	test("short-circuits to failing as soon as a failing check is observed", async () => {
		const harness = createManualTimerHarness(1_000);
		const prFeedback = new InMemoryGithubPrFeedbackGateway(
			stateWithChecks({ 11: checks({ failing: 1, pending: 3 }) }),
		);
		const report = reportOf(await startWait({ prFeedback, harness }));
		expect(report.outcome).toBe("failing");
		expect(report.polls).toBe(1);
		expect(report.counts.failing).toBe(1);
		expect(report.counts.pending).toBe(3);
	});

	test("treats a cancelled check as a failing settle", async () => {
		const harness = createManualTimerHarness(1_000);
		const prFeedback = new InMemoryGithubPrFeedbackGateway(
			stateWithChecks({ 11: checks({ cancelled: 1, pending: 2 }) }),
		);
		const report = reportOf(await startWait({ prFeedback, harness }));
		expect(report.outcome).toBe("failing");
		expect(report.polls).toBe(1);
	});

	test("keeps polling on the interval until pending checks conclude", async () => {
		const harness = createManualTimerHarness(0);
		const prFeedback = new SequencedBranchPrChecksGateway([
			stateWithChecks({ 11: checks({ pending: 2 }) }),
			stateWithChecks({ 11: checks({ passing: 1, pending: 1 }) }),
			stateWithChecks({ 11: checks({ passing: 2 }), 12: checks({ passing: 1 }) }),
		]);
		const report = reportOf(await settledResult(harness, startWait({ prFeedback, harness })));
		expect(report.outcome).toBe("passing");
		expect(report.polls).toBe(3);
		expect(report.waitedMs).toBe(30_000);
		expect(prFeedback.polls).toBe(3);
	});

	test("times out once the deadline passes while checks stay pending", async () => {
		const harness = createManualTimerHarness(0);
		const prFeedback = new SequencedBranchPrChecksGateway([
			stateWithChecks({ 11: checks({ pending: 1 }) }),
		]);
		const report = reportOf(
			await settledResult(
				harness,
				startWait({ prFeedback, harness, timeoutMs: 30_000, intervalMs: 15_000 }),
			),
		);
		expect(report.outcome).toBe("timeout");
		expect(report.polls).toBe(3);
		expect(report.waitedMs).toBe(30_000);
		expect(report.counts.pending).toBe(1);
	});

	test("reports a mapping gap immediately instead of waiting", async () => {
		const harness = createManualTimerHarness(1_000);
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			prs: [prSummary({ number: 11, headRefName: "feature-a" })],
			checks: { 11: checks({ pending: 1 }) },
		});
		const report = reportOf(
			await startWait({ prFeedback, harness, branches: ["feature-a", "no-such-branch"] }),
		);
		expect(report.outcome).toBe("mapping-gap");
		expect(report.polls).toBe(1);
		expect(report.summary).toEqual({ requested: 2, matched: 1, missing: 1, ambiguous: 0 });
		expect(harness.pendingTimerCount()).toBe(0);
	});

	test("propagates a gateway failure instead of retrying", async () => {
		const harness = createManualTimerHarness(1_000);
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			branchPrChecksFailure: fakePrFeedbackFailure("gh: network down", "getBranchPrChecks"),
		});
		const result = await startWait({ prFeedback, harness });
		expect(result.type).toBe("failure");
		if (result.type === "failure") {
			expect(result.message).toBe("Failed to fetch branch PR checks");
		}
		expect(harness.pendingTimerCount()).toBe(0);
	});
});
