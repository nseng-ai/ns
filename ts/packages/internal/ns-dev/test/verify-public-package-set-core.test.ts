import { describe, expect, it } from "vitest";

import {
	compareRegistryMetadata,
	parseCandidateReport,
} from "../src/release/verify-public-package-set-core.ts";

const packageName = "@nseng-ai/example";
const version = "1.2.3";
const registry = {
	name: packageName,
	version,
	dist: {
		tarball: "https://registry.example/example.tgz",
		integrity: "sha512-registry",
		shasum: "registry-sha1",
	},
	time: { [version]: "2026-07-14T00:00:00.000Z" },
};

describe("public package verifier candidate evidence", () => {
	it("preserves standalone metadata comparison while candidate mode requires both exact hashes", () => {
		const standalone = compareRegistryMetadata({
			packageName,
			expectedVersion: version,
			manifest: {},
			registry,
		});
		const candidateAware = compareRegistryMetadata({
			packageName,
			expectedVersion: version,
			manifest: {},
			registry,
			candidate: {
				name: packageName,
				version,
				integrity: "sha512-candidate",
				shasum: "candidate-sha1",
			},
		});

		expect(standalone.mismatches).toEqual([]);
		expect(candidateAware.mismatches).toEqual([
			'dist.integrity "sha512-registry" != sha512-candidate',
			'dist.shasum "registry-sha1" != candidate-sha1',
		]);
	});

	it("validates candidate report inventory, identity, integrity, and shasum", () => {
		const report = {
			schemaVersion: 1,
			release: { branch: "release/1.2.3", commit: "release-commit", version },
			inventory: [packageName],
			candidates: [
				{
					name: packageName,
					version,
					order: 0,
					tarballPath: "/release/example.tgz",
					integrity: "sha512-candidate",
					shasum: "candidate-sha1",
				},
			],
			completedWrites: [],
			pendingWrite: null,
			stage: "published",
		};
		expect(parseCandidateReport(report, [packageName])).toMatchObject({
			releaseCommit: "release-commit",
			version,
		});
		expect(() =>
			parseCandidateReport(
				{
					...report,
					candidates: [{ ...report.candidates[0], shasum: undefined }],
				},
				[packageName],
			),
		).toThrow("canonical schemaVersion 1 release report");
		expect(() => parseCandidateReport(report, ["@nseng-ai/other"])).toThrow(
			"inventory does not match",
		);
	});
});
