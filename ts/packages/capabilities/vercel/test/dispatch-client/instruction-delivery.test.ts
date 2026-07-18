import { FakeBrmemGateway, type BrmemResult, type PutEntryResult } from "@nseng-ai/brmem";
import { describe, expect, test } from "vitest";

import {
	deliverPreparedDispatchInstruction,
	type DispatchSnapshotGateway,
} from "../../src/dispatch-client/instruction-delivery.ts";

const DISPATCH_ID = "dsp_01JABCDEF0123456789";
const BRANCH = "dispatch/cache-20260322";
const KEY = `${DISPATCH_ID}/instructions.md`;
const SNAPSHOT_REF = "refs/brmem/ns/dispatch-context/dispatch---cache-20260322";
const COMMIT = "1111111111111111111111111111111111111111";

class RecordingMemory extends FakeBrmemGateway {
	readonly creates: Array<{ namespace: string; key: string; branch: string; content: string }> = [];

	override async createEntry(options: {
		namespace: string;
		key: string;
		branch: string;
		content: string;
	}): Promise<BrmemResult<PutEntryResult>> {
		this.creates.push({ ...options });
		return {
			type: "ok",
			value: {
				commitSha: COMMIT,
				entry: { ...options, entryLocator: `${SNAPSHOT_REF}:${options.key}` },
			},
		};
	}
}

class RecordingSnapshots implements DispatchSnapshotGateway {
	readonly operations: string[] = [];
	readonly remoteCommit: string | null;

	constructor(remoteCommit: string | null = COMMIT) {
		this.remoteCommit = remoteCommit;
	}

	async publishSnapshot(options: {
		readonly remote: string;
		readonly snapshotRef: string;
		readonly commitSha: string;
	}) {
		this.operations.push(`publish ${options.remote} ${options.commitSha}:${options.snapshotRef}`);
		return { ok: true as const };
	}

	async readRemoteSnapshotTip(options: { readonly remote: string; readonly snapshotRef: string }) {
		this.operations.push(`verify ${options.remote} ${options.snapshotRef}`);
		return this.remoteCommit === null
			? { type: "missing" as const }
			: { type: "found" as const, commitSha: this.remoteCommit };
	}
}

function preparation() {
	return {
		dispatchId: DISPATCH_ID,
		content: "Exact prompt bytes.\n",
		entry: {
			namespace: "dispatch-context" as const,
			key: KEY,
			sourceBranch: BRANCH,
			snapshotRef: SNAPSHOT_REF,
			entryLocator: `${SNAPSHOT_REF}:${KEY}`,
		},
	};
}

describe("deliverPreparedDispatchInstruction", () => {
	test("creates without overwrite, exactly publishes, verifies, and returns generic evidence", async () => {
		const memory = new RecordingMemory();
		const snapshots = new RecordingSnapshots();

		const outcome = await deliverPreparedDispatchInstruction(
			{ cwd: "/repo" },
			preparation(),
			{ brmem: memory, snapshots },
			"origin",
		);

		expect(memory.creates).toEqual([
			{
				namespace: "dispatch-context",
				key: KEY,
				branch: BRANCH,
				content: "Exact prompt bytes.\n",
			},
		]);
		expect(snapshots.operations).toEqual([
			`publish origin ${COMMIT}:${SNAPSHOT_REF}`,
			`verify origin ${SNAPSHOT_REF}`,
		]);
		expect(outcome).toMatchObject({
			status: "ready",
			dispatchId: DISPATCH_ID,
			locator: {
				namespace: "dispatch-context",
				dispatchId: DISPATCH_ID,
				key: KEY,
				sourceBranch: BRANCH,
				snapshotRef: SNAPSHOT_REF,
				snapshotCommitSha: COMMIT,
				entryLocator: `${SNAPSHOT_REF}:${KEY}`,
			},
			artifacts: [
				{ type: "branch-memory-entry", commitSha: COMMIT },
				{ type: "published-snapshot-ref", commitSha: COMMIT },
			],
		});
	});

	test("retains both durable artifacts when remote verification mismatches", async () => {
		const outcome = await deliverPreparedDispatchInstruction(
			{ cwd: "/repo" },
			preparation(),
			{ brmem: new RecordingMemory(), snapshots: new RecordingSnapshots(null) },
			"origin",
		);

		expect(outcome).toMatchObject({
			status: "remote-snapshot-mismatch",
			expectedCommitSha: COMMIT,
			actualCommitSha: null,
			artifacts: [{ type: "branch-memory-entry" }, { type: "published-snapshot-ref" }],
		});
	});
});
