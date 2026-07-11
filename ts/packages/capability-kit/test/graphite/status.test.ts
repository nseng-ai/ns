import { describe, expect, test } from "vitest";

import {
	graphiteMetadataWorkerRequestFromValue,
	graphiteMetadataWorkerResponseFromValue,
	loadGraphiteMetadataStatus,
} from "@nseng-ai/capability-kit/graphite/status";
import type { LocalBranchRefReadResult } from "@nseng-ai/foundation/git";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";
import {
	GRAPHITE_BRANCH_METADATA_QUERY,
	type GraphiteMetadataDbAccess,
	type SqliteJsonError,
} from "@nseng-ai/capability-kit/graphite/metadata";
const DB_PATH = "/repo/.git/.graphite_metadata.db";
const EXPECTED_SCHEMA_ROWS = [
	{ name: "branch_name" },
	{ name: "parent_branch_name" },
	{ name: "children" },
	{ name: "validation_result" },
];

class FakeGraphiteMetadataDbAccess implements GraphiteMetadataDbAccess {
	readonly queries: string[] = [];
	private readonly responses: SqliteJsonOutcome[];
	private readonly shouldExist: boolean;

	constructor(
		options: {
			exists?: boolean;
			responses?: readonly SqliteJsonOutcome[];
		} = {},
	) {
		this.shouldExist = options.exists ?? true;
		this.responses = [...(options.responses ?? [])];
	}

	exists(dbPath: string): boolean {
		expect(dbPath).toBe(DB_PATH);
		return this.shouldExist;
	}

	queryJson(dbPath: string, query: string): SqliteJsonOutcome {
		expect(dbPath).toBe(DB_PATH);
		this.queries.push(query);
		return this.responses.shift() ?? failure("read-failed");
	}
}

type SqliteJsonOutcome = Result<unknown, SqliteJsonError>;

function success(data: unknown): SqliteJsonOutcome {
	return resultOk(data);
}

function failure(reason: "sqlite-unavailable" | "read-failed"): SqliteJsonOutcome {
	return resultErr(reason === "sqlite-unavailable" ? sqliteCommandMissing() : sqliteInvalidJson());
}

function sqliteCommandMissing(): SqliteJsonError {
	return {
		type: "command-missing",
		code: "sqlite-command-missing",
		message: "sqlite3 command not found",
	};
}

function sqliteInvalidJson(): SqliteJsonError {
	return {
		type: "invalid-json",
		code: "sqlite-invalid-json",
		message: "sqlite3 output was not valid JSON",
	};
}

function branchRow(input: {
	branchName: string;
	parentBranchName?: string;
	children?: readonly unknown[];
	validationResult?: string;
	rawChildren?: unknown;
}): Record<string, unknown> {
	return {
		branch_name: input.branchName,
		parent_branch_name: input.parentBranchName,
		children: input.rawChildren ?? JSON.stringify(input.children ?? []),
		validation_result: input.validationResult,
	};
}

function loadWithFake(
	dbAccess: GraphiteMetadataDbAccess,
	options: {
		currentBranch?: string;
		liveBranches?: Iterable<string>;
		branchLookup?: LocalBranchRefReadResult;
	} = {},
) {
	const currentBranch = options.currentBranch ?? "feature/current";
	const liveBranchLookup =
		options.branchLookup ??
		({
			ok: true,
			branches: new Set(options.liveBranches ?? []),
		} satisfies LocalBranchRefReadResult);
	return loadGraphiteMetadataStatus(
		{ commonGitDir: "/repo/.git", currentBranch },
		{ dbAccess, branchAccess: { listLocalBranches: () => liveBranchLookup } },
	);
}

function failedBranchLookup(): LocalBranchRefReadResult {
	return {
		ok: false,
		reason: "branch-ref-read-failed",
		message: "refs unavailable",
		path: "/repo/.git/refs/heads",
		error: new Error("refs unavailable"),
	};
}

describe("Graphite metadata status lookup", () => {
	test("reports unavailable when metadata DB is missing", () => {
		const dbAccess = new FakeGraphiteMetadataDbAccess({ exists: false });

		expect(loadWithFake(dbAccess)).toEqual({
			type: "unavailable",
			reason: "missing-db",
			currentBranch: "feature/current",
		});
		expect(dbAccess.queries).toEqual([]);
	});

	test("loads the current branch topology and stack counts from the full branch table", () => {
		const dbAccess = new FakeGraphiteMetadataDbAccess({
			responses: [
				success(EXPECTED_SCHEMA_ROWS),
				success([
					branchRow({
						branchName: "main",
						children: ["feature/current"],
						validationResult: "TRUNK",
					}),
					branchRow({
						branchName: "feature/current",
						parentBranchName: "main",
						children: ["feature/child"],
					}),
					branchRow({ branchName: "feature/child", parentBranchName: "feature/current" }),
					branchRow({ branchName: "feature/unrelated", parentBranchName: "main" }),
				]),
			],
		});

		expect(loadWithFake(dbAccess, { liveBranches: ["feature/child"] })).toEqual({
			type: "tracked",
			currentBranch: "feature/current",
			parent: "main",
			children: ["feature/child"],
			isCurrentTrunk: false,
			stackTopologyCounts: { downstackCount: 0, upstackCount: 1 },
		});
		expect(dbAccess.queries[1]).toBe(GRAPHITE_BRANCH_METADATA_QUERY);
	});

	test("counts stacked branches below excluding trunk and above across the subtree", () => {
		const dbAccess = new FakeGraphiteMetadataDbAccess({
			responses: [
				success(EXPECTED_SCHEMA_ROWS),
				success([
					branchRow({ branchName: "main", children: ["feature/base"], validationResult: "TRUNK" }),
					branchRow({
						branchName: "feature/base",
						parentBranchName: "main",
						children: ["feature/current"],
					}),
					branchRow({
						branchName: "feature/current",
						parentBranchName: "feature/base",
						children: ["feature/top", "feature/sibling"],
					}),
					branchRow({ branchName: "feature/top", parentBranchName: "feature/current" }),
					branchRow({ branchName: "feature/sibling", parentBranchName: "feature/current" }),
				]),
			],
		});

		expect(
			loadWithFake(dbAccess, { liveBranches: ["feature/top", "feature/sibling"] }),
		).toMatchObject({
			type: "tracked",
			stackTopologyCounts: { downstackCount: 1, upstackCount: 2 },
		});
	});

	test("excludes dead-ref children from the upstack count", () => {
		const dbAccess = new FakeGraphiteMetadataDbAccess({
			responses: [
				success(EXPECTED_SCHEMA_ROWS),
				success([
					branchRow({
						branchName: "main",
						children: ["feature/current"],
						validationResult: "TRUNK",
					}),
					branchRow({
						branchName: "feature/current",
						parentBranchName: "main",
						children: ["feature/live", "feature/phantom"],
					}),
					branchRow({ branchName: "feature/live", parentBranchName: "feature/current" }),
					branchRow({ branchName: "feature/phantom", parentBranchName: "feature/current" }),
				]),
			],
		});

		expect(loadWithFake(dbAccess, { liveBranches: ["feature/live"] })).toMatchObject({
			type: "tracked",
			children: ["feature/live"],
			stackTopologyCounts: { upstackCount: 1 },
		});
	});

	test("omits the downstack count when an ancestor metadata row is missing", () => {
		const dbAccess = new FakeGraphiteMetadataDbAccess({
			responses: [
				success(EXPECTED_SCHEMA_ROWS),
				success([branchRow({ branchName: "feature/current", parentBranchName: "feature/ghost" })]),
			],
		});

		const status = loadWithFake(dbAccess);
		expect(status).toMatchObject({
			type: "tracked",
			stackTopologyCounts: { upstackCount: 0 },
		});
		if (status.type !== "tracked") throw new Error("expected tracked metadata status");
		expect(Object.hasOwn(status.stackTopologyCounts ?? {}, "downstackCount")).toBe(false);
	});

	test("degrades to counting-once when the metadata topology contains a cycle", () => {
		const dbAccess = new FakeGraphiteMetadataDbAccess({
			responses: [
				success(EXPECTED_SCHEMA_ROWS),
				success([
					branchRow({
						branchName: "feature/current",
						parentBranchName: "feature/loop",
						children: ["feature/loop"],
					}),
					branchRow({
						branchName: "feature/loop",
						parentBranchName: "feature/current",
						children: ["feature/current"],
					}),
				]),
			],
		});

		const status = loadWithFake(dbAccess, { liveBranches: ["feature/current", "feature/loop"] });
		// The parent chain cannot complete, so the downstack count is unknown; the
		// upstack traversal still counts each reachable branch once.
		expect(status).toMatchObject({
			type: "tracked",
			stackTopologyCounts: { upstackCount: 1 },
		});
		if (status.type !== "tracked") throw new Error("expected tracked metadata status");
		expect(Object.hasOwn(status.stackTopologyCounts ?? {}, "downstackCount")).toBe(false);
	});

	test("marks the current branch as trunk case-insensitively", () => {
		const dbAccess = new FakeGraphiteMetadataDbAccess({
			responses: [
				success(EXPECTED_SCHEMA_ROWS),
				success([
					branchRow({
						branchName: "main",
						children: ["feature/current"],
						validationResult: "trunk",
					}),
				]),
			],
		});

		expect(
			loadWithFake(dbAccess, { currentBranch: "main", liveBranches: ["feature/current"] }),
		).toEqual({
			type: "tracked",
			currentBranch: "main",
			parent: undefined,
			children: ["feature/current"],
			isCurrentTrunk: true,
			stackTopologyCounts: { downstackCount: 0, upstackCount: 1 },
		});
	});

	test("reports untracked when the current branch has no row", () => {
		const dbAccess = new FakeGraphiteMetadataDbAccess({
			responses: [success(EXPECTED_SCHEMA_ROWS), success([])],
		});

		expect(loadWithFake(dbAccess)).toEqual({
			type: "untracked",
			currentBranch: "feature/current",
		});
	});

	test("reports schema mismatch when required columns are missing", () => {
		const dbAccess = new FakeGraphiteMetadataDbAccess({
			responses: [success([{ name: "branch_name" }, { name: "parent_branch_name" }])],
		});

		expect(loadWithFake(dbAccess)).toEqual({
			type: "unavailable",
			reason: "schema-mismatch",
			currentBranch: "feature/current",
		});
	});

	test("treats malformed children JSON as no children", () => {
		const dbAccess = new FakeGraphiteMetadataDbAccess({
			responses: [
				success(EXPECTED_SCHEMA_ROWS),
				success([
					branchRow({
						branchName: "feature/current",
						parentBranchName: "main",
						rawChildren: "not json",
					}),
				]),
			],
		});

		expect(loadWithFake(dbAccess)).toMatchObject({ type: "tracked", children: [] });
	});

	test("keeps only string children from metadata arrays", () => {
		const dbAccess = new FakeGraphiteMetadataDbAccess({
			responses: [
				success(EXPECTED_SCHEMA_ROWS),
				success([
					branchRow({
						branchName: "feature/current",
						parentBranchName: "main",
						rawChildren: '["feature/one", 123, null, "feature/two"]',
					}),
				]),
			],
		});

		expect(loadWithFake(dbAccess, { liveBranches: ["feature/one", "feature/two"] })).toMatchObject({
			type: "tracked",
			children: ["feature/one", "feature/two"],
		});
	});

	test("drops children whose local ref is gone so the up branch matches gt", () => {
		const dbAccess = new FakeGraphiteMetadataDbAccess({
			responses: [
				success(EXPECTED_SCHEMA_ROWS),
				success([
					branchRow({
						branchName: "feature/current",
						parentBranchName: "main",
						children: ["feature/live", "feature/phantom"],
					}),
				]),
			],
		});

		expect(loadWithFake(dbAccess, { liveBranches: ["feature/live"] })).toMatchObject({
			type: "tracked",
			children: ["feature/live"],
		});
	});

	test("fails closed when live branch enumeration is incomplete", () => {
		const dbAccess = new FakeGraphiteMetadataDbAccess({
			responses: [
				success(EXPECTED_SCHEMA_ROWS),
				success([
					branchRow({
						branchName: "feature/current",
						parentBranchName: "main",
						children: ["feature/live", "feature/maybe-live"],
					}),
				]),
			],
		});

		expect(loadWithFake(dbAccess, { branchLookup: failedBranchLookup() })).toEqual({
			type: "unavailable",
			reason: "branch-ref-read-failed",
			currentBranch: "feature/current",
		});
	});

	test("maps sqlite unavailable and read failures from the db access seam", () => {
		const sqliteUnavailable = new FakeGraphiteMetadataDbAccess({
			responses: [failure("sqlite-unavailable")],
		});
		expect(loadWithFake(sqliteUnavailable)).toEqual({
			type: "unavailable",
			reason: "sqlite-unavailable",
			currentBranch: "feature/current",
		});

		const readFailed = new FakeGraphiteMetadataDbAccess({
			responses: [success(EXPECTED_SCHEMA_ROWS), failure("read-failed")],
		});
		expect(loadWithFake(readFailed)).toEqual({
			type: "unavailable",
			reason: "read-failed",
			currentBranch: "feature/current",
		});
	});

	test("treats non-array row query data as a read failure", () => {
		const dbAccess = new FakeGraphiteMetadataDbAccess({
			responses: [success(EXPECTED_SCHEMA_ROWS), success({ not: "rows" })],
		});

		expect(loadWithFake(dbAccess)).toEqual({
			type: "unavailable",
			reason: "read-failed",
			currentBranch: "feature/current",
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

		const trackedWithCounts = {
			type: "tracked",
			currentBranch: "feature/current",
			parent: "main",
			children: [],
			isCurrentTrunk: false,
			stackTopologyCounts: { downstackCount: 2, upstackCount: 1 },
		};
		expect(
			graphiteMetadataWorkerResponseFromValue({ type: "success", status: trackedWithCounts }),
		).toEqual({ type: "success", status: trackedWithCounts });
		expect(
			graphiteMetadataWorkerResponseFromValue({
				type: "success",
				status: {
					...trackedWithCounts,
					stackTopologyCounts: { downstackCount: "2", upstackCount: 1 },
				},
			}),
		).toBeUndefined();
		expect(
			graphiteMetadataWorkerResponseFromValue({
				type: "success",
				status: {
					...trackedWithCounts,
					stackTopologyCounts: { downstackCount: 2, upstackCount: -1 },
				},
			}),
		).toBeUndefined();
	});
});
