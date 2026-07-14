import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createNodeReleaseReportStore } from "../../src/release/system.ts";
import { buildReleaseCandidate, buildReleaseReport } from "../release-transaction-builders.ts";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map(async (path) => await rm(path, { recursive: true })));
});

describe("node release report store", () => {
	it("round-trips a canonical report and returns actionable intrinsic validation errors", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ns-release-report-"));
		directories.push(directory);
		const reportPath = join(directory, "report.json");
		const candidate = buildReleaseCandidate({
			name: "@nseng-ai/example",
			version: "1.2.3",
			order: 0,
			tarballPath: join(directory, "example.tgz"),
		});
		const report = buildReleaseReport({
			version: "1.2.3",
			branch: "release/1.2.3",
			commit: "release-commit",
			inventory: [candidate.name],
			candidates: [candidate],
		});
		const store = createNodeReleaseReportStore();

		expect(await store.writeAtomic(reportPath, report)).toEqual({ ok: true });
		expect(await store.read(reportPath)).toEqual({ type: "found", value: report });

		await writeFile(reportPath, JSON.stringify({ ...report, pendingWrite: "" }));
		const invalid = await store.read(reportPath);
		expect(invalid).toMatchObject({ type: "error", error: { code: "report-invalid" } });
		if (invalid.type === "error") expect(invalid.error.message).toContain("pendingWrite");
	});
});
