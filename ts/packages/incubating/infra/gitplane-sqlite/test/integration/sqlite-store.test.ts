import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import { evaluateDoctor, parseArtifactId } from "@nseng-ai/gitplane";
import { createSqliteStore, initializeSqliteStore } from "@nseng-ai/gitplane-sqlite";
import { exerciseMaterializationStoreConformance } from "@nseng-ai/gitplane/testing";

const parsed = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
if (!parsed.ok) throw new Error("invalid fixture ID");
const artifactId = parsed.artifactId;

async function withDatabase(
	operation: (directory: string, file: string) => Promise<void>,
): Promise<void> {
	const directory = await mkdtemp(path.join(os.tmpdir(), "gitplane-sqlite-"));
	try {
		await operation(directory, "store.db");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

test("initializes idempotently and opens read-only without DDL", () =>
	withDatabase(async (directory, file) => {
		expect(await initializeSqliteStore({ path: file, baseDirectory: directory })).toEqual({
			ok: true,
		});
		expect(await initializeSqliteStore({ path: file, baseDirectory: directory })).toEqual({
			ok: true,
		});
		const databasePath = path.join(directory, file);
		const before = await readFile(databasePath);
		const store = createSqliteStore({
			path: file,
			baseDirectory: directory,
			access: "read-only",
			clock: { now: () => new Date() },
		});
		const facts = await store.inspectDoctor({ sourceId: "source", targets: [] });
		expect(facts).toMatchObject({
			ok: true,
			value: { controlSchema: { state: "compatible", version: 1 } },
		});
		expect(await store.close()).toEqual({ ok: true });
		expect(await readFile(databasePath)).toEqual(before);
	}));

test("returns gateway errors for corrupt persisted classification JSON", () =>
	withDatabase(async (directory, file) => {
		expect(await initializeSqliteStore({ path: file, baseDirectory: directory })).toEqual({
			ok: true,
		});
		const database = new DatabaseSync(path.join(directory, file));
		database
			.prepare("INSERT INTO gitplane_current_artifacts VALUES (?, ?, ?, ?, ?, ?, ?)")
			.run("source", artifactId, "r", "p", '{"state":"impossible"}', "c", 0);
		database
			.prepare("INSERT INTO gitplane_lineage VALUES (?, ?, ?, ?)")
			.run("source", artifactId, '{"state":"generic"}', null);
		database.close();
		const store = createSqliteStore({
			path: file,
			baseDirectory: directory,
			access: "read-only",
			clock: { now: () => new Date() },
		});
		expect(await store.readCurrentArtifact({ sourceId: "source", artifactId })).toMatchObject({
			type: "error",
			error: { code: "sqlite-operation-failed" },
		});
		expect(await store.readLineage({ sourceId: "source", artifactId })).toMatchObject({
			type: "error",
			error: { code: "sqlite-operation-failed" },
		});
		expect(await store.listCurrentArtifacts({ sourceId: "source" })).toMatchObject({
			ok: false,
			error: { code: "sqlite-operation-failed" },
		});
		expect(await store.close()).toEqual({ ok: true });
	}));

test("satisfies shared gateway conformance", () =>
	withDatabase(async (directory, file) => {
		expect(await initializeSqliteStore({ path: file, baseDirectory: directory })).toEqual({
			ok: true,
		});
		const database = new DatabaseSync(path.join(directory, file));
		database.exec(
			"CREATE TABLE conformance_target (source_id TEXT NOT NULL, artifact_id TEXT NOT NULL, revision_id TEXT NOT NULL, artifact_path TEXT NOT NULL, deleted INTEGER NOT NULL, deleted_at_commit TEXT, title TEXT, payload TEXT, retired TEXT, UNIQUE(source_id, artifact_id))",
		);
		database.close();
		await exerciseMaterializationStoreConformance(
			() =>
				createSqliteStore({
					path: file,
					baseDirectory: directory,
					access: "read-write",
					clock: { now: () => new Date() },
				}),
			() => {
				const inspect = new DatabaseSync(path.join(directory, file), { readOnly: true });
				const row = inspect.prepare("SELECT * FROM conformance_target").get() as Record<
					string,
					unknown
				>;
				inspect.close();
				return {
					...row,
					deleted: row.deleted === 1,
					payload: JSON.parse(String(row.payload)),
				};
			},
		);
	}));

test("implements target JSON upsert, restore, tombstone, and quoted identifiers", () =>
	withDatabase(async (directory, file) => {
		expect(await initializeSqliteStore({ path: file, baseDirectory: directory })).toEqual({
			ok: true,
		});
		const database = new DatabaseSync(path.join(directory, file));
		database.exec(
			'CREATE TABLE "order" ("source" TEXT, "artifact" TEXT, "revision" TEXT, "path" TEXT, "deleted" INTEGER, "deleted at" TEXT, "payload" TEXT, "old" TEXT, UNIQUE("source", "artifact"))',
		);
		database.close();
		const target = {
			table: "order",
			lineage: {
				sourceId: "source",
				artifactId: "artifact",
				revisionId: "revision",
				path: "path",
				deleted: "deleted",
				deletedAtCommit: "deleted at",
			},
		};
		const store = createSqliteStore({
			path: file,
			baseDirectory: directory,
			access: "read-write",
			clock: { now: () => new Date() },
		});
		expect(
			await store.upsertTargetRow({
				sourceId: "source",
				artifactId,
				revisionId: "r1",
				path: "a",
				target,
				fields: [{ column: "payload", mode: "json", value: { b: 2, a: 1 } }],
				clearFields: ["old"],
			}),
		).toEqual({ ok: true });
		expect(
			await store.tombstoneTargetRow({
				sourceId: "missing",
				artifactId,
				target,
				deletedAtCommit: "no-row",
			}),
		).toEqual({ ok: true });
		expect(
			await store.tombstoneTargetRow({
				sourceId: "source",
				artifactId,
				target,
				deletedAtCommit: "dead",
			}),
		).toEqual({ ok: true });
		expect(
			await store.upsertTargetRow({
				sourceId: "source",
				artifactId,
				revisionId: "r2",
				path: "restored",
				target,
				fields: [{ column: "payload", mode: "json", value: [null, false, 3] }],
				clearFields: ["old"],
			}),
		).toEqual({ ok: true });
		expect(await store.close()).toEqual({ ok: true });
		const verify = new DatabaseSync(path.join(directory, file), { readOnly: true });
		expect(
			verify
				.prepare(
					'SELECT "revision", "path", "deleted", "deleted at", "payload", "old" FROM "order"',
				)
				.get(),
		).toEqual({
			revision: "r2",
			path: "restored",
			deleted: 0,
			"deleted at": null,
			payload: "[null,false,3]",
			old: null,
		});
		verify.close();
	}));

test("reports exact and wider or partial unique indexes without conflating them", () =>
	withDatabase(async (directory, file) => {
		expect(await initializeSqliteStore({ path: file, baseDirectory: directory })).toEqual({
			ok: true,
		});
		const database = new DatabaseSync(path.join(directory, file));
		database.exec(
			"CREATE TABLE target_exact (source TEXT, artifact TEXT, revision TEXT, UNIQUE(source, artifact)); CREATE TABLE target_wider (source TEXT, artifact TEXT, revision TEXT, UNIQUE(source, artifact, revision)); CREATE TABLE target_partial (source TEXT, artifact TEXT, revision TEXT); CREATE UNIQUE INDEX target_partial_unique ON target_partial(source, artifact) WHERE revision IS NOT NULL",
		);
		database.close();
		const store = createSqliteStore({
			path: file,
			baseDirectory: directory,
			access: "read-only",
			clock: { now: () => new Date() },
		});
		const lineage = {
			sourceId: "source",
			artifactId: "artifact",
			revisionId: "revision",
			path: "path",
			deleted: "deleted",
			deletedAtCommit: "deleted_at",
		};
		const facts = await store.inspectDoctor({
			sourceId: "source",
			targets: [
				{ table: "target_exact", lineage },
				{ table: "target_wider", lineage },
				{ table: "target_partial", lineage },
			],
		});
		expect(facts).toMatchObject({
			ok: true,
			value: {
				targetTables: [
					{ name: "target_exact", uniqueColumnSets: [["source", "artifact"]] },
					{ name: "target_wider", uniqueColumnSets: [["source", "artifact", "revision"]] },
					{ name: "target_partial", uniqueColumnSets: [] },
				],
			},
		});
		if (!facts.ok) throw new Error("Doctor inspection unexpectedly failed.");
		const partialChecks = evaluateDoctor({
			sourceId: "source",
			kinds: [
				{
					apiVersion: "example/v1",
					kind: "Partial",
					schemaVersions: { 1: { fields: {} } },
					transitions: [],
					target: { table: "target_partial", lineage },
				},
			],
			introspection: facts.value,
		});
		expect(
			partialChecks.find((check) => check.code === "target-source-artifact-uniqueness")?.status,
		).toBe("fail");
		expect(await store.close()).toEqual({ ok: true });
	}));

test("binds scalar null and booleans and rejects unsupported ordinary values", () =>
	withDatabase(async (directory, file) => {
		expect(await initializeSqliteStore({ path: file, baseDirectory: directory })).toEqual({
			ok: true,
		});
		const database = new DatabaseSync(path.join(directory, file));
		database.exec(
			"CREATE TABLE scalars (source TEXT, artifact TEXT, revision TEXT, path TEXT, deleted INTEGER, deleted_at TEXT, flag INTEGER, optional TEXT, unsupported TEXT, UNIQUE(source, artifact))",
		);
		database.close();
		const target = {
			table: "scalars",
			lineage: {
				sourceId: "source",
				artifactId: "artifact",
				revisionId: "revision",
				path: "path",
				deleted: "deleted",
				deletedAtCommit: "deleted_at",
			},
		};
		const store = createSqliteStore({
			path: file,
			baseDirectory: directory,
			access: "read-write",
			clock: { now: () => new Date() },
		});
		expect(
			await store.upsertTargetRow({
				sourceId: "source",
				artifactId,
				revisionId: "r1",
				path: "a",
				target,
				fields: [
					{ column: "flag", mode: "scalar", value: false },
					{ column: "optional", mode: "scalar", value: null },
				],
				clearFields: [],
			}),
		).toEqual({ ok: true });
		expect(
			await store.upsertTargetRow({
				sourceId: "source",
				artifactId,
				revisionId: "r2",
				path: "a",
				target,
				fields: [{ column: "unsupported", mode: "scalar", value: { object: true } }],
				clearFields: [],
			}),
		).toMatchObject({ ok: false, error: { code: "sqlite-operation-failed" } });
		expect(await store.close()).toEqual({ ok: true });
		const verify = new DatabaseSync(path.join(directory, file), { readOnly: true });
		expect(verify.prepare("SELECT revision, flag, optional FROM scalars").get()).toEqual({
			revision: "r1",
			flag: 0,
			optional: null,
		});
		verify.close();
	}));

test("refuses incompatible preexisting control objects", () =>
	withDatabase(async (directory, file) => {
		const database = new DatabaseSync(path.join(directory, file));
		database.exec(
			"CREATE TABLE gitplane_schema (schema_version INTEGER); INSERT INTO gitplane_schema VALUES (99)",
		);
		database.close();
		expect(await initializeSqliteStore({ path: file, baseDirectory: directory })).toMatchObject({
			ok: false,
			error: { code: "incompatible-control-schema" },
		});
	}));

test("refuses unexpected Gitplane-owned objects without mutation", () =>
	withDatabase(async (directory, file) => {
		const database = new DatabaseSync(path.join(directory, file));
		database.exec("CREATE TABLE gitplane_unexpected (value TEXT)");
		database.close();
		const before = await readFile(path.join(directory, file));
		expect(await initializeSqliteStore({ path: file, baseDirectory: directory })).toMatchObject({
			ok: false,
			error: { code: "incompatible-control-schema" },
		});
		expect(await readFile(path.join(directory, file))).toEqual(before);
	}));

test("read-only open of a missing database creates no file or parent", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "gitplane-sqlite-missing-"));
	const parent = path.join(directory, "missing-parent");
	try {
		expect(() =>
			createSqliteStore({
				path: "missing-parent/store.db",
				baseDirectory: directory,
				access: "read-only",
				clock: { now: () => new Date() },
			}),
		).toThrow();
		await expect(stat(parent)).rejects.toThrow();
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("refuses a malformed v1 table before creating another missing table", () =>
	withDatabase(async (directory, file) => {
		const database = new DatabaseSync(path.join(directory, file));
		database.exec(
			"CREATE TABLE gitplane_schema (schema_version INTEGER NOT NULL) STRICT; INSERT INTO gitplane_schema VALUES (1); CREATE TABLE gitplane_cursors (source_id TEXT PRIMARY KEY, wrong_column TEXT NOT NULL) STRICT",
		);
		database.close();

		expect(await initializeSqliteStore({ path: file, baseDirectory: directory })).toMatchObject({
			ok: false,
			error: { code: "incompatible-control-schema" },
		});
		const verify = new DatabaseSync(path.join(directory, file), { readOnly: true });
		expect(
			verify
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
				.all()
				.map((row) => (row as { name: string }).name),
		).toEqual(["gitplane_cursors", "gitplane_schema"]);
		verify.close();
	}));
