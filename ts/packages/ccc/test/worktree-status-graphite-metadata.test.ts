import { copyFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
	graphiteMetadataWorkerRequestFromValue,
	graphiteMetadataWorkerResponseFromValue,
	loadGraphiteMetadataStatus,
	loadGraphiteMetadataStatusInWorker,
	shutdownGraphiteMetadataWorker,
	type GraphiteMetadataStatus,
	type GraphiteMetadataWorkerDiagnostic,
	type GraphiteMetadataWorkerHandle,
	type GraphiteMetadataWorkerRequest,
} from "@asdl/ccc/worktree-status/graphite-metadata";
import {
	makeGitRepo,
	withTempRoot,
	runSqliteStatements,
	writeGraphiteMetadataDb,
} from "./worktree-status-fixtures.ts";

class NonRespondingMetadataWorker implements GraphiteMetadataWorkerHandle {
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onerror: ((event: { message?: string; error?: unknown }) => void) | null = null;
	postedRequest: GraphiteMetadataWorkerRequest | undefined;
	isTerminated = false;

	postMessage(message: GraphiteMetadataWorkerRequest): void {
		this.postedRequest = message;
	}

	terminate(): void {
		this.isTerminated = true;
	}
}

class MalformedResponseMetadataWorker implements GraphiteMetadataWorkerHandle {
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onerror: ((event: { message?: string; error?: unknown }) => void) | null = null;
	isTerminated = false;

	postMessage(_message: GraphiteMetadataWorkerRequest): void {
		queueMicrotask(() => this.onmessage?.({ data: { type: "success", status: "bad" } }));
	}

	terminate(): void {
		this.isTerminated = true;
	}
}

class ManualMetadataWorker implements GraphiteMetadataWorkerHandle {
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onerror: ((event: { message?: string; error?: unknown }) => void) | null = null;
	postedRequests: GraphiteMetadataWorkerRequest[] = [];
	isTerminated = false;

	postMessage(message: GraphiteMetadataWorkerRequest): void {
		this.postedRequests.push(message);
	}

	respond(status: GraphiteMetadataStatus): void {
		this.onmessage?.({ data: { type: "success", status } });
	}

	fail(message = "failed"): void {
		this.onmessage?.({ data: { type: "failure", message } });
	}

	malform(): void {
		this.onmessage?.({ data: { type: "success", status: "bad" } });
	}

	terminate(): void {
		this.isTerminated = true;
	}
}

const WORKER_LOOKUP_INPUT = { commonGitDir: "/repo/.git", currentBranch: "feature/current" };
const WORKER_LOOKUP_REQUEST = {
	type: "load_graphite_metadata",
	input: WORKER_LOOKUP_INPUT,
} satisfies GraphiteMetadataWorkerRequest;
const CURRENT_ASDL_TOOLS_METADATA_FIXTURE = new URL(
	"./fixtures/graphite-metadata/asdl-tools-current.graphite_metadata.db",
	import.meta.url,
);

afterEach(() => {
	shutdownGraphiteMetadataWorker();
});

describe("Graphite metadata status lookup", () => {
	test("reports unavailable when metadata DB is missing", async () => {
		await withTempRoot(makeGitRepo("feature/current"), (root) => {
			expect(
				loadGraphiteMetadataStatus({
					commonGitDir: join(root, ".git"),
					currentBranch: "feature/current",
				}),
			).toEqual({
				type: "unavailable",
				reason: "missing-db",
				currentBranch: "feature/current",
			});
		});
	});

	test("loads the current branch parent and children without scanning unrelated rows", async () => {
		await withTempRoot(makeGitRepo("feature/current"), (root) => {
			writeGraphiteMetadataDb(join(root, ".git"), [
				{ branchName: "main", children: ["feature/current"], validationResult: "TRUNK" },
				{ branchName: "feature/current", parentBranchName: "main", children: ["feature/child"] },
				{ branchName: "feature/unrelated", parentBranchName: "main", children: ["feature/noise"] },
			]);

			expect(
				loadGraphiteMetadataStatus({
					commonGitDir: join(root, ".git"),
					currentBranch: "feature/current",
				}),
			).toEqual({
				type: "tracked",
				currentBranch: "feature/current",
				parent: "main",
				children: ["feature/child"],
				isCurrentTrunk: false,
			});
		});
	});

	test("marks the current branch as trunk case-insensitively", async () => {
		await withTempRoot(makeGitRepo("main"), (root) => {
			writeGraphiteMetadataDb(join(root, ".git"), [
				{ branchName: "main", children: ["feature/current"], validationResult: "trunk" },
			]);

			expect(
				loadGraphiteMetadataStatus({ commonGitDir: join(root, ".git"), currentBranch: "main" }),
			).toEqual({
				type: "tracked",
				currentBranch: "main",
				parent: undefined,
				children: ["feature/current"],
				isCurrentTrunk: true,
			});
		});
	});

	test("loads trunk metadata from the copied current asdl-tools Graphite database", async () => {
		await withTempRoot(makeGitRepo("master"), (root) => {
			copyFileSync(
				CURRENT_ASDL_TOOLS_METADATA_FIXTURE,
				join(root, ".git", ".graphite_metadata.db"),
			);

			const status = loadGraphiteMetadataStatus({
				commonGitDir: join(root, ".git"),
				currentBranch: "master",
			});
			expect(status).toMatchObject({
				type: "tracked",
				currentBranch: "master",
				parent: undefined,
				isCurrentTrunk: true,
			});
			if (status.type !== "tracked")
				throw new Error("expected copied Graphite fixture to track master");
			expect(status.children).toContain("add-aretro-branch-retro-command");
			expect(status.children.length).toBeGreaterThan(10);
		});
	});

	test("reports untracked when the current branch has no row", async () => {
		await withTempRoot(makeGitRepo("feature/current"), (root) => {
			writeGraphiteMetadataDb(join(root, ".git"), [
				{ branchName: "main", validationResult: "TRUNK" },
			]);

			expect(
				loadGraphiteMetadataStatus({
					commonGitDir: join(root, ".git"),
					currentBranch: "feature/current",
				}),
			).toEqual({
				type: "untracked",
				currentBranch: "feature/current",
			});
		});
	});

	test("reports schema mismatch when required columns are missing", async () => {
		await withTempRoot(makeGitRepo("feature/current"), (root) => {
			runSqliteStatements(join(root, ".git", ".graphite_metadata.db"), [
				"CREATE TABLE branch_metadata (branch_name TEXT PRIMARY KEY, parent_branch_name TEXT);",
			]);

			expect(
				loadGraphiteMetadataStatus({
					commonGitDir: join(root, ".git"),
					currentBranch: "feature/current",
				}),
			).toEqual({
				type: "unavailable",
				reason: "schema-mismatch",
				currentBranch: "feature/current",
			});
		});
	});

	test("treats malformed children JSON as no children", async () => {
		await withTempRoot(makeGitRepo("feature/current"), (root) => {
			writeGraphiteMetadataDb(join(root, ".git"), [
				{ branchName: "feature/current", parentBranchName: "main", rawChildren: "not json" },
			]);

			const status = loadGraphiteMetadataStatus({
				commonGitDir: join(root, ".git"),
				currentBranch: "feature/current",
			});
			expect(status).toMatchObject({ type: "tracked", children: [] });
		});
	});

	test("keeps only string children from metadata arrays", async () => {
		await withTempRoot(makeGitRepo("feature/current"), (root) => {
			writeGraphiteMetadataDb(join(root, ".git"), [
				{
					branchName: "feature/current",
					parentBranchName: "main",
					rawChildren: '["feature/one", 123, null, "feature/two"]',
				},
			]);

			const status = loadGraphiteMetadataStatus({
				commonGitDir: join(root, ".git"),
				currentBranch: "feature/current",
			});
			expect(status).toMatchObject({ type: "tracked", children: ["feature/one", "feature/two"] });
		});
	});

	test("parses single-request worker protocol messages without request IDs", () => {
		expect(
			graphiteMetadataWorkerRequestFromValue({
				type: "load_graphite_metadata",
				input: { commonGitDir: "/repo/.git", currentBranch: "feature/current" },
			}),
		).toEqual({
			type: "load_graphite_metadata",
			input: { commonGitDir: "/repo/.git", currentBranch: "feature/current" },
		});
		expect(
			graphiteMetadataWorkerRequestFromValue({ type: "load_graphite_metadata" }),
		).toBeUndefined();

		expect(
			graphiteMetadataWorkerResponseFromValue({
				type: "success",
				status: { type: "untracked", currentBranch: "feature/current" },
			}),
		).toEqual({ type: "success", status: { type: "untracked", currentBranch: "feature/current" } });
		expect(graphiteMetadataWorkerResponseFromValue({ type: "failure", message: "failed" })).toEqual(
			{
				type: "failure",
				message: "failed",
			},
		);
		expect(
			graphiteMetadataWorkerResponseFromValue({ type: "success", status: "bad" }),
		).toBeUndefined();
	});

	test("loads metadata through a worker-backed async adapter", async () => {
		await withTempRoot(makeGitRepo("feature/current"), async (root) => {
			writeGraphiteMetadataDb(join(root, ".git"), [
				{ branchName: "main", children: ["feature/current"], validationResult: "TRUNK" },
				{ branchName: "feature/current", parentBranchName: "main", children: ["feature/child"] },
			]);

			expect(
				await loadGraphiteMetadataStatusInWorker({
					commonGitDir: join(root, ".git"),
					currentBranch: "feature/current",
				}),
			).toEqual({
				type: "tracked",
				currentBranch: "feature/current",
				parent: "main",
				children: ["feature/child"],
				isCurrentTrunk: false,
			});
		});
	});

	test("reuses a cached metadata worker across sequential successful lookups", async () => {
		const workers: ManualMetadataWorker[] = [];
		const workerFactory = () => {
			const worker = new ManualMetadataWorker();
			workers.push(worker);
			return worker;
		};

		const firstPromise = loadGraphiteMetadataStatusInWorker(WORKER_LOOKUP_INPUT, { workerFactory });
		expect(workers).toHaveLength(1);
		workers[0]?.respond({ type: "untracked", currentBranch: "feature/current" });
		expect(await firstPromise).toEqual({ type: "untracked", currentBranch: "feature/current" });

		const secondPromise = loadGraphiteMetadataStatusInWorker(WORKER_LOOKUP_INPUT, {
			workerFactory,
		});
		expect(workers).toHaveLength(1);
		workers[0]?.respond({
			type: "tracked",
			currentBranch: "feature/current",
			parent: "main",
			children: [],
			isCurrentTrunk: false,
		});
		expect(await secondPromise).toEqual({
			type: "tracked",
			currentBranch: "feature/current",
			parent: "main",
			children: [],
			isCurrentTrunk: false,
		});

		expect(workers[0]?.postedRequests).toEqual([WORKER_LOOKUP_REQUEST, WORKER_LOOKUP_REQUEST]);
		expect(workers[0]?.isTerminated).toBe(false);
	});

	test("shutdown terminates an idle cached metadata worker", async () => {
		const workers: ManualMetadataWorker[] = [];
		const workerFactory = () => {
			const worker = new ManualMetadataWorker();
			workers.push(worker);
			return worker;
		};

		const firstPromise = loadGraphiteMetadataStatusInWorker(WORKER_LOOKUP_INPUT, { workerFactory });
		workers[0]?.respond({ type: "untracked", currentBranch: "feature/current" });
		expect(await firstPromise).toEqual({ type: "untracked", currentBranch: "feature/current" });

		shutdownGraphiteMetadataWorker();
		expect(workers[0]?.isTerminated).toBe(true);

		const secondPromise = loadGraphiteMetadataStatusInWorker(WORKER_LOOKUP_INPUT, {
			workerFactory,
		});
		expect(workers).toHaveLength(2);
		workers[1]?.respond({ type: "untracked", currentBranch: "feature/current" });
		expect(await secondPromise).toEqual({ type: "untracked", currentBranch: "feature/current" });
	});

	test("timeout discards a cached metadata worker before the next lookup", async () => {
		const workers: ManualMetadataWorker[] = [];
		const workerFactory = () => {
			const worker = new ManualMetadataWorker();
			workers.push(worker);
			return worker;
		};

		const timedOutStatus = await loadGraphiteMetadataStatusInWorker(WORKER_LOOKUP_INPUT, {
			timeoutMs: 1,
			workerFactory,
		});
		expect(timedOutStatus).toEqual({
			type: "unavailable",
			reason: "read-timeout",
			currentBranch: "feature/current",
		});
		expect(workers[0]?.isTerminated).toBe(true);

		const nextPromise = loadGraphiteMetadataStatusInWorker(WORKER_LOOKUP_INPUT, { workerFactory });
		expect(workers).toHaveLength(2);
		workers[1]?.respond({ type: "untracked", currentBranch: "feature/current" });
		expect(await nextPromise).toEqual({ type: "untracked", currentBranch: "feature/current" });
	});

	test("malformed responses discard cached metadata workers before the next lookup", async () => {
		const workers: ManualMetadataWorker[] = [];
		const diagnostics: GraphiteMetadataWorkerDiagnostic[] = [];
		const workerFactory = () => {
			const worker = new ManualMetadataWorker();
			workers.push(worker);
			return worker;
		};

		const malformedPromise = loadGraphiteMetadataStatusInWorker(WORKER_LOOKUP_INPUT, {
			workerFactory,
			onDiagnostic(diagnostic) {
				diagnostics.push(diagnostic);
			},
		});
		workers[0]?.malform();
		expect(await malformedPromise).toEqual({
			type: "unavailable",
			reason: "read-failed",
			currentBranch: "feature/current",
		});
		expect(workers[0]?.isTerminated).toBe(true);
		expect(diagnostics).toEqual([
			{ type: "worker-malformed-response", data: { type: "success", status: "bad" } },
		]);

		const nextPromise = loadGraphiteMetadataStatusInWorker(WORKER_LOOKUP_INPUT, { workerFactory });
		expect(workers).toHaveLength(2);
		workers[1]?.respond({ type: "untracked", currentBranch: "feature/current" });
		expect(await nextPromise).toEqual({ type: "untracked", currentBranch: "feature/current" });
	});

	test("failure responses discard cached metadata workers before the next lookup", async () => {
		const workers: ManualMetadataWorker[] = [];
		const diagnostics: GraphiteMetadataWorkerDiagnostic[] = [];
		const workerFactory = () => {
			const worker = new ManualMetadataWorker();
			workers.push(worker);
			return worker;
		};

		const failedPromise = loadGraphiteMetadataStatusInWorker(WORKER_LOOKUP_INPUT, {
			workerFactory,
			onDiagnostic(diagnostic) {
				diagnostics.push(diagnostic);
			},
		});
		workers[0]?.fail("failed");
		expect(await failedPromise).toEqual({
			type: "unavailable",
			reason: "read-failed",
			currentBranch: "feature/current",
		});
		expect(workers[0]?.isTerminated).toBe(true);
		expect(diagnostics).toEqual([{ type: "worker-failure-response", message: "failed" }]);

		const nextPromise = loadGraphiteMetadataStatusInWorker(WORKER_LOOKUP_INPUT, { workerFactory });
		expect(workers).toHaveLength(2);
		workers[1]?.respond({ type: "untracked", currentBranch: "feature/current" });
		expect(await nextPromise).toEqual({ type: "untracked", currentBranch: "feature/current" });
	});

	test("concurrent lookups use a one-shot fallback instead of sharing a busy cached worker", async () => {
		const workers: ManualMetadataWorker[] = [];
		const workerFactory = () => {
			const worker = new ManualMetadataWorker();
			workers.push(worker);
			return worker;
		};

		const firstPromise = loadGraphiteMetadataStatusInWorker(WORKER_LOOKUP_INPUT, { workerFactory });
		expect(workers).toHaveLength(1);
		const secondPromise = loadGraphiteMetadataStatusInWorker(WORKER_LOOKUP_INPUT, {
			workerFactory,
		});
		expect(workers).toHaveLength(2);

		workers[1]?.respond({
			type: "tracked",
			currentBranch: "feature/current",
			parent: "main",
			children: ["feature/child"],
			isCurrentTrunk: false,
		});
		expect(await secondPromise).toEqual({
			type: "tracked",
			currentBranch: "feature/current",
			parent: "main",
			children: ["feature/child"],
			isCurrentTrunk: false,
		});
		expect(workers[1]?.isTerminated).toBe(true);

		workers[0]?.respond({ type: "untracked", currentBranch: "feature/current" });
		expect(await firstPromise).toEqual({ type: "untracked", currentBranch: "feature/current" });
		expect(workers[0]?.isTerminated).toBe(false);
		expect(workers[0]?.postedRequests).toEqual([WORKER_LOOKUP_REQUEST]);
		expect(workers[1]?.postedRequests).toEqual([WORKER_LOOKUP_REQUEST]);
	});

	test("abort discards the active cached metadata worker before the next lookup", async () => {
		const workers: ManualMetadataWorker[] = [];
		const abortController = new AbortController();
		const workerFactory = () => {
			const worker = new ManualMetadataWorker();
			workers.push(worker);
			return worker;
		};

		const abortedPromise = loadGraphiteMetadataStatusInWorker(WORKER_LOOKUP_INPUT, {
			signal: abortController.signal,
			workerFactory,
		});
		abortController.abort();
		expect(await abortedPromise).toEqual({
			type: "unavailable",
			reason: "read-timeout",
			currentBranch: "feature/current",
		});
		expect(workers[0]?.isTerminated).toBe(true);

		const nextPromise = loadGraphiteMetadataStatusInWorker(WORKER_LOOKUP_INPUT, { workerFactory });
		expect(workers).toHaveLength(2);
		workers[1]?.respond({ type: "untracked", currentBranch: "feature/current" });
		expect(await nextPromise).toEqual({ type: "untracked", currentBranch: "feature/current" });
	});

	test("times out and terminates a nonresponsive metadata worker", async () => {
		const worker = new NonRespondingMetadataWorker();
		const diagnostics: GraphiteMetadataWorkerDiagnostic[] = [];

		const status = await loadGraphiteMetadataStatusInWorker(
			{ commonGitDir: "/repo/.git", currentBranch: "feature/current" },
			{
				timeoutMs: 1,
				workerFactory() {
					return worker;
				},
				onDiagnostic(diagnostic) {
					diagnostics.push(diagnostic);
				},
			},
		);

		expect(worker.postedRequest).toEqual({
			type: "load_graphite_metadata",
			input: { commonGitDir: "/repo/.git", currentBranch: "feature/current" },
		});
		expect(worker.isTerminated).toBe(true);
		expect(diagnostics).toContainEqual({ type: "worker-timeout", timeoutMs: 1 });
		expect(status).toEqual({
			type: "unavailable",
			reason: "read-timeout",
			currentBranch: "feature/current",
		});
	});

	test("degrades malformed metadata worker responses without diagnostics loss", async () => {
		const worker = new MalformedResponseMetadataWorker();
		const diagnostics: GraphiteMetadataWorkerDiagnostic[] = [];

		const status = await loadGraphiteMetadataStatusInWorker(
			{ commonGitDir: "/repo/.git", currentBranch: "feature/current" },
			{
				workerFactory() {
					return worker;
				},
				onDiagnostic(diagnostic) {
					diagnostics.push(diagnostic);
				},
			},
		);

		expect(worker.isTerminated).toBe(true);
		expect(diagnostics).toEqual([
			{ type: "worker-malformed-response", data: { type: "success", status: "bad" } },
		]);
		expect(status).toEqual({
			type: "unavailable",
			reason: "read-failed",
			currentBranch: "feature/current",
		});
	});

	test("diagnostic callback failures do not block worker cleanup", async () => {
		const worker = new MalformedResponseMetadataWorker();

		const status = await loadGraphiteMetadataStatusInWorker(
			{ commonGitDir: "/repo/.git", currentBranch: "feature/current" },
			{
				workerFactory() {
					return worker;
				},
				onDiagnostic() {
					throw new Error("diagnostic sink failed");
				},
			},
		);

		expect(worker.isTerminated).toBe(true);
		expect(status).toEqual({
			type: "unavailable",
			reason: "read-failed",
			currentBranch: "feature/current",
		});
	});
});
