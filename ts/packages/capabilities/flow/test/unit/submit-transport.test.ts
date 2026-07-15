import { exitedResult } from "@nseng-ai/foundation/exec/testing";
import { describe, expect, test } from "vitest";

import type {
	CurrentPrVerificationResult,
	SubmitCommandParams,
	SubmitPreflightResult,
	SubmitRestackResult,
	SubmitRunResult,
} from "../../src/submit/submit.ts";
import {
	prepareSubmitTransport,
	type SubmitTransportGateway,
	type SubmitTransportObservation,
} from "../../src/submit/submit-transport.ts";

const readyOutcome: SubmitPreflightResult = {
	kind: "ready",
	output: exitedResult({ stdout: "ready", code: 0 }),
};
const restackRequiredOutcome: SubmitPreflightResult = {
	kind: "restack_required",
	output: exitedResult({ stderr: "restack required", code: 1 }),
};
const successfulRestackOutcome: SubmitRestackResult = {
	kind: "success",
	output: exitedResult({ stdout: "restacked", code: 0 }),
};
const successfulSubmitOutcome: SubmitRunResult = {
	kind: "success",
	output: exitedResult({ stdout: "submitted", code: 0 }),
	prLinks: [{ label: "#42", url: "https://github.com/acme/repo/pull/42" }],
};
const presentVerificationOutcome: CurrentPrVerificationResult = {
	kind: "present",
	output: exitedResult({ stdout: "present", code: 0 }),
	prLinks: [{ label: "#42", url: "https://github.com/acme/repo/pull/42" }],
};

describe("submit transport", () => {
	test("prepares a ready state from the raw readiness outcome", async () => {
		const gateway = new InMemorySubmitTransportGateway({ initialReadiness: readyOutcome });

		const state = await prepareSubmitTransport({ gateway, params: { cwd: "/repo" } });

		expect(state.kind).toBe("ready");
		expect(gateway.calls).toEqual([{ operation: "readiness", params: { cwd: "/repo" } }]);
	});

	test("returns the raw initial readiness failure", async () => {
		const outcome: SubmitPreflightResult = {
			kind: "failed",
			output: exitedResult({ stderr: "not ready", code: 3 }),
			cause: { kind: "trunk_out_of_date" },
		};
		const gateway = new InMemorySubmitTransportGateway({ initialReadiness: outcome });

		const state = await prepareSubmitTransport({ gateway, params: { cwd: "/repo" } });

		expect(state).toEqual({ kind: "failed", stage: "readiness", outcome });
	});

	test("stops explicitly at restack-required without auto-restacking", async () => {
		const gateway = new InMemorySubmitTransportGateway({
			initialReadiness: restackRequiredOutcome,
		});

		const state = await prepareSubmitTransport({ gateway, params: { cwd: "/repo" } });

		expect(state.kind).toBe("restack-required");
		if (state.kind !== "restack-required") return;
		expect(state.outcome).toBe(restackRequiredOutcome);
		expect(gateway.calls.map((call) => call.operation)).toEqual(["readiness"]);
	});

	test("restacks and rechecks before exposing a ready state", async () => {
		const gateway = new InMemorySubmitTransportGateway({
			initialReadiness: restackRequiredOutcome,
			readinessAfterRestack: readyOutcome,
			restack: successfulRestackOutcome,
		});
		const prepared = await prepareSubmitTransport({ gateway, params: { cwd: "/repo" } });
		if (prepared.kind !== "restack-required") throw new Error("Expected restack-required state");

		const state = await prepared.restackAndRecheck({
			restack: { cwd: "/repo", force: true },
			readinessRecheck: { cwd: "/repo" },
		});

		expect(state.kind).toBe("ready");
		expect(gateway.calls).toEqual([
			{ operation: "readiness", params: { cwd: "/repo" } },
			{ operation: "restack", params: { cwd: "/repo", force: true } },
			{ operation: "readiness", params: { cwd: "/repo" } },
		]);
	});

	test.each([
		{
			name: "conflict",
			outcome: {
				kind: "conflict",
				output: exitedResult({ stderr: "conflict", code: 1 }),
				conflictedFiles: ["src/conflicted.ts"],
			} satisfies SubmitRestackResult,
		},
		{
			name: "failure",
			outcome: {
				kind: "failed",
				output: exitedResult({ stderr: "failed", code: 2 }),
			} satisfies SubmitRestackResult,
		},
	])("returns the raw restack $name outcome as a restack failure", async ({ outcome }) => {
		const gateway = new InMemorySubmitTransportGateway({
			initialReadiness: restackRequiredOutcome,
			restack: outcome,
		});
		const prepared = await prepareSubmitTransport({ gateway, params: { cwd: "/repo" } });
		if (prepared.kind !== "restack-required") throw new Error("Expected restack-required state");

		const state = await prepared.restackAndRecheck({
			restack: { cwd: "/repo" },
			readinessRecheck: { cwd: "/repo" },
		});

		expect(state).toEqual({ kind: "failed", stage: "restack", outcome });
		expect(gateway.calls.map((call) => call.operation)).toEqual(["readiness", "restack"]);
	});

	test.each([
		{
			name: "failed",
			outcome: {
				kind: "failed",
				output: exitedResult({ stderr: "not ready", code: 1 }),
			} satisfies SubmitPreflightResult,
		},
		{
			name: "still restack-required",
			outcome: restackRequiredOutcome,
		},
	])("returns a readiness-recheck failure when the recheck is $name", async ({ outcome }) => {
		const gateway = new InMemorySubmitTransportGateway({
			initialReadiness: restackRequiredOutcome,
			readinessAfterRestack: outcome,
			restack: successfulRestackOutcome,
		});
		const prepared = await prepareSubmitTransport({ gateway, params: { cwd: "/repo" } });
		if (prepared.kind !== "restack-required") throw new Error("Expected restack-required state");

		const state = await prepared.restackAndRecheck({
			restack: { cwd: "/repo" },
			readinessRecheck: { cwd: "/repo" },
		});

		expect(state).toEqual({ kind: "failed", stage: "readiness-recheck", outcome });
	});

	test("retains a raw successful submit outcome with a semantic failure cause", async () => {
		const semanticOutcome: SubmitRunResult = {
			...successfulSubmitOutcome,
			semanticFailureCause: { kind: "empty_branch_skipped", branchName: "empty-branch" },
		};
		const gateway = new InMemorySubmitTransportGateway({
			initialReadiness: readyOutcome,
			submit: semanticOutcome,
		});
		const prepared = await prepareSubmitTransport({ gateway, params: { cwd: "/repo" } });
		if (prepared.kind !== "ready") throw new Error("Expected ready state");
		const onOutput = () => {};

		const state = await prepared.submitPrimary({ cwd: "/repo", onOutput });

		expect(state.kind).toBe("submitted");
		if (state.kind !== "submitted") return;
		expect(state.outcome).toBe(semanticOutcome);
		expect(gateway.calls[1]).toEqual({
			operation: "submit",
			params: { cwd: "/repo", onOutput },
		});
	});

	test("returns the raw submit failure", async () => {
		const outcome: SubmitRunResult = {
			kind: "failed",
			output: exitedResult({ stderr: "submit failed", code: 7 }),
			cause: { kind: "graphite_pr_info_lookup_failed" },
		};
		const gateway = new InMemorySubmitTransportGateway({
			initialReadiness: readyOutcome,
			submit: outcome,
		});
		const prepared = await prepareSubmitTransport({ gateway, params: { cwd: "/repo" } });
		if (prepared.kind !== "ready") throw new Error("Expected ready state");

		const state = await prepared.submitPrimary({ cwd: "/repo" });

		expect(state).toEqual({ kind: "failed", stage: "submit", outcome });
	});

	test.each([
		{ name: "present", outcome: presentVerificationOutcome },
		{
			name: "no current PR",
			outcome: {
				kind: "no_current_pr",
				output: exitedResult({ stderr: "none", code: 1 }),
				cause: "no_current_pr",
			} satisfies CurrentPrVerificationResult,
		},
		{
			name: "failed",
			outcome: {
				kind: "failed",
				output: exitedResult({ stderr: "bad json", code: 0 }),
				cause: "malformed_output",
			} satisfies CurrentPrVerificationResult,
		},
	])("returns the raw $name verification outcome", async ({ outcome }) => {
		const gateway = new InMemorySubmitTransportGateway({
			initialReadiness: readyOutcome,
			verification: outcome,
		});
		const prepared = await prepareSubmitTransport({ gateway, params: { cwd: "/repo" } });
		if (prepared.kind !== "ready") throw new Error("Expected ready state");
		const submitted = await prepared.submitPrimary({ cwd: "/repo" });
		if (submitted.kind !== "submitted") throw new Error("Expected submitted state");

		const result = await submitted.verifyCurrentPr({ cwd: "/repo", force: true });

		expect(result).toBe(outcome);
		expect(gateway.calls[2]).toEqual({
			operation: "verification",
			params: { cwd: "/repo", force: true },
		});
	});

	test("reports stage activity without allowing the observation sink to stop control flow", async () => {
		const observations: SubmitTransportObservation[] = [];
		const gateway = new InMemorySubmitTransportGateway({ initialReadiness: readyOutcome });

		const state = await prepareSubmitTransport({
			gateway,
			params: { cwd: "/repo" },
			observationSink: (observation) => {
				observations.push(observation);
				if (observation.type === "stage-started") throw new Error("telemetry unavailable");
			},
		});

		expect(state.kind).toBe("ready");
		expect(observations).toEqual([
			{ type: "stage-started", stage: "readiness" },
			{ type: "stage-completed", stage: "readiness" },
		]);
	});
});

interface InMemorySubmitTransportGatewayState {
	initialReadiness: SubmitPreflightResult;
	readinessAfterRestack?: SubmitPreflightResult;
	restack?: SubmitRestackResult;
	submit?: SubmitRunResult;
	verification?: CurrentPrVerificationResult;
}

interface SubmitTransportCall {
	operation: "readiness" | "restack" | "submit" | "verification";
	params: SubmitCommandParams;
}

class InMemorySubmitTransportGateway implements SubmitTransportGateway {
	private readonly state: InMemorySubmitTransportGatewayState;
	private readonly operationLog: SubmitTransportCall[] = [];
	private hasRestacked = false;

	constructor(state: InMemorySubmitTransportGatewayState) {
		this.state = state;
	}

	get calls(): readonly SubmitTransportCall[] {
		return [...this.operationLog];
	}

	async checkSubmitReadiness(params: SubmitCommandParams): Promise<SubmitPreflightResult> {
		this.operationLog.push({ operation: "readiness", params });
		return this.hasRestacked
			? (this.state.readinessAfterRestack ?? this.state.initialReadiness)
			: this.state.initialReadiness;
	}

	async restackCurrentStack(params: SubmitCommandParams): Promise<SubmitRestackResult> {
		this.operationLog.push({ operation: "restack", params });
		const outcome = this.state.restack ?? successfulRestackOutcome;
		if (outcome.kind === "success") this.hasRestacked = true;
		return outcome;
	}

	async submitCurrentStack(params: SubmitCommandParams): Promise<SubmitRunResult> {
		this.operationLog.push({ operation: "submit", params });
		return this.state.submit ?? successfulSubmitOutcome;
	}

	async verifyCurrentPr(params: SubmitCommandParams): Promise<CurrentPrVerificationResult> {
		this.operationLog.push({ operation: "verification", params });
		return this.state.verification ?? presentVerificationOutcome;
	}
}
