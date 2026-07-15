import type {
	FlowMinimalSubmitClient,
	FlowMinimalSubmitPlanResult,
	FlowMinimalSubmitResult,
} from "@nseng-ai/flow/api";
import { describe, expect, test } from "vitest";

import {
	createRealDispatchGraphitePublicationAuthorizationGateway,
	createRealDispatchSourcePublicationGateway,
} from "../../src/dispatch-client/real-source-publication-gateways.ts";

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";

class FakeFlowMinimalSubmitClient implements FlowMinimalSubmitClient {
	private readonly planLog: Array<{
		expectedSource?: { branch: string; headSha: string };
	}> = [];
	private readonly submissionLog: Array<{
		expectedSource: { branch: string; headSha: string };
		restack?: boolean;
		force?: boolean;
	}> = [];
	private readonly planResult: FlowMinimalSubmitPlanResult;
	private readonly submitResult: FlowMinimalSubmitResult;

	constructor(options: {
		readonly planResult: FlowMinimalSubmitPlanResult;
		readonly submitResult: FlowMinimalSubmitResult;
	}) {
		this.planResult = options.planResult;
		this.submitResult = options.submitResult;
	}

	get plans(): ReadonlyArray<{
		readonly expectedSource?: { readonly branch: string; readonly headSha: string };
	}> {
		return this.planLog.map((entry) =>
			entry.expectedSource === undefined ? {} : { expectedSource: { ...entry.expectedSource } },
		);
	}

	get submissions(): ReadonlyArray<{
		readonly expectedSource: { readonly branch: string; readonly headSha: string };
		readonly restack?: boolean;
		readonly force?: boolean;
	}> {
		return this.submissionLog.map((entry) => ({
			...entry,
			expectedSource: { ...entry.expectedSource },
		}));
	}

	async planCurrentBranch(
		input: {
			readonly expectedSource?: { readonly branch: string; readonly headSha: string };
		} = {},
	) {
		this.planLog.push(
			input.expectedSource === undefined ? {} : { expectedSource: { ...input.expectedSource } },
		);
		return this.planResult;
	}

	async submitCurrentBranch(input: {
		readonly expectedSource: { readonly branch: string; readonly headSha: string };
		readonly restack?: boolean;
		readonly force?: boolean;
		readonly onPhase?: (event: {
			readonly stage:
				| "planning"
				| "readiness"
				| "restack"
				| "readiness-recheck"
				| "submit"
				| "verification";
			readonly status: "started" | "completed" | "failed";
		}) => void;
	}) {
		this.submissionLog.push({
			expectedSource: { ...input.expectedSource },
			...(input.restack === undefined ? {} : { restack: input.restack }),
			...(input.force === undefined ? {} : { force: input.force }),
		});
		input.onPhase?.({ stage: "planning", status: "started" });
		return this.submitResult;
	}
}

function trackedPlan(): Extract<FlowMinimalSubmitPlanResult, { type: "tracked" }> {
	return {
		type: "tracked",
		plan: {
			source: { branch: "feature/widgets", headSha: SHA },
			trunkBranch: "main",
			affectedBranches: ["feature/widgets", "feature/base"],
		},
	};
}

function submitted(): Extract<FlowMinimalSubmitResult, { type: "submitted" }> {
	return {
		type: "submitted",
		stage: "verification",
		plan: trackedPlan().plan,
		source: { branch: "feature/widgets", headSha: SHA },
		mutation: { local: "none", remote: "observed" },
	};
}

describe("dispatch source publication gateways", () => {
	test("copies Flow plan scope into dispatch vocabulary", async () => {
		const client = new FakeFlowMinimalSubmitClient({
			planResult: trackedPlan(),
			submitResult: submitted(),
		});
		const gateway = createRealDispatchSourcePublicationGateway(client);
		const result = await gateway.planGraphitePublication({
			expectedBranch: "feature/widgets",
			expectedHeadSha: SHA,
		});

		expect(result).toEqual({
			type: "tracked",
			plan: { affectedBranches: ["feature/widgets", "feature/base"] },
		});
		expect(client.plans).toEqual([{ expectedSource: { branch: "feature/widgets", headSha: SHA } }]);
	});

	test("always enables restack and disables Flow force during publication", async () => {
		const client = new FakeFlowMinimalSubmitClient({
			planResult: trackedPlan(),
			submitResult: submitted(),
		});
		const phases: string[] = [];
		const gateway = createRealDispatchSourcePublicationGateway(client);
		const result = await gateway.publishGraphiteSource({
			expectedBranch: "feature/widgets",
			expectedHeadSha: SHA,
			onPhase: (stage) => phases.push(stage),
		});

		expect(result).toMatchObject({ type: "published" });
		expect(client.submissions).toEqual([
			{
				expectedSource: { branch: "feature/widgets", headSha: SHA },
				restack: true,
				force: false,
			},
		]);
		expect(phases).toEqual(["planning"]);
	});

	test("force preauthorization skips interaction", async () => {
		const confirmations: string[] = [];
		const gateway = createRealDispatchGraphitePublicationAuthorizationGateway({
			isInteractive: () => true,
			confirm: async (request) => {
				confirmations.push(request.message);
				return { type: "confirmed" };
			},
		});

		expect(
			await gateway.authorizeGraphitePublication({
				affectedBranches: ["feature/widgets"],
				isForceAuthorized: true,
			}),
		).toEqual({ type: "authorized", method: "force" });
		expect(confirmations).toEqual([]);
	});

	test("noninteractive publication requires dispatch force without prompting", async () => {
		let confirmationCount = 0;
		const gateway = createRealDispatchGraphitePublicationAuthorizationGateway({
			isInteractive: () => false,
			confirm: async () => {
				confirmationCount += 1;
				return { type: "confirmed" };
			},
		});

		expect(
			await gateway.authorizeGraphitePublication({
				affectedBranches: ["feature/widgets"],
				isForceAuthorized: false,
			}),
		).toEqual({ type: "non-interactive-force-required" });
		expect(confirmationCount).toBe(0);
	});

	test("interactive preview names scope, rewrite risk, and retained Graphite safeguards", async () => {
		const confirmations: string[] = [];
		const gateway = createRealDispatchGraphitePublicationAuthorizationGateway({
			isInteractive: () => true,
			confirm: async (request) => {
				confirmations.push(request.message);
				return { type: "declined" };
			},
		});

		expect(
			await gateway.authorizeGraphitePublication({
				affectedBranches: ["feature/widgets", "feature/base"],
				isForceAuthorized: false,
			}),
		).toEqual({ type: "declined" });
		expect(confirmations[0]).toContain("feature/widgets");
		expect(confirmations[0]).toContain("feature/base");
		expect(confirmations[0]).toContain("rewrite local history");
		expect(confirmations[0]).toContain("will not bypass Graphite");
	});
});
