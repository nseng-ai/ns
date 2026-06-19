import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RealSlotGtGateway } from "../../src/gateways/gt.ts";
import { FakeSlotGitGateway } from "../../src/gateways/fakes/git.ts";

interface MetadataRow {
	branch: string | number | null;
	parent?: string | null | undefined;
	children?: string | number | null | undefined;
	validation?: string | null | undefined;
}

const canRunSqlite = spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).status === 0;
const sqliteIt = canRunSqlite ? it : it.skip;

describe("RealSlotGtGateway sqlite metadata integration", () => {
	sqliteIt("reads a happy linear stack through a real sqlite metadata DB", async () => {
		await withMetadataDb(
			{
				currentBranch: "feature/a",
				rows: [
					trunk("master", { children: '["feature/a"]' }),
					row("feature/a", { parent: "master", children: '["feature/b"]' }),
					row("feature/b", { parent: "feature/a" }),
				],
			},
			async ({ gateway }) => {
				await expect(gateway.stack("/repo")).resolves.toMatchObject({
					type: "stack",
					stack: {
						trunk: "master",
						current: "feature/a",
						ancestors: ["master"],
						descendants: ["feature/b"],
						trunkMarker: { type: "clean" },
					},
				});
			},
		);
	});

	sqliteIt("reports schema mismatch through a real sqlite metadata DB", async () => {
		await withTempDir(async (commonDir) => {
			const dbPath = join(commonDir, ".graphite_metadata.db");
			execFileSync("sqlite3", [dbPath, "CREATE TABLE branch_metadata (branch_name TEXT)"]);
			const gateway = gatewayFor(commonDir, "feature/a");

			await expect(gateway.stack("/repo")).resolves.toMatchObject({
				type: "failure",
				failure: {
					message: "Graphite metadata schema mismatch: branch_metadata missing required column",
				},
			});
		});
	});
});

async function withMetadataDb(
	options: { currentBranch: string; rows: readonly MetadataRow[] },
	run: (context: { gateway: RealSlotGtGateway; commonDir: string }) => Promise<void>,
): Promise<void> {
	await withTempDir(async (commonDir) => {
		createMetadataDb(join(commonDir, ".graphite_metadata.db"), options.rows);
		await run({ gateway: gatewayFor(commonDir, options.currentBranch), commonDir });
	});
}

function gatewayFor(commonDir: string, currentBranch: string): RealSlotGtGateway {
	return new RealSlotGtGateway({
		git: new FakeSlotGitGateway({
			gitCommonDir: commonDir,
			worktrees: [{ path: "/repo", branch: currentBranch }],
		}),
	});
}

async function withTempDir(run: (commonDir: string) => Promise<void>): Promise<void> {
	const commonDir = await mkdtemp(join(tmpdir(), "slot-real-gt-"));
	try {
		await run(commonDir);
	} finally {
		await rm(commonDir, { recursive: true, force: true });
	}
}

function row(
	branch: string | number | null,
	options: Omit<MetadataRow, "branch"> = {},
): MetadataRow {
	return { branch, ...options };
}

function trunk(
	branch: string,
	options: Omit<MetadataRow, "branch" | "validation"> = {},
): MetadataRow {
	return row(branch, { ...options, validation: "TRUNK" });
}

function createMetadataDb(dbPath: string, rows: readonly MetadataRow[]): void {
	const statements = [
		"CREATE TABLE branch_metadata (branch_name TEXT, parent_branch_name TEXT, children, validation_result TEXT);",
		...rows.map(
			(record) =>
				`INSERT INTO branch_metadata (branch_name, parent_branch_name, children, validation_result) VALUES (${sqlValue(record.branch)}, ${sqlValue(record.parent ?? null)}, ${sqlValue(record.children ?? null)}, ${sqlValue(record.validation ?? null)});`,
		),
	].join("\n");
	execFileSync("sqlite3", [dbPath, statements]);
}

function sqlValue(value: string | number | null): string {
	if (value === null) return "NULL";
	if (typeof value === "number") return String(value);
	return `'${value.replaceAll("'", "''")}'`;
}
