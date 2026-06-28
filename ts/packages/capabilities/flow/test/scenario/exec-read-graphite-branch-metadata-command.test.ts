import { describe, expect, test } from "vitest";

import { GRAPHITE_METADATA_SQLITE_QUERY_TIMEOUT_MS } from "@sdl/graphite/metadata";
import { runFlowExecReadGraphiteBranchMetadataCommandWithFakes } from "./flow-command-fakes.ts";
import type { ScriptedExecResponse } from "./sdl-cli-fakes.ts";

const DB_PATH = "/work/.git/.graphite_metadata.db";
const BRANCH_METADATA_QUERY =
	"SELECT branch_name, parent_branch_name, children, validation_result FROM branch_metadata";

function sqliteSuccess(stdout: string): ScriptedExecResponse {
	return {
		match: `sqlite3 -readonly -json ${DB_PATH} ${BRANCH_METADATA_QUERY}`,
		result: { stdout },
	};
}

describe("flow exec read-graphite-branch-metadata command", () => {
	test("reads Graphite branch metadata through the controlled sqlite query", async () => {
		const rows = JSON.stringify([
			{
				branch_name: "main",
				parent_branch_name: null,
				children: JSON.stringify(["feature"]),
				validation_result: "TRUNK",
			},
		]);
		const run = runFlowExecReadGraphiteBranchMetadataCommandWithFakes({
			request: { dbPath: DB_PATH },
			state: { exec: [sqliteSuccess(`${rows}\n`)] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(`${rows}\n`);
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([
			{
				command: "sqlite3",
				args: ["-readonly", "-json", DB_PATH, BRANCH_METADATA_QUERY],
				options: { timeoutMs: GRAPHITE_METADATA_SQLITE_QUERY_TIMEOUT_MS },
			},
		]);
	});

	test("maps empty sqlite stdout to an empty JSON row array", async () => {
		const run = runFlowExecReadGraphiteBranchMetadataCommandWithFakes({
			request: { dbPath: DB_PATH },
			state: { exec: [sqliteSuccess("")] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("[]\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("reports sqlite failures with command details and stderr", async () => {
		const run = runFlowExecReadGraphiteBranchMetadataCommandWithFakes({
			request: { dbPath: DB_PATH },
			state: {
				exec: [
					{
						match: `sqlite3 -readonly -json ${DB_PATH} ${BRANCH_METADATA_QUERY}`,
						result: { code: 1, stderr: "database is locked\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(2);
		const stderr = run.stderr.join("");
		expect(stderr).toContain(`sqlite3 could not read Graphite branch metadata from ${DB_PATH}.`);
		expect(stderr).toContain(`$ sqlite3 -readonly -json ${DB_PATH} '${BRANCH_METADATA_QUERY}'`);
		expect(stderr).toContain("exit 1");
		expect(stderr).toContain("database is locked");
		expect(run.stdout.join("")).toBe("");
	});

	test("reports killed sqlite execution as a timeout-style failure", async () => {
		const run = runFlowExecReadGraphiteBranchMetadataCommandWithFakes({
			request: { dbPath: DB_PATH },
			state: {
				exec: [
					{
						match: `sqlite3 -readonly -json ${DB_PATH} ${BRANCH_METADATA_QUERY}`,
						result: { code: 0, killed: true },
					},
				],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("exit 0 (killed or timed out)");
		expect(run.stdout.join("")).toBe("");
	});
});
