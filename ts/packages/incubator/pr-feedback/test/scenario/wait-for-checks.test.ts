import { describe, expect, test } from "vitest";

import { createManualClock, type ManualClock } from "@nseng-ai/foundation/time/testing";
import { TimerScheduler, type ScheduledTimer } from "@nseng-ai/foundation/timers";

import type { GithubStatusChecks } from "../../src/api.ts";
import {
	InMemoryGithubPrFeedbackGateway,
	prSummary,
	SequencedBranchPrChecksGateway,
	type InMemoryPrFeedbackState,
} from "../support/in-memory-pr-address-gateways.ts";
import { runScenario } from "../support/run-scenario.ts";

interface MachineEnvelope {
	exitCode: number;
	data?: WaitForChecksData;
	message?: string;
	errorType?: string;
}

interface WaitForChecksData {
	outcome: "passing" | "failing" | "timeout" | "mapping-gap";
	polls: number;
	waitedMs: number;
	counts: { passing: number; pending: number; failing: number; cancelled: number };
	entries: Array<{ branch: string; status: string }>;
	summary: { requested: number; matched: number; missing: number; ambiguous: number };
}

/**
 * Test-only scheduler: each requested sleep advances the shared manual clock by
 * the full delay and fires on a microtask, so multi-poll waits run with zero
 * real sleeping.
 */
class ImmediateDelayTimers extends TimerScheduler {
	readonly delays: number[] = [];
	private readonly manualClock: ManualClock;

	constructor(manualClock: ManualClock) {
		super();
		this.manualClock = manualClock;
	}

	setTimeout(callback: () => void, delayMs: number): ScheduledTimer {
		this.delays.push(delayMs);
		this.manualClock.advanceMs(delayMs);
		queueMicrotask(callback);
		return { cancel: () => {} };
	}

	setInterval(): ScheduledTimer {
		throw new Error("wait-for-checks scenarios never use setInterval");
	}
}

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

function stackState(byPr: Record<number, GithubStatusChecks>): InMemoryPrFeedbackState {
	return {
		prs: [
			prSummary({ number: 11, headRefName: "feature-a", baseRefName: "master" }),
			prSummary({ number: 12, headRefName: "feature-b", baseRefName: "feature-a" }),
		],
		checks: byPr,
	};
}

function waitArgs(args: readonly string[] = []): string[] {
	return ["exec", "wait-for-checks", ...args, "--format", "json"];
}

const STACK_BRANCHES = JSON.stringify({ branches: ["feature-a", "feature-b"] });

function parseEnvelope(run: Awaited<ReturnType<typeof runScenario>>): MachineEnvelope {
	return JSON.parse(run.stdout.join("")) as MachineEnvelope;
}

describe("ns address exec wait-for-checks", () => {
	test("returns outcome passing with exit 0 when every check has concluded green", async () => {
		const run = runScenario(waitArgs(), {
			prFeedback: new InMemoryGithubPrFeedbackGateway(
				stackState({ 11: checks({ passing: 2 }), 12: checks({ passing: 1 }) }),
			),
			stdin: STACK_BRANCHES,
		});
		expect(await run.exit).toBe(0);
		const envelope = parseEnvelope(run);
		expect(envelope.exitCode).toBe(0);
		expect(envelope.data?.outcome).toBe("passing");
		expect(envelope.data?.polls).toBe(1);
		expect(envelope.data?.counts).toEqual({
			passing: 3,
			pending: 0,
			failing: 0,
			cancelled: 0,
			unknown: 0,
			hasMore: false,
		});
		expect(envelope.data?.entries.map((entry) => entry.branch)).toEqual(["feature-a", "feature-b"]);
		expect(envelope.data?.summary).toEqual({ requested: 2, matched: 2, missing: 0, ambiguous: 0 });
	});

	test("returns outcome failing with semantic exit 1 naming the failing branches", async () => {
		const run = runScenario(waitArgs(), {
			prFeedback: new InMemoryGithubPrFeedbackGateway(
				stackState({ 11: checks({ failing: 1, pending: 2 }), 12: checks({ passing: 1 }) }),
			),
			stdin: STACK_BRANCHES,
		});
		expect(await run.exit).toBe(1);
		const envelope = parseEnvelope(run);
		expect(envelope.exitCode).toBe(1);
		expect(envelope.message).toBe("PR checks concluded with failures for branches: feature-a");
		expect(envelope.data?.outcome).toBe("failing");
		expect(envelope.data?.polls).toBe(1);
	});

	test("polls on the requested interval until pending checks conclude", async () => {
		const manualClock = createManualClock(0);
		const timers = new ImmediateDelayTimers(manualClock);
		const run = runScenario(waitArgs(["--interval-seconds", "30"]), {
			prFeedback: new SequencedBranchPrChecksGateway([
				stackState({ 11: checks({ pending: 1 }) }),
				stackState({ 11: checks({ passing: 1, pending: 1 }) }),
				stackState({ 11: checks({ passing: 2 }), 12: checks({ passing: 1 }) }),
			]),
			clock: manualClock.clock,
			timers,
			stdin: STACK_BRANCHES,
		});
		expect(await run.exit).toBe(0);
		const envelope = parseEnvelope(run);
		expect(envelope.data?.outcome).toBe("passing");
		expect(envelope.data?.polls).toBe(3);
		expect(envelope.data?.waitedMs).toBe(60_000);
		expect(timers.delays).toEqual([30_000, 30_000]);
	});

	test("returns outcome timeout with exit 1 when checks stay pending past the deadline", async () => {
		const manualClock = createManualClock(0);
		const timers = new ImmediateDelayTimers(manualClock);
		const run = runScenario(waitArgs(["--timeout-seconds", "30", "--interval-seconds", "15"]), {
			prFeedback: new SequencedBranchPrChecksGateway([stackState({ 11: checks({ pending: 1 }) })]),
			clock: manualClock.clock,
			timers,
			stdin: STACK_BRANCHES,
		});
		expect(await run.exit).toBe(1);
		const envelope = parseEnvelope(run);
		expect(envelope.message).toBe(
			"Timed out after 30s waiting for PR checks to settle; still pending: feature-a",
		);
		expect(envelope.data?.outcome).toBe("timeout");
		expect(envelope.data?.polls).toBe(3);
		expect(envelope.data?.waitedMs).toBe(30_000);
	});

	test("returns outcome mapping-gap immediately with the sibling gaps message", async () => {
		const run = runScenario(waitArgs(), {
			prFeedback: new InMemoryGithubPrFeedbackGateway({
				prs: [prSummary({ number: 11, headRefName: "feature-a" })],
				checks: { 11: checks({ pending: 1 }) },
			}),
			stdin: JSON.stringify({ branches: ["feature-a", "no-such-branch"] }),
		});
		expect(await run.exit).toBe(1);
		const envelope = parseEnvelope(run);
		expect(envelope.message).toBe("No open PR found for branches: no-such-branch");
		expect(envelope.data?.outcome).toBe("mapping-gap");
		expect(envelope.data?.polls).toBe(1);
	});

	test("accepts the payload via --branches-json", async () => {
		const run = runScenario(
			waitArgs(["--branches-json", JSON.stringify({ branches: ["feature-a"] })]),
			{
				prFeedback: new InMemoryGithubPrFeedbackGateway(stackState({ 11: checks({ passing: 1 }) })),
			},
		);
		expect(await run.exit).toBe(0);
		expect(parseEnvelope(run).data?.entries.map((entry) => entry.branch)).toEqual(["feature-a"]);
	});

	test("rejects an empty branches array with invalid-request", async () => {
		const run = runScenario(waitArgs(), {
			prFeedback: new InMemoryGithubPrFeedbackGateway(),
			stdin: JSON.stringify({ branches: [] }),
		});
		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run);
		expect(envelope.errorType).toBe("invalid-request");
		expect(envelope.message).toBe("wait-for-checks requires at least one branch.");
	});

	test("rejects malformed JSON with invalid-json", async () => {
		const run = runScenario(waitArgs(), {
			prFeedback: new InMemoryGithubPrFeedbackGateway(),
			stdin: "{not json",
		});
		expect(await run.exit).toBe(2);
		expect(parseEnvelope(run).errorType).toBe("invalid-json");
	});

	test("rejects a non-positive interval as a usage error before any polling", async () => {
		const prFeedback = new SequencedBranchPrChecksGateway([
			stackState({ 11: checks({ pending: 1 }) }),
		]);
		const run = runScenario(waitArgs(["--interval-seconds", "0"]), {
			prFeedback,
			stdin: STACK_BRANCHES,
		});
		expect(await run.exit).toBe(2);
		expect(prFeedback.polls).toBe(0);
	});

	test("publishes the default timeout and interval in --json-schema", async () => {
		const run = runScenario(["exec", "wait-for-checks", "--json-schema"]);
		expect(await run.exit).toBe(0);
		const document = JSON.parse(run.stdout.join("")) as {
			inputJsonSchema: { properties: Record<string, { default?: number }> };
		};
		expect(document.inputJsonSchema.properties["timeoutSeconds"]?.default).toBe(900);
		expect(document.inputJsonSchema.properties["intervalSeconds"]?.default).toBe(15);
	});

	test("maps a batched gateway failure to pr-gateway-failure", async () => {
		const run = runScenario(waitArgs(), {
			prFeedback: new InMemoryGithubPrFeedbackGateway({
				branchPrChecksFailure: {
					code: "github_pr_feedback_gh_failed",
					message: "gh: network down",
					details: {
						operation: "getBranchPrChecks",
						stderr: "gh: network down",
						stdout: "",
						exitCode: 1,
					},
				},
			}),
			stdin: STACK_BRANCHES,
		});
		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run);
		expect(envelope.errorType).toBe("pr-gateway-failure");
		expect(envelope.message).toBe("Failed to fetch branch PR checks: gh: network down");
	});
});
