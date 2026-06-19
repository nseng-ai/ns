import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
	RealSlotGtGateway,
	type GraphiteMetadataDbAccess,
	type GraphiteMetadataJsonQueryResult,
	type GtCommandFailure,
} from "../../src/gateways/gt.ts";
import { FakeSlotGitGateway } from "../../src/gateways/fakes/git.ts";

interface MetadataRow {
	branch_name: string | number | null;
	parent_branch_name?: string | null | undefined;
	children?: string | number | null | undefined;
	validation_result?: string | null | undefined;
}

const COMMON_DIR = "/repo/.git";
const DB_PATH = join(COMMON_DIR, ".graphite_metadata.db");

const expectedSchemaRows = [
	{ name: "branch_name" },
	{ name: "parent_branch_name" },
	{ name: "children" },
	{ name: "validation_result" },
] as const;

describe("RealSlotGtGateway stack metadata adapter", () => {
	it("reads a happy linear stack with a clean trunk marker", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "feature/a",
			rows: [
				trunk("master", { children: '["feature/a"]' }),
				row("feature/a", { parent_branch_name: "master", children: '["feature/b"]' }),
				row("feature/b", { parent_branch_name: "feature/a" }),
			],
		});

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "stack",
			stack: {
				trunk: "master",
				current: "feature/a",
				ancestors: ["master"],
				descendants: ["feature/b"],
				ancestorTermination: { type: "completed" },
				descendantWalk: { termination: { type: "completed" } },
				trunkMarker: { type: "clean" },
			},
		});
	});

	it("reports the current branch as untracked when no metadata row exists", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "feature/missing",
			rows: [trunk("master")],
		});

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "untracked_branch",
			message: "current branch is not tracked by Graphite: feature/missing",
		});
	});

	it("reports a missing metadata database", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "feature/a",
			rows: [trunk("master")],
			exists: false,
		});

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "failure",
			failure: {
				message: `Graphite metadata store not found at ${DB_PATH}`,
				returnCode: null,
			},
		});
	});

	it("reports schema mismatches", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "feature/a",
			rows: [trunk("master")],
			schema: { type: "success", data: [{ name: "branch_name" }] },
		});

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "failure",
			failure: {
				message: "Graphite metadata schema mismatch: branch_metadata missing required column",
			},
		});
	});

	it("ignores empty branch-name rows while preserving tracked branches", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "master",
			rows: [trunk("master"), row("")],
		});

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "stack",
			stack: { current: "master", trunkMarker: { type: "clean" } },
		});
	});

	it.each([
		["not_text", 7],
		["invalid_json", "not json"],
		["not_list", "{}"],
		["non_string", '["feature/b", 1]'],
	] as const)("preserves child corruption kind %s", async (kind, children) => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "feature/a",
			rows: [
				trunk("master", { children: '["feature/a"]' }),
				row("feature/a", { parent_branch_name: "master", children }),
			],
		});

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "stack",
			stack: { descendantWalk: { childrenCorruptions: [{ branch: "feature/a", kind }] } },
		});
	});

	it("detects ancestor cycles", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "feature/a",
			rows: [
				trunk("master"),
				row("feature/a", { parent_branch_name: "feature/b" }),
				row("feature/b", { parent_branch_name: "feature/a" }),
			],
		});

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "stack",
			stack: { ancestorTermination: { type: "cycle", branch: "feature/a" } },
		});
	});

	it("detects missing ancestor rows", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "feature/a",
			rows: [trunk("master"), row("feature/a", { parent_branch_name: "feature/missing" })],
		});

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "stack",
			stack: { ancestorTermination: { type: "row_missing", branch: "feature/missing" } },
		});
	});

	it("detects descendant cycles", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "feature/a",
			rows: [
				trunk("master", { children: '["feature/a"]' }),
				row("feature/a", { parent_branch_name: "master", children: '["feature/b"]' }),
				row("feature/b", { parent_branch_name: "feature/a", children: '["feature/a"]' }),
			],
		});

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "stack",
			stack: { descendantWalk: { termination: { type: "cycle", branch: "feature/a" } } },
		});
	});

	it("detects missing descendant rows", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "feature/a",
			rows: [
				trunk("master", { children: '["feature/a"]' }),
				row("feature/a", { parent_branch_name: "master", children: '["feature/missing"]' }),
			],
		});

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "stack",
			stack: {
				descendantWalk: { termination: { type: "row_missing", branch: "feature/missing" } },
			},
		});
	});

	it("records forked descendants", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "feature/a",
			rows: [
				trunk("master", { children: '["feature/a"]' }),
				row("feature/a", {
					parent_branch_name: "master",
					children: '["feature/b", "feature/c"]',
				}),
				row("feature/b", { parent_branch_name: "feature/a" }),
				row("feature/c", { parent_branch_name: "feature/a" }),
			],
		});

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "stack",
			stack: {
				descendantWalk: {
					forks: [{ branch: "feature/a", children: ["feature/b", "feature/c"] }],
				},
			},
		});
	});

	it.each([
		[
			"row-missing",
			[row("feature/a", { parent_branch_name: "master" })],
			{ terminusState: "row_missing", terminus: "master", markedTrunks: [] },
		],
		[
			"unmarked",
			[row("master"), row("feature/a", { parent_branch_name: "master" })],
			{ terminusState: "unmarked", terminus: "master", markedTrunks: [] },
		],
		[
			"multiple",
			[trunk("master"), trunk("other"), row("feature/a", { parent_branch_name: "master" })],
			{ terminusState: "marked", terminus: "master", markedTrunks: ["master", "other"] },
		],
		[
			"different",
			[row("master"), trunk("other"), row("feature/a", { parent_branch_name: "master" })],
			{ terminusState: "unmarked", terminus: "master", markedTrunks: ["other"] },
		],
	] as const)("reports %s trunk marker problems", async (_name, rows, problem) => {
		const { gateway } = gatewayWithMetadata({ currentBranch: "feature/a", rows });

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "stack",
			stack: { trunkMarker: { type: "problem", ...problem } },
		});
	});

	it("reports metadata DB access failures", async () => {
		const failure = failureResult("sqlite3 command not found while reading Graphite metadata");
		const { gateway } = gatewayWithMetadata({
			currentBranch: "master",
			rows: [trunk("master")],
			schema: failure,
		});

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "failure",
			failure: {
				message: "sqlite3 command not found while reading Graphite metadata",
				returnCode: null,
			},
		});
	});

	it("reports metadata row query failures", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "master",
			rows: failureResult("bad db", 2),
		});

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "failure",
			failure: { message: "bad db", returnCode: 2 },
		});
	});

	it("reports non-array metadata rows", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "master",
			rows: { type: "success", data: {} },
		});

		await expect(gateway.stack("/repo")).resolves.toMatchObject({
			type: "failure",
			failure: {
				message: "Graphite metadata sqlite output was not an array",
				returnCode: null,
			},
		});
	});

	it("loads stackGraph topology through metadata DB access", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "feature/a",
			rows: [
				trunk("master", { children: '["feature/a"]' }),
				row("feature/a", { parent_branch_name: "master" }),
				row("", { parent_branch_name: null }),
			],
		});

		const result = await gateway.stackGraph("/repo");
		expect(result.type).toBe("graph");
		if (result.type !== "graph") return;
		expect(result.graph.topology.get("feature/a")).toMatchObject({
			branch: "feature/a",
			parent: "master",
		});
		expect(result.graph.diagnostics.emptyBranchNameRows).toBe(1);
	});

	it("reports missing metadata databases for stackGraph through metadata DB access", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "feature/a",
			rows: [trunk("master")],
			exists: false,
		});

		await expect(gateway.stackGraph("/repo")).resolves.toMatchObject({
			type: "failure",
			failure: {
				message: `Graphite metadata store not found at ${DB_PATH}`,
				returnCode: null,
			},
		});
	});

	it("reports metadata DB access failures for stackGraph", async () => {
		const { gateway } = gatewayWithMetadata({
			currentBranch: "feature/a",
			rows: [trunk("master")],
			schema: failureResult("Graphite metadata sqlite output was not valid JSON"),
		});

		await expect(gateway.stackGraph("/repo")).resolves.toMatchObject({
			type: "failure",
			failure: {
				message: "Graphite metadata sqlite output was not valid JSON",
				returnCode: null,
			},
		});
	});
});

function row(
	branch: string | number | null,
	options: Omit<MetadataRow, "branch_name"> = {},
): MetadataRow {
	return { branch_name: branch, ...options };
}

function trunk(
	branch: string,
	options: Omit<MetadataRow, "branch_name" | "validation_result"> = {},
): MetadataRow {
	return row(branch, { ...options, validation_result: "TRUNK" });
}

function gatewayWithMetadata(options: {
	currentBranch: string;
	rows: readonly MetadataRow[] | GraphiteMetadataJsonQueryResult;
	exists?: boolean | undefined;
	schema?: GraphiteMetadataJsonQueryResult | undefined;
}): { gateway: RealSlotGtGateway; dbAccess: FakeGraphiteMetadataDbAccess } {
	const rows: GraphiteMetadataJsonQueryResult = isMetadataRows(options.rows)
		? { type: "success", data: options.rows }
		: options.rows;
	const dbAccess = new FakeGraphiteMetadataDbAccess({
		exists: options.exists ?? true,
		schema: options.schema ?? { type: "success", data: expectedSchemaRows },
		rows,
	});
	return {
		gateway: new RealSlotGtGateway({
			git: new FakeSlotGitGateway({
				gitCommonDir: COMMON_DIR,
				worktrees: [{ path: "/repo", branch: options.currentBranch }],
			}),
			metadataDbAccess: dbAccess,
		}),
		dbAccess,
	};
}

function isMetadataRows(
	value: readonly MetadataRow[] | GraphiteMetadataJsonQueryResult,
): value is readonly MetadataRow[] {
	return Array.isArray(value);
}

function failureResult(
	message: string,
	returnCode: number | null = null,
): GraphiteMetadataJsonQueryResult {
	return { type: "failure", failure: { message, returnCode } satisfies GtCommandFailure };
}

class FakeGraphiteMetadataDbAccess implements GraphiteMetadataDbAccess {
	private readonly doesDbExist: boolean;
	private readonly schema: GraphiteMetadataJsonQueryResult;
	private readonly rows: GraphiteMetadataJsonQueryResult;

	constructor(options: {
		exists: boolean;
		schema: GraphiteMetadataJsonQueryResult;
		rows: GraphiteMetadataJsonQueryResult;
	}) {
		this.doesDbExist = options.exists;
		this.schema = options.schema;
		this.rows = options.rows;
	}

	exists(_dbPath: string): boolean {
		return this.doesDbExist;
	}

	queryJson(_dbPath: string, query: string): GraphiteMetadataJsonQueryResult {
		if (query.startsWith("PRAGMA table_info")) return this.schema;
		return this.rows;
	}
}
