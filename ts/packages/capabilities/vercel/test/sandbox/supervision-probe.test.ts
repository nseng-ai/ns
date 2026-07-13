import { describe, expect, it } from "vitest";

import {
	buildSupervisionProbeCommand,
	combineSupervisionProbeResult,
	parseSupervisionProgress,
	planSupervisionProbe,
	superviseDetachedRun,
	SUPERVISION_DONE_MARKER,
	SUPERVISION_PROGRESS_PATH,
	SUPERVISION_RUN_SECONDS_MAX,
	SUPERVISION_TICK_SECONDS,
	type SupervisionPlan,
	type SupervisionPollResult,
} from "../../src/sandbox/supervision-probe.ts";

const FIVE_HOUR_SANDBOX_CAP_MS = 5 * 60 * 60 * 1000;

describe("planSupervisionProbe", () => {
	it("derives the poll interval, poll budget, and sandbox timeout from valid parameters", () => {
		const result = planSupervisionProbe({ runSeconds: 840, pollSeconds: 30 });

		expect(result).toEqual({
			ok: true,
			value: {
				pollIntervalMs: 30_000,
				// ceil((840 + 60 grace) / 30)
				maxPolls: 30,
				// (840 + 600 margin) * 1000
				sandboxTimeoutMs: 1_440_000,
			},
		});
	});

	it("keeps the sandbox timeout above the longest allowed run and well under the 5-hour cap", () => {
		const result = planSupervisionProbe({
			runSeconds: SUPERVISION_RUN_SECONDS_MAX,
			pollSeconds: 300,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("Expected a plan.");
		expect(result.value.sandboxTimeoutMs).toBeGreaterThan(SUPERVISION_RUN_SECONDS_MAX * 1000);
		expect(result.value.sandboxTimeoutMs).toBeLessThan(FIVE_HOUR_SANDBOX_CAP_MS / 4);
	});

	it.each([
		["runSeconds below the minimum", { runSeconds: 9, pollSeconds: 30 }],
		["runSeconds above the maximum", { runSeconds: 3601, pollSeconds: 30 }],
		["non-integer runSeconds", { runSeconds: 60.5, pollSeconds: 30 }],
		["pollSeconds below the minimum", { runSeconds: 60, pollSeconds: 4 }],
		["pollSeconds above the maximum", { runSeconds: 60, pollSeconds: 301 }],
		["non-integer pollSeconds", { runSeconds: 60, pollSeconds: 7.5 }],
	])("rejects %s", (_label, params) => {
		const result = planSupervisionProbe(params);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected invalid parameters.");
		expect(result.code).toBe("invalid-parameters");
	});
});

describe("buildSupervisionProbeCommand", () => {
	it("builds the fixed tick-appending shell command for a validated run length", () => {
		const command = buildSupervisionProbeCommand(840);

		expect(command.cmd).toBe("sh");
		expect(command.args).toHaveLength(2);
		expect(command.args[0]).toBe("-c");
		const script = command.args[1] ?? "";
		expect(script).toContain("$(date +%s) + 840");
		expect(script).toContain(`sleep ${SUPERVISION_TICK_SECONDS}`);
		expect(script).toContain(SUPERVISION_PROGRESS_PATH);
		expect(script).toContain(SUPERVISION_DONE_MARKER);
	});
});

describe("parseSupervisionProgress", () => {
	it("treats a missing file as a run that has not ticked yet", () => {
		expect(parseSupervisionProgress(null)).toEqual({ phase: "running", ticks: 0 });
	});

	it("treats an empty file as a run that has not ticked yet", () => {
		expect(parseSupervisionProgress("")).toEqual({ phase: "running", ticks: 0 });
	});

	it("counts progress ticks while the run is still going", () => {
		expect(parseSupervisionProgress("tick 1\ntick 2\ntick 3\n")).toEqual({
			phase: "running",
			ticks: 3,
		});
	});

	it("reports done once the completion marker appears", () => {
		expect(parseSupervisionProgress(`tick 1\ntick 2\n${SUPERVISION_DONE_MARKER}\n`)).toEqual({
			phase: "done",
			ticks: 2,
		});
	});

	it("ignores unrecognized lines rather than failing the poll", () => {
		expect(parseSupervisionProgress("tick 1\ngarbage\ntick 2\n")).toEqual({
			phase: "running",
			ticks: 2,
		});
	});
});

describe("superviseDetachedRun", () => {
	const plan: SupervisionPlan = {
		pollIntervalMs: 30_000,
		maxPolls: 4,
		sandboxTimeoutMs: 1_440_000,
	};

	function deps(polls: readonly SupervisionPollResult[]): {
		sleeps: number[];
		sleep(durationMs: number): Promise<void>;
		poll(): Promise<SupervisionPollResult>;
	} {
		const remaining = [...polls];
		const sleeps: number[] = [];
		return {
			sleeps,
			async sleep(durationMs) {
				sleeps.push(durationMs);
			},
			async poll() {
				const next = remaining.shift();
				if (next === undefined) throw new Error("Polled past the scripted results.");
				return next;
			},
		};
	}

	it("sleeps one poll interval before every poll and completes when the run reports done", async () => {
		const supervision = deps([
			{ ok: true, phase: "running", ticks: 3 },
			{ ok: true, phase: "done", ticks: 7 },
		]);

		const outcome = await superviseDetachedRun(plan, supervision);

		expect(outcome).toEqual({ completed: true, polls: 2, ticks: 7 });
		expect(supervision.sleeps).toEqual([30_000, 30_000]);
	});

	it("stops supervising when a poll fails", async () => {
		const supervision = deps([
			{ ok: true, phase: "running", ticks: 2 },
			{ ok: false, code: "poll-failed", message: "Supervision progress read failed." },
		]);

		const outcome = await superviseDetachedRun(plan, supervision);

		expect(outcome).toEqual({ completed: false, code: "poll-failed", polls: 2, ticks: 2 });
	});

	it("times out after the poll budget without a done marker", async () => {
		const supervision = deps([
			{ ok: true, phase: "running", ticks: 1 },
			{ ok: true, phase: "running", ticks: 2 },
			{ ok: true, phase: "running", ticks: 3 },
			{ ok: true, phase: "running", ticks: 4 },
		]);

		const outcome = await superviseDetachedRun(plan, supervision);

		expect(outcome).toEqual({ completed: false, code: "run-timed-out", polls: 4, ticks: 4 });
		expect(supervision.sleeps).toHaveLength(4);
	});
});

describe("combineSupervisionProbeResult", () => {
	const params = { runSeconds: 840, pollSeconds: 30 };

	it("reports success with the supervised run's observable facts", () => {
		const result = combineSupervisionProbeResult({
			params,
			sandboxName: "sbx-supervision",
			outcome: { completed: true, polls: 28, ticks: 167 },
			cleanup: { ok: true },
		});

		expect(result).toEqual({
			ok: true,
			sandboxName: "sbx-supervision",
			runSeconds: 840,
			pollSeconds: 30,
			polls: 28,
			ticks: 167,
		});
	});

	it("lets a cleanup failure win over a completed run", () => {
		const result = combineSupervisionProbeResult({
			params,
			sandboxName: "sbx-supervision",
			outcome: { completed: true, polls: 28, ticks: 167 },
			cleanup: { ok: false, code: "sandbox-cleanup-failed", message: "Sandbox cleanup failed." },
		});

		expect(result).toEqual({
			ok: false,
			code: "sandbox-cleanup-failed",
			message: "Sandbox cleanup failed.",
			sandboxName: "sbx-supervision",
			polls: 28,
			ticks: 167,
		});
	});

	it("reports a supervision timeout when cleanup succeeded", () => {
		const result = combineSupervisionProbeResult({
			params,
			sandboxName: "sbx-supervision",
			outcome: { completed: false, code: "run-timed-out", polls: 30, ticks: 12 },
			cleanup: { ok: true },
		});

		expect(result).toEqual({
			ok: false,
			code: "run-timed-out",
			message: "Detached run did not report done within the supervision budget.",
			sandboxName: "sbx-supervision",
			polls: 30,
			ticks: 12,
		});
	});

	it("reports a poll failure when cleanup succeeded", () => {
		const result = combineSupervisionProbeResult({
			params,
			sandboxName: "sbx-supervision",
			outcome: { completed: false, code: "poll-failed", polls: 3, ticks: 9 },
			cleanup: { ok: true },
		});

		expect(result).toEqual({
			ok: false,
			code: "poll-failed",
			message: "Supervision poll failed.",
			sandboxName: "sbx-supervision",
			polls: 3,
			ticks: 9,
		});
	});
});
