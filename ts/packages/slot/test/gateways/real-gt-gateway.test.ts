import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { RealSlotGtGateway, type SqliteJsonRunner } from "../../src/gateways/gt.ts";
import { FakeSlotGitGateway } from "../../src/gateways/fakes/git.ts";

interface MetadataRow {
	branch: string | number | null;
	parent?: string | null | undefined;
	children?: string | number | null | undefined;
	validation?: string | null | undefined;
}

const canRunSqlite = spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).status === 0;
const fixtureIt = canRunSqlite ? it : it.skip;

describe("RealSlotGtGateway stack metadata adapter", () => {
	fixtureIt("reads a happy linear stack with a clean trunk marker", async () => {
		await withMetadataDb({ currentBranch: "feature/a", rows: [trunk("master", { children: '["feature/a"]' }), row("feature/a", { parent: "master", children: '["feature/b"]' }), row("feature/b", { parent: "feature/a" })] }, async ({ gateway }) => {
			await expect(gateway.stack("/repo")).resolves.toMatchObject({
				type: "stack",
				stack: { trunk: "master", current: "feature/a", ancestors: ["master"], children: ["feature/b"], descendants: ["feature/b"], ancestorTermination: { type: "completed" }, descendantWalk: { termination: { type: "completed" } }, trunkMarker: { type: "clean" }, emptyBranchNameRows: 0 },
			});
		});
	});

	fixtureIt("reports the current branch as untracked when no metadata row exists", async () => {
		await withMetadataDb({ currentBranch: "feature/missing", rows: [trunk("master")] }, async ({ gateway }) => {
			await expect(gateway.stack("/repo")).resolves.toMatchObject({ type: "untracked_branch", message: "current branch is not tracked by Graphite: feature/missing" });
		});
	});

	fixtureIt("reports a missing metadata database", async () => {
		await withMetadataDb({ currentBranch: "feature/a", rows: [trunk("master")], skipDb: true }, async ({ gateway, commonDir }) => {
			await expect(gateway.stack("/repo")).resolves.toMatchObject({ type: "failure", failure: { message: `Graphite metadata store not found at ${join(commonDir, ".graphite_metadata.db")}`, returnCode: null } });
		});
	});

	fixtureIt("reports schema mismatches", async () => {
		await withTempDir(async (commonDir) => {
			const dbPath = join(commonDir, ".graphite_metadata.db");
			execFileSync("sqlite3", [dbPath, "CREATE TABLE branch_metadata (branch_name TEXT)"]);
			const gateway = gatewayFor(commonDir, "feature/a");
			await expect(gateway.stack("/repo")).resolves.toMatchObject({ type: "failure", failure: { message: "Graphite metadata schema mismatch: branch_metadata missing required column" } });
		});
	});

	fixtureIt("counts empty branch-name rows", async () => {
		await withMetadataDb({ currentBranch: "master", rows: [trunk("master"), row("")] }, async ({ gateway }) => {
			await expect(gateway.stack("/repo")).resolves.toMatchObject({ type: "stack", stack: { emptyBranchNameRows: 1 } });
		});
	});

	fixtureIt.each([
		["not_text", 7],
		["invalid_json", "not json"],
		["not_list", "{}"],
		["non_string", '["feature/b", 1]'],
	] as const)("preserves child corruption kind %s", async (kind, children) => {
		await withMetadataDb({ currentBranch: "feature/a", rows: [trunk("master", { children: '["feature/a"]' }), row("feature/a", { parent: "master", children })] }, async ({ gateway }) => {
			await expect(gateway.stack("/repo")).resolves.toMatchObject({ type: "stack", stack: { descendantWalk: { childrenCorruptions: [{ branch: "feature/a", kind }] } } });
		});
	});

	fixtureIt("detects ancestor cycles", async () => {
		await withMetadataDb({ currentBranch: "feature/a", rows: [trunk("master"), row("feature/a", { parent: "feature/b" }), row("feature/b", { parent: "feature/a" })] }, async ({ gateway }) => {
			await expect(gateway.stack("/repo")).resolves.toMatchObject({ type: "stack", stack: { ancestorTermination: { type: "cycle", branch: "feature/a" } } });
		});
	});

	fixtureIt("detects missing ancestor rows", async () => {
		await withMetadataDb({ currentBranch: "feature/a", rows: [trunk("master"), row("feature/a", { parent: "feature/missing" })] }, async ({ gateway }) => {
			await expect(gateway.stack("/repo")).resolves.toMatchObject({ type: "stack", stack: { ancestorTermination: { type: "row_missing", branch: "feature/missing" } } });
		});
	});

	fixtureIt("detects descendant cycles", async () => {
		await withMetadataDb({ currentBranch: "feature/a", rows: [trunk("master", { children: '["feature/a"]' }), row("feature/a", { parent: "master", children: '["feature/b"]' }), row("feature/b", { parent: "feature/a", children: '["feature/a"]' })] }, async ({ gateway }) => {
			await expect(gateway.stack("/repo")).resolves.toMatchObject({ type: "stack", stack: { descendantWalk: { termination: { type: "cycle", branch: "feature/a" } } } });
		});
	});

	fixtureIt("detects missing descendant rows", async () => {
		await withMetadataDb({ currentBranch: "feature/a", rows: [trunk("master", { children: '["feature/a"]' }), row("feature/a", { parent: "master", children: '["feature/missing"]' })] }, async ({ gateway }) => {
			await expect(gateway.stack("/repo")).resolves.toMatchObject({ type: "stack", stack: { descendantWalk: { termination: { type: "row_missing", branch: "feature/missing" } } } });
		});
	});

	fixtureIt("records forked descendants", async () => {
		await withMetadataDb({ currentBranch: "feature/a", rows: [trunk("master", { children: '["feature/a"]' }), row("feature/a", { parent: "master", children: '["feature/b", "feature/c"]' }), row("feature/b", { parent: "feature/a" }), row("feature/c", { parent: "feature/a" })] }, async ({ gateway }) => {
			await expect(gateway.stack("/repo")).resolves.toMatchObject({ type: "stack", stack: { descendantWalk: { forks: [{ branch: "feature/a", children: ["feature/b", "feature/c"] }] } } });
		});
	});

	fixtureIt.each([
		["row-missing", [row("feature/a", { parent: "master" })], { terminusState: "row_missing", terminus: "master", markedTrunks: [] }],
		["unmarked", [row("master"), row("feature/a", { parent: "master" })], { terminusState: "unmarked", terminus: "master", markedTrunks: [] }],
		["multiple", [trunk("master"), trunk("other"), row("feature/a", { parent: "master" })], { terminusState: "marked", terminus: "master", markedTrunks: ["master", "other"] }],
		["different", [row("master"), trunk("other"), row("feature/a", { parent: "master" })], { terminusState: "unmarked", terminus: "master", markedTrunks: ["other"] }],
	] as const)("reports %s trunk marker problems", async (_name, rows, problem) => {
		await withMetadataDb({ currentBranch: "feature/a", rows }, async ({ gateway }) => {
			await expect(gateway.stack("/repo")).resolves.toMatchObject({ type: "stack", stack: { trunkMarker: { type: "problem", ...problem } } });
		});
	});

	it("reports missing sqlite binary through the runner seam", async () => {
		await withRunner({ error: Object.assign(new Error("spawn sqlite3 ENOENT"), { code: "ENOENT" }), status: null, stdout: "", stderr: "" }, async (gateway) => {
			await expect(gateway.stack("/repo")).resolves.toMatchObject({ type: "failure", failure: { message: "sqlite3 command not found while reading Graphite metadata", returnCode: null } });
		});
	});

	it("reports sqlite nonzero exits through the runner seam", async () => {
		await withRunner({ status: 2, stdout: "", stderr: "bad db" }, async (gateway) => {
			await expect(gateway.stack("/repo")).resolves.toMatchObject({ type: "failure", failure: { message: "bad db", returnCode: 2 } });
		});
	});

	it("reports invalid sqlite JSON through the runner seam", async () => {
		await withRunner({ status: 0, stdout: "not json", stderr: "" }, async (gateway) => {
			await expect(gateway.stack("/repo")).resolves.toMatchObject({ type: "failure", failure: { message: "Graphite metadata sqlite output was not valid JSON", returnCode: null } });
		});
	});
});

function row(branch: string | number | null, options: Omit<MetadataRow, "branch"> = {}): MetadataRow {
	return { branch, ...options };
}

function trunk(branch: string, options: Omit<MetadataRow, "branch" | "validation"> = {}): MetadataRow {
	return row(branch, { ...options, validation: "TRUNK" });
}

async function withMetadataDb(options: { currentBranch: string; rows: readonly MetadataRow[]; skipDb?: boolean | undefined }, run: (context: { gateway: RealSlotGtGateway; commonDir: string }) => Promise<void>): Promise<void> {
	await withTempDir(async (commonDir) => {
		if (options.skipDb !== true) createMetadataDb(join(commonDir, ".graphite_metadata.db"), options.rows);
		await run({ gateway: gatewayFor(commonDir, options.currentBranch), commonDir });
	});
}

async function withRunner(result: ReturnType<SqliteJsonRunner["run"]>, run: (gateway: RealSlotGtGateway) => Promise<void>): Promise<void> {
	await withTempDir(async (commonDir) => {
		await writeFile(join(commonDir, ".graphite_metadata.db"), "");
		const sqliteRunner: SqliteJsonRunner = { run: () => result };
		await run(gatewayFor(commonDir, "master", sqliteRunner));
	});
}

function gatewayFor(commonDir: string, currentBranch: string, sqliteRunner?: SqliteJsonRunner | undefined): RealSlotGtGateway {
	return new RealSlotGtGateway({ git: new FakeSlotGitGateway({ gitCommonDir: commonDir, worktrees: [{ path: "/repo", branch: currentBranch }] }), sqliteRunner });
}

async function withTempDir(run: (commonDir: string) => Promise<void>): Promise<void> {
	const commonDir = await mkdtemp(join(tmpdir(), "slot-real-gt-"));
	try {
		await run(commonDir);
	} finally {
		await rm(commonDir, { recursive: true, force: true });
	}
}

function createMetadataDb(dbPath: string, rows: readonly MetadataRow[]): void {
	const statements = [
		"CREATE TABLE branch_metadata (branch_name TEXT, parent_branch_name TEXT, children, validation_result TEXT);",
		...rows.map((record) => `INSERT INTO branch_metadata (branch_name, parent_branch_name, children, validation_result) VALUES (${sqlValue(record.branch)}, ${sqlValue(record.parent ?? null)}, ${sqlValue(record.children ?? null)}, ${sqlValue(record.validation ?? null)});`),
	].join("\n");
	execFileSync("sqlite3", [dbPath, statements]);
}

function sqlValue(value: string | number | null): string {
	if (value === null) return "NULL";
	if (typeof value === "number") return String(value);
	return `'${value.replaceAll("'", "''")}'`;
}
