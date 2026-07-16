import { FakeBrmemGateway, type BrmemResult, type PutEntryResult } from "@nseng-ai/brmem";
import { describe, expect, test } from "vitest";

import {
	deliverDispatchPlan,
	type DispatchPlanSnapshotGateway,
} from "../../src/ns/dispatch-plan/delivery.ts";
import type {
	DispatchSavedPlanGateway,
	DispatchSavedPlanResolution,
} from "../../src/ns/dispatch-plan/preparation.ts";

const PLAN_REF = "/state/ns/enriched-plan/ns/main/add-cache.md";
const PLAN_CONTENT = "# Add cache\n";
const DISPATCH_ID = "dsp_01JABCDEF0123456789";
const SOURCE_BRANCH = "feature/cache";
const SNAPSHOT_REF = "refs/brmem/ns/dispatch-context/feature---cache";
const SNAPSHOT_COMMIT = "1111111111111111111111111111111111111111";
const REFSPEC = "refs/brmem/*:refs/brmem/*";

class FakeSavedPlans implements DispatchSavedPlanGateway {
	async resolveExplicitSavedPlan(): Promise<DispatchSavedPlanResolution> {
		return {
			type: "resolved",
			plan: {
				filePath: PLAN_REF,
				slug: "add-cache",
				sourceBranch: SOURCE_BRANCH,
				content: PLAN_CONTENT,
			},
		};
	}
}

class RecordingBrmemGateway extends FakeBrmemGateway {
	readonly creates: Array<{
		namespace: string;
		key: string;
		branch: string;
		content: string;
	}> = [];
	private readonly createError: { readonly code: string; readonly message: string } | undefined;

	constructor(options: ConstructorParameters<typeof FakeBrmemGateway>[0] = {}) {
		super(options);
		this.createError = options.operationErrors?.create;
	}

	override async createEntry(options: {
		namespace: string;
		key: string;
		branch: string;
		content: string;
	}): Promise<BrmemResult<PutEntryResult>> {
		this.creates.push({ ...options });
		if (this.createError !== undefined) {
			return { type: "error", error: this.createError };
		}
		return {
			type: "ok",
			value: {
				commitSha: SNAPSHOT_COMMIT,
				entry: {
					namespace: options.namespace,
					key: options.key,
					branch: options.branch,
					entryLocator: `${SNAPSHOT_REF}:${options.key}`,
				},
			},
		};
	}
}

type SnapshotState = {
	readonly publish?: "ok" | "error";
	readonly remote?: "matching" | "missing" | "mismatch" | "error";
};

class FakeSnapshots implements DispatchPlanSnapshotGateway {
	readonly operations: string[] = [];
	private readonly state: SnapshotState;

	constructor(state: SnapshotState = {}) {
		this.state = state;
	}

	async publishSnapshot(options: {
		readonly remote: string;
		readonly snapshotRef: string;
		readonly commitSha: string;
	}) {
		this.operations.push(`publish ${options.remote} ${options.commitSha}:${options.snapshotRef}`);
		return this.state.publish === "error"
			? {
					ok: false as const,
					error: { code: "push-failed", message: "push rejected" },
				}
			: { ok: true as const };
	}

	async readRemoteSnapshotTip(options: { readonly remote: string; readonly snapshotRef: string }) {
		this.operations.push(`verify ${options.remote} ${options.snapshotRef}`);
		switch (this.state.remote) {
			case "missing":
				return { type: "missing" as const };
			case "mismatch":
				return { type: "found" as const, commitSha: "2222222222222222222222222222222222222222" };
			case "error":
				return {
					type: "error" as const,
					error: { code: "verify-failed", message: "remote unavailable" },
				};
			default:
				return { type: "found" as const, commitSha: SNAPSHOT_COMMIT };
		}
	}
}

function brmem(options: ConstructorParameters<typeof RecordingBrmemGateway>[0] = {}) {
	return new RecordingBrmemGateway({
		remotes: {
			origin: {
				push: ["HEAD", REFSPEC],
				fetch: ["+refs/heads/*:refs/remotes/origin/*", REFSPEC],
			},
		},
		...options,
	});
}

async function deliver(memory: RecordingBrmemGateway, snapshots: FakeSnapshots) {
	return await deliverDispatchPlan(
		{ cwd: "/repo", planRef: PLAN_REF },
		{
			savedPlans: new FakeSavedPlans(),
			generateDispatchId: () => DISPATCH_ID,
			brmem: memory,
			snapshots,
		},
	);
}

describe("deliverDispatchPlan", () => {
	test("creates, exactly publishes, and verifies dispatch-owned context before returning its locator", async () => {
		const memory = brmem();
		const snapshots = new FakeSnapshots();

		const outcome = await deliver(memory, snapshots);

		expect(memory.creates).toEqual([
			{
				namespace: "dispatch-context",
				key: `${DISPATCH_ID}/plan/add-cache.md`,
				branch: SOURCE_BRANCH,
				content: PLAN_CONTENT,
			},
		]);
		expect(snapshots.operations).toEqual([
			`publish origin ${SNAPSHOT_COMMIT}:${SNAPSHOT_REF}`,
			`verify origin ${SNAPSHOT_REF}`,
		]);
		expect(outcome).toMatchObject({
			status: "ready",
			dispatchId: DISPATCH_ID,
			locator: {
				namespace: "dispatch-context",
				dispatchId: DISPATCH_ID,
				contextPrefix: `${DISPATCH_ID}/`,
				planKey: `${DISPATCH_ID}/plan/add-cache.md`,
				sourceBranch: SOURCE_BRANCH,
				snapshotRef: SNAPSHOT_REF,
				snapshotCommitSha: SNAPSHOT_COMMIT,
			},
		});
	});

	test("refuses setup without creating or publishing anything", async () => {
		const memory = brmem({ remotes: { origin: { push: [], fetch: [] } } });
		const snapshots = new FakeSnapshots();

		const outcome = await deliver(memory, snapshots);

		expect(outcome).toMatchObject({
			status: "setup-required",
			dispatchId: DISPATCH_ID,
			artifacts: [],
			setupCommand: "brmem setup-git",
		});
		expect(memory.creates).toEqual([]);
		expect(snapshots.operations).toEqual([]);
	});

	test("reports no durable artifact when entry creation fails", async () => {
		const memory = brmem({
			operationErrors: { create: { code: "snapshot-corrupt", message: "cannot create" } },
		});

		const outcome = await deliver(memory, new FakeSnapshots());

		expect(outcome).toEqual({
			status: "entry-creation-failed",
			dispatchId: DISPATCH_ID,
			error: { code: "snapshot-corrupt", message: "cannot create" },
			artifacts: [],
		});
	});

	test("reports the local Entry when exact Snapshot Ref publication fails", async () => {
		const outcome = await deliver(brmem(), new FakeSnapshots({ publish: "error" }));

		expect(outcome).toMatchObject({
			status: "snapshot-publication-failed",
			dispatchId: DISPATCH_ID,
			error: { code: "push-failed" },
			artifacts: [
				{
					type: "branch-memory-entry",
					snapshotRef: SNAPSHOT_REF,
					commitSha: SNAPSHOT_COMMIT,
				},
			],
		});
	});

	test.each([
		["missing", null],
		["mismatch", "2222222222222222222222222222222222222222"],
	] as const)(
		"reports local and published artifacts when the remote tip is %s",
		async (remote, tip) => {
			const outcome = await deliver(brmem(), new FakeSnapshots({ remote }));

			expect(outcome).toMatchObject({
				status: "remote-snapshot-mismatch",
				dispatchId: DISPATCH_ID,
				expectedCommitSha: SNAPSHOT_COMMIT,
				actualCommitSha: tip,
				artifacts: [
					{ type: "branch-memory-entry", commitSha: SNAPSHOT_COMMIT },
					{ type: "published-snapshot-ref", remote: "origin", commitSha: SNAPSHOT_COMMIT },
				],
			});
		},
	);

	test("reports both durable artifacts when remote verification itself fails", async () => {
		const outcome = await deliver(brmem(), new FakeSnapshots({ remote: "error" }));

		expect(outcome).toMatchObject({
			status: "remote-verification-failed",
			dispatchId: DISPATCH_ID,
			error: { code: "verify-failed" },
			artifacts: [{ type: "branch-memory-entry" }, { type: "published-snapshot-ref" }],
		});
	});
});
