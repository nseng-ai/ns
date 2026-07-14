import { describe, expect, it } from "vitest";

import {
	assertPlausibleNpmVersion,
	isConcreteNpmVersion,
} from "../src/public-packages/package-set.ts";
import {
	releaseCandidateSchema,
	releaseFailureSchema,
	releaseTransactionReportSchema,
} from "../src/release/contracts.ts";
import { buildReleaseCandidate, buildReleaseReport } from "./release-transaction-builders.ts";

const version = "1.2.3-beta.1+build.7";
const candidate = buildReleaseCandidate({
	name: "@nseng-ai/example",
	version,
	order: 0,
	tarballPath: "/release/example.tgz",
});
const report = buildReleaseReport({
	version,
	branch: "release/1.2.3",
	commit: "release-commit",
	inventory: [candidate.name],
	candidates: [candidate],
});

describe("canonical release contracts", () => {
	it("round-trips a schema-v1 report through its durable JSON boundary", () => {
		expect(releaseTransactionReportSchema.parse(JSON.parse(JSON.stringify(report)))).toEqual(
			report,
		);
	});

	it.each([
		["empty branch", { release: { ...report.release, branch: "" } }],
		["noncanonical version", { release: { ...report.release, version: "1.0.0-01" } }],
		["empty inventory entry", { inventory: [""] }],
		["empty completed entry", { completedWrites: [""] }],
		["empty pending write", { pendingWrite: "" }],
		["unknown stage", { stage: "done" }],
		["unknown report field", { extra: true }],
	] as const)("rejects %s", (_label, patch) => {
		expect(releaseTransactionReportSchema.safeParse({ ...report, ...patch }).success).toBe(false);
	});

	it("retains full structured ErrorInfo data", () => {
		const error = {
			code: "release-command-failed",
			message: "command failed",
			details: { resultType: "spawn-failed", spawnError: "ENOENT" },
			displayCommand: "gt trunk --no-interactive",
		};
		expect(releaseFailureSchema.parse(JSON.parse(JSON.stringify(error)))).toEqual(error);
	});

	it.each([
		["empty package", { name: "" }],
		["negative order", { order: -1 }],
		["fractional order", { order: 0.5 }],
		["non-tarball path", { tarballPath: "/release/example.tar" }],
		["empty integrity", { integrity: "" }],
		["unknown candidate field", { extra: true }],
	] as const)("rejects candidate with %s", (_label, patch) => {
		expect(releaseCandidateSchema.safeParse({ ...candidate, ...patch }).success).toBe(false);
	});
});

describe("concrete npm version validation", () => {
	it.each(["1.0.0", "1.0.0-alpha.1", "1.0.0-0", "1.0.0+build.7", version])(
		"accepts %s",
		(value) => {
			expect(isConcreteNpmVersion(value)).toBe(true);
			expect(() => assertPlausibleNpmVersion(value)).not.toThrow();
		},
	);

	it.each(["1.0", "01.0.0", "1.0.0-01", "1.0.0-alpha..1", " 1.0.0", "latest"])(
		"rejects %s",
		(value) => {
			expect(isConcreteNpmVersion(value)).toBe(false);
			expect(() => assertPlausibleNpmVersion(value)).toThrow("concrete npm semver");
		},
	);
});
