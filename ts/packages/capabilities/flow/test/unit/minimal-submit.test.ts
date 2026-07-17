import { describe, expect, test } from "vitest";

import { FakeGraphiteStackGateway, fakeStackInfo } from "@nseng-ai/capability-kit/graphite/testing";
import type { ExecResult } from "@nseng-ai/foundation/command";

import {
	createFlowMinimalSubmitClientFromGateways,
	type FlowMinimalSubmitSource,
	type MinimalSubmitRepositoryGateway,
	type MinimalSubmitRepositoryInspection,
	type MinimalSubmitRepositoryObservation,
} from "../../src/submit/minimal-submit.ts";
import type {
	CurrentPrVerificationResult,
	SubmitCommandParams,
	SubmitPreflightResult,
	SubmitRestackResult,
	SubmitRunResult,
} from "../../src/submit/submit.ts";
import type { SubmitTransportGateway } from "../../src/submit/submit-transport.ts";

const HEAD = "a".repeat(40);
const RESTACKED_HEAD = "b".repeat(40);
const SOURCE: FlowMinimalSubmitSource = { branch: "feature/top", headSha: HEAD };

interface RepositoryState {
	readonly source?: FlowMinimalSubmitSource;
	readonly dirtyPaths?: readonly string[];
	readonly failInspection?: boolean;
	readonly failAfterMutationObservation?: boolean;
}

class FakeMinimalRepository implements MinimalSubmitRepositoryGateway {
	private source: FlowMinimalSubmitSource;
	private dirtyPaths: readonly string[];
	private readonly failInspection: boolean;
	private readonly failAfterMutationObservation: boolean;
	private hasMutated = false;
	private localTips: Record<string, string> = {
		"feature/top": HEAD,
		"feature/base": "c".repeat(40),
	};
	private remoteTips: Record<string, string | null> = {
		"feature/top": "d".repeat(40),
		"feature/base": "e".repeat(40),
	};

	constructor(state: RepositoryState = {}) {
		this.source = { ...(state.source ?? SOURCE) };
		this.dirtyPaths = [...(state.dirtyPaths ?? [])];
		this.failInspection = state.failInspection === true;
		this.failAfterMutationObservation = state.failAfterMutationObservation === true;
	}

	async inspectCurrent() {
		if (this.failInspection) return repositoryFailure("inspection failed");
		return { ok: true as const, value: this.inspection() };
	}

	async observeAffectedBranches(branches: readonly string[]) {
		if (this.failAfterMutationObservation && this.hasMutated) {
			return repositoryFailure("after observation failed");
		}
		return {
			ok: true as const,
			value: {
				...this.inspection(),
				localTips: selectTips(this.localTips, branches, "missing-local"),
				remoteTips: selectTips<string | null>(this.remoteTips, branches, null),
			} satisfies MinimalSubmitRepositoryObservation,
		};
	}

	restack(options: { conflict?: boolean; mutate?: boolean } = {}): void {
		this.hasMutated = true;
		if (options.mutate !== false) {
			this.source = { ...this.source, headSha: RESTACKED_HEAD };
			this.localTips = { ...this.localTips, [this.source.branch]: RESTACKED_HEAD };
		}
		if (options.conflict === true && options.mutate !== false) {
			this.dirtyPaths = ["src/conflicted.ts"];
		}
	}

	submit(options: { remoteMutation?: boolean } = {}): void {
		this.hasMutated = true;
		if (options.remoteMutation !== false) {
			this.remoteTips = {
				...this.remoteTips,
				[this.source.branch]: this.source.headSha,
			};
		}
	}

	private inspection(): MinimalSubmitRepositoryInspection {
		return {
			source: { ...this.source },
			dirtyPaths: [...this.dirtyPaths],
			dirtyPathsTruncated: false,
		};
	}
}

interface SubmitState {
	readonly readiness?: "ready" | "restack-required" | "failed";
	readonly recheck?: "ready" | "restack-required" | "failed";
	readonly restack?: "success" | "conflict" | "failed";
	readonly restackMutates?: boolean;
	readonly submit?: "success" | "failed";
	readonly failedSubmitMutatesRemote?: boolean;
	readonly verification?: "present" | "missing" | "failed";
}

class FakeMinimalSubmitGateway implements SubmitTransportGateway {
	private readonly repository: FakeMinimalRepository;
	private readonly state: SubmitState;
	private readinessCalls = 0;
	private readonly log: Array<{ operation: string; force: boolean }> = [];

	constructor(repository: FakeMinimalRepository, state: SubmitState = {}) {
		this.repository = repository;
		this.state = state;
	}

	async checkSubmitReadiness(params: SubmitCommandParams): Promise<SubmitPreflightResult> {
		this.log.push({ operation: "readiness", force: params.force === true });
		this.readinessCalls += 1;
		const readiness =
			this.readinessCalls === 1
				? (this.state.readiness ?? "ready")
				: (this.state.recheck ?? "ready");
		if (readiness === "ready") return { kind: "ready", output: output() };
		if (readiness === "restack-required") {
			return { kind: "restack_required", output: output(1) };
		}
		return { kind: "failed", output: output(1, "readiness failed") };
	}

	async restackCurrentStack(params: SubmitCommandParams): Promise<SubmitRestackResult> {
		this.log.push({ operation: "restack", force: params.force === true });
		const outcome = this.state.restack ?? "success";
		this.repository.restack({
			conflict: outcome === "conflict",
			mutate: this.state.restackMutates !== false,
		});
		if (outcome === "success") return { kind: "success", output: output() };
		if (outcome === "conflict") {
			return {
				kind: "conflict",
				output: output(1, "conflict"),
				conflictedFiles: ["src/conflicted.ts"],
			};
		}
		return { kind: "failed", output: output(1, "restack failed") };
	}

	async submitCurrentStack(params: SubmitCommandParams): Promise<SubmitRunResult> {
		this.log.push({ operation: "submit", force: params.force === true });
		const outcome = this.state.submit ?? "success";
		this.repository.submit({
			remoteMutation: outcome === "success" || this.state.failedSubmitMutatesRemote === true,
		});
		params.onOutput?.("stdout", "submitted output");
		if (outcome === "failed") return { kind: "failed", output: output(1, "submit failed") };
		return {
			kind: "success",
			output: output(),
			prLinks: [{ label: "#12", url: "https://github.com/acme/repo/pull/12" }],
		};
	}

	async verifyCurrentPr(params: SubmitCommandParams): Promise<CurrentPrVerificationResult> {
		this.log.push({ operation: "verification", force: params.force === true });
		const outcome = this.state.verification ?? "present";
		if (outcome === "present") {
			return {
				kind: "present",
				output: output(),
				prLinks: [{ label: "#12", url: "https://github.com/acme/repo/pull/12" }],
			};
		}
		if (outcome === "missing") {
			return { kind: "no_current_pr", output: output(1), cause: "no_current_pr" };
		}
		return { kind: "failed", output: output(1), cause: "command_failed" };
	}

	operations(): readonly { operation: string; force: boolean }[] {
		return this.log.map((entry) => ({ ...entry }));
	}
}

function fixture(
	options: {
		repository?: RepositoryState;
		submit?: SubmitState;
		stack?: ConstructorParameters<typeof FakeGraphiteStackGateway>[0];
	} = {},
) {
	const repository = new FakeMinimalRepository(options.repository);
	const graphite = new FakeGraphiteStackGateway(
		options.stack ?? {
			stackForBranch: {
				type: "stack",
				stack: fakeStackInfo({
					trunk: "main",
					current: "feature/top",
					ancestors: ["main", "feature/base"],
				}),
			},
		},
	);
	const submit = new FakeMinimalSubmitGateway(repository, options.submit);
	return {
		client: createFlowMinimalSubmitClientFromGateways({
			cwd: "/repo",
			repository,
			graphite,
			submit,
		}),
		repository,
		graphite,
		submit,
	};
}

describe("Flow minimal submit", () => {
	test("plans current plus non-trunk downstack scope from structured Graphite metadata", async () => {
		const { client, graphite } = fixture();

		expect(await client.planCurrentBranch()).toEqual({
			type: "tracked",
			plan: {
				source: SOURCE,
				trunkBranch: "main",
				affectedBranches: ["feature/top", "feature/base"],
			},
		});
		expect(graphite.operations()).toEqual([
			{ type: "stack-for-branch", cwd: "/repo", branch: "feature/top" },
		]);
	});

	test("returns definitive untracked without treating it as provider failure", async () => {
		const { client } = fixture({
			stack: { stackForBranch: { type: "untracked_branch", message: "not tracked" } },
		});

		expect(await client.planCurrentBranch()).toEqual({
			type: "not-graphite-tracked",
			source: SOURCE,
			message: "not tracked",
		});
	});

	test.each([
		{
			name: "provider failure",
			stack: {
				stackForBranch: {
					type: "failure" as const,
					failure: { message: "schema mismatch", returnCode: null },
				},
			},
			code: "flow-minimal-submit-topology-provider-failure",
		},
		{
			name: "topology cycle",
			stack: {
				stackForBranch: {
					type: "stack" as const,
					stack: fakeStackInfo({
						trunk: "main",
						current: "feature/top",
						ancestors: ["main", "feature/base"],
						ancestorTermination: { type: "cycle", branch: "feature/base" },
					}),
				},
			},
			code: "flow-minimal-submit-topology-ancestor-cycle",
		},
	])("fails closed on $name", async ({ stack, code }) => {
		const { client } = fixture({ stack });

		expect(await client.planCurrentBranch()).toMatchObject({
			type: "failed",
			stage: "planning",
			error: { code },
			mutation: { local: "none", remote: "none" },
		});
	});

	test("planning enforces the expected source before Graphite reads", async () => {
		const { client, graphite } = fixture({
			repository: { source: { branch: "feature/other", headSha: HEAD } },
		});

		expect(await client.planCurrentBranch({ expectedSource: SOURCE })).toMatchObject({
			type: "failed",
			stage: "planning",
			error: { code: "flow-minimal-submit-branch-drift" },
			mutation: { local: "none", remote: "none" },
		});
		expect(graphite.operations()).toEqual([]);
	});

	test.each([
		{
			name: "source drift",
			repository: { source: { branch: "feature/other", headSha: HEAD } },
			code: "flow-minimal-submit-branch-drift",
		},
		{
			name: "dirty worktree",
			repository: { dirtyPaths: ["src/app.ts"] },
			code: "flow-minimal-submit-dirty-worktree",
		},
	])("refuses $name before Graphite", async ({ repository, code }) => {
		const { client, graphite, submit } = fixture({ repository });

		expect(await client.submitCurrentBranch({ expectedSource: SOURCE })).toMatchObject({
			type: "failed",
			stage: "planning",
			error: { code },
			mutation: { local: "none", remote: "none" },
		});
		expect(graphite.operations()).toEqual([]);
		expect(submit.operations()).toEqual([]);
	});

	test("fails before mutation when the execution plan differs from the caller-observed plan", async () => {
		const { client, submit } = fixture();

		expect(
			await client.submitCurrentBranch({
				expectedSource: SOURCE,
				expectedPlan: {
					source: SOURCE,
					trunkBranch: "main",
					affectedBranches: ["feature/top"],
				},
			}),
		).toMatchObject({
			type: "failed",
			stage: "planning",
			error: { code: "flow-minimal-submit-plan-drift" },
			mutation: { local: "none", remote: "none" },
		});
		expect(submit.operations()).toEqual([]);
	});

	test("submits a ready clean stack without Graphite force by default", async () => {
		const { client, submit } = fixture();

		expect(await client.submitCurrentBranch({ expectedSource: SOURCE })).toMatchObject({
			type: "submitted",
			source: SOURCE,
			mutation: { local: "none", remote: "observed" },
		});
		expect(submit.operations()).toEqual([
			{ operation: "readiness", force: false },
			{ operation: "submit", force: false },
			{ operation: "verification", force: false },
		]);
	});

	test("refuses a required restack when automatic restacking is disabled", async () => {
		const { client, submit } = fixture({ submit: { readiness: "restack-required" } });

		expect(
			await client.submitCurrentBranch({ expectedSource: SOURCE, restack: false }),
		).toMatchObject({
			type: "failed",
			stage: "readiness",
			error: { code: "flow-minimal-submit-restack-required" },
			mutation: { local: "none", remote: "none" },
		});
		expect(submit.operations()).toEqual([{ operation: "readiness", force: false }]);
	});

	test("restacks, rechecks readiness, and submits", async () => {
		const { client, submit } = fixture({ submit: { readiness: "restack-required" } });

		expect(await client.submitCurrentBranch({ expectedSource: SOURCE })).toMatchObject({
			type: "submitted",
			source: { branch: SOURCE.branch, headSha: RESTACKED_HEAD },
			mutation: { local: "observed", remote: "observed" },
		});
		expect(submit.operations().map((entry) => entry.operation)).toEqual([
			"readiness",
			"restack",
			"readiness",
			"submit",
			"verification",
		]);
	});

	test.each([
		{ restack: "conflict" as const, code: "flow-minimal-submit-restack-conflict" },
		{ restack: "failed" as const, code: "flow-minimal-submit-restack-failed" },
	])("reports conservative local evidence for restack $restack", async ({ restack, code }) => {
		const { client } = fixture({
			submit: { readiness: "restack-required", restack },
		});

		expect(await client.submitCurrentBranch({ expectedSource: SOURCE })).toMatchObject({
			type: "failed",
			stage: "restack",
			error: { code },
			mutation: { local: "observed", remote: "none" },
		});
	});

	test("restack conflict remains locally possible even when ref observation appears unchanged", async () => {
		const { client } = fixture({
			submit: {
				readiness: "restack-required",
				restack: "conflict",
				restackMutates: false,
			},
		});

		expect(await client.submitCurrentBranch({ expectedSource: SOURCE })).toMatchObject({
			type: "failed",
			stage: "restack",
			mutation: { local: "possible", remote: "none" },
		});
	});

	test("stops when readiness recheck fails after restack", async () => {
		const { client } = fixture({
			submit: { readiness: "restack-required", recheck: "failed" },
		});

		expect(await client.submitCurrentBranch({ expectedSource: SOURCE })).toMatchObject({
			type: "failed",
			stage: "readiness-recheck",
			mutation: { local: "observed", remote: "none" },
		});
	});

	test("a failed submit reports remote mutation possible even when tips appear unchanged", async () => {
		const { client } = fixture({ submit: { submit: "failed" } });

		expect(await client.submitCurrentBranch({ expectedSource: SOURCE })).toMatchObject({
			type: "failed",
			stage: "submit",
			mutation: { local: "none", remote: "possible" },
		});
	});

	test("a failed submit reports observed remote mutation when tip observation proves it", async () => {
		const { client } = fixture({
			submit: { submit: "failed", failedSubmitMutatesRemote: true },
		});

		expect(await client.submitCurrentBranch({ expectedSource: SOURCE })).toMatchObject({
			type: "failed",
			stage: "submit",
			mutation: { local: "none", remote: "observed" },
		});
	});

	test("strict verification rejects a successful submit without a current PR", async () => {
		const { client } = fixture({ submit: { verification: "missing" } });

		expect(await client.submitCurrentBranch({ expectedSource: SOURCE })).toMatchObject({
			type: "failed",
			stage: "verification",
			error: { code: "flow-minimal-submit-verification-no_current_pr" },
			mutation: { remote: "observed" },
		});
	});

	test("verification failure after successful submit reports remote mutation observed", async () => {
		const { client } = fixture({ submit: { verification: "failed" } });

		expect(await client.submitCurrentBranch({ expectedSource: SOURCE })).toMatchObject({
			type: "failed",
			stage: "verification",
			mutation: { remote: "observed" },
		});
	});

	test("a phase observer throwing after submit mutation cannot escape or prevent verification", async () => {
		const { client, submit } = fixture();

		const result = await client.submitCurrentBranch({
			expectedSource: SOURCE,
			onPhase: (event) => {
				if (event.stage === "submit" && event.status === "completed") {
					throw new Error("phase observer failed");
				}
			},
		});

		expect(result).toMatchObject({
			type: "submitted",
			mutation: { local: "none", remote: "observed" },
		});
		expect(submit.operations().map((entry) => entry.operation)).toEqual([
			"readiness",
			"submit",
			"verification",
		]);
	});

	test("an output observer throwing during submit preserves structured mutation evidence", async () => {
		const { client, submit } = fixture({ submit: { verification: "failed" } });

		const result = await client.submitCurrentBranch({
			expectedSource: SOURCE,
			onOutput: () => {
				throw new Error("output observer failed");
			},
		});

		expect(result).toMatchObject({
			type: "failed",
			stage: "verification",
			error: { code: "flow-minimal-submit-verification-failed" },
			mutation: { local: "none", remote: "observed" },
		});
		expect(submit.operations().map((entry) => entry.operation)).toEqual([
			"readiness",
			"submit",
			"verification",
		]);
	});

	test("after-observation failure reports local possible and remote observed", async () => {
		const { client } = fixture({
			repository: { failAfterMutationObservation: true },
		});

		expect(await client.submitCurrentBranch({ expectedSource: SOURCE })).toMatchObject({
			type: "failed",
			stage: "verification",
			error: { code: "flow-minimal-submit-after-observation-failed" },
			mutation: { local: "possible", remote: "observed" },
		});
	});

	test("explicit force remains an opt-in passed to Flow's Graphite operations", async () => {
		const { client, submit } = fixture();

		expect(await client.submitCurrentBranch({ expectedSource: SOURCE, force: true })).toMatchObject(
			{ type: "submitted" },
		);
		expect(submit.operations().every((entry) => entry.force)).toBe(true);
	});
});

function repositoryFailure(message: string) {
	return {
		ok: false as const,
		error: { code: "repository-failed", message },
	};
}

function selectTips<T>(
	tips: Readonly<Record<string, T>>,
	branches: readonly string[],
	fallback: T,
): Record<string, T> {
	return Object.fromEntries(branches.map((branch) => [branch, tips[branch] ?? fallback]));
}

function output(code = 0, stderr = ""): ExecResult {
	return { type: "exited", code, signal: null, stdout: "", stderr };
}
