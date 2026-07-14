import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { publicPublishOrder } from "../../../../scripts/public-package-set.mjs";
import type {
	CandidateFileGateway,
	CandidateFileState,
	NpmCandidateGateway,
	OptionalResult,
	QualifiedPublishRoot,
	ReleaseCandidate,
	ReleaseReportStore,
	ReleaseTransactionReport,
} from "../src/release/contracts.ts";
import { orderedReleaseInventory, prepareFrozenCandidates } from "../src/release/fresh.ts";
import { classifyRegistryPackage } from "../src/release/publication.ts";
import { recoverCheckpointingReport, validateReleaseResume } from "../src/release/resume.ts";
import { buildReleaseCandidate, buildReleaseReport } from "./release-transaction-builders.ts";

const version = "1.2.3";
const branch = "release/1.2.3";
const commit = "0123456789abcdef";

class InMemoryNpmCandidates implements NpmCandidateGateway {
	readonly #packCalls: Array<{ publishRoot: string; packDestination: string }> = [];

	get packCalls(): ReadonlyArray<{ publishRoot: string; packDestination: string }> {
		return this.#packCalls.map((call) => ({ ...call }));
	}

	async pack(options: { readonly publishRoot: string; readonly packDestination: string }) {
		this.#packCalls.push({ ...options });
		const name = options.publishRoot.replace("/qualified/", "");
		return {
			ok: true as const,
			value: {
				name,
				version,
				tarballPath: resolve(
					options.packDestination,
					`${name.replaceAll("/", "-")}-${version}.tgz`,
				),
				integrity: `sha512-${name}`,
				shasum: `sha1-${name}`,
			},
		};
	}
}

class InMemoryReports implements ReleaseReportStore {
	readonly #writes: ReleaseTransactionReport[] = [];
	readonly #report: OptionalResult<ReleaseTransactionReport>;

	constructor(report: OptionalResult<ReleaseTransactionReport> = { type: "missing" }) {
		this.#report = report;
	}

	get writes(): readonly ReleaseTransactionReport[] {
		return this.#writes.map(copyReport);
	}

	async read(): Promise<OptionalResult<ReleaseTransactionReport>> {
		return this.#report;
	}

	async writeAtomic(_reportPath: string, report: ReleaseTransactionReport) {
		this.#writes.push(copyReport(report));
		return { ok: true as const };
	}
}

class InMemoryCandidateFiles implements CandidateFileGateway {
	readonly #states: ReadonlyMap<string, CandidateFileState>;

	constructor(states: ReadonlyMap<string, CandidateFileState> = new Map()) {
		this.#states = new Map(states);
	}

	async classify(candidate: ReleaseCandidate): Promise<CandidateFileState> {
		return this.#states.get(candidate.name) ?? { type: "exact" };
	}
}

describe("release candidate preparation", () => {
	it("uses the canonical deterministic package inventory and order", () => {
		expect(orderedReleaseInventory()).toEqual(publicPublishOrder);
		expect(new Set(orderedReleaseInventory()).size).toBe(orderedReleaseInventory().length);
	});

	it("packs each qualified root exactly once and freezes tarball metadata after every transition", async () => {
		const npmCandidates = new InMemoryNpmCandidates();
		const reports = new InMemoryReports();
		const publishRoots = rootsInReverseOrder();

		const result = await prepareFrozenCandidates(
			{ npmCandidates, reports },
			{
				identity: { branch, commit, version },
				publishRoots,
				reportPath: "/release/report.json",
				releaseDirectory: "/workspace/ts/dist/releases/1.2.3",
			},
		);

		expect(result.type).toBe("prepared");
		expect(npmCandidates.packCalls).toHaveLength(publicPublishOrder.length);
		expect(
			npmCandidates.packCalls.map((call) => call.publishRoot.replace("/qualified/", "")),
		).toEqual(publicPublishOrder);
		expect(new Set(npmCandidates.packCalls.map((call) => call.publishRoot)).size).toBe(
			publicPublishOrder.length,
		);
		expect(reports.writes).toHaveLength(publicPublishOrder.length + 2);
		expect(reports.writes.map((report) => report.candidates.length)).toEqual([
			0,
			...publicPublishOrder.map((_name, index) => index + 1),
			publicPublishOrder.length,
		]);
		const finalReport = reports.writes.at(-1);
		expect(finalReport?.stage).toBe("candidates-prepared");
		expect(finalReport?.completedWrites).toEqual([]);
		expect(finalReport?.candidates.map((candidate) => candidate.order)).toEqual(
			publicPublishOrder.map((_name, index) => index),
		);
		expect(
			finalReport?.candidates.every((candidate) => candidate.tarballPath.endsWith(".tgz")),
		).toBe(true);
		expect(
			finalReport?.candidates.every(
				(candidate) => !publishRoots.some((root) => root.path === candidate.tarballPath),
			),
		).toBe(true);
	});
});

describe("registry package classification", () => {
	const candidate = makeCandidate(publicPublishOrder[0]!, 0);

	it("requires both integrity and shasum for an exact publication", () => {
		expect(
			classifyRegistryPackage(candidate, {
				type: "found",
				value: { integrity: candidate.integrity, shasum: candidate.shasum },
			}),
		).toEqual({ type: "published-exact" });
		expect(
			classifyRegistryPackage(candidate, {
				type: "found",
				value: { integrity: candidate.integrity, shasum: "different" },
			}).type,
		).toBe("published-mismatch");
		expect(
			classifyRegistryPackage(candidate, {
				type: "found",
				value: { integrity: "different", shasum: candidate.shasum },
			}).type,
		).toBe("published-mismatch");
	});

	it("preserves missing and registry errors", () => {
		expect(classifyRegistryPackage(candidate, { type: "missing" })).toEqual({ type: "missing" });
		expect(
			classifyRegistryPackage(candidate, {
				type: "error",
				error: { code: "E503", message: "unavailable" },
			}),
		).toEqual({ type: "registry-error", error: { code: "E503", message: "unavailable" } });
	});
});

describe("automatic release resume validation", () => {
	it("adopts a uniquely proven checkpoint left by a final report-write failure", async () => {
		const checkpointingReport: ReleaseTransactionReport = {
			...makeReport(),
			release: { branch, commit: "parent-commit", version },
			stage: "checkpointing",
		};
		const reports = new InMemoryReports({ type: "found", value: checkpointingReport });
		const result = await recoverCheckpointingReport(
			{ reports, candidateFiles: new InMemoryCandidateFiles() },
			{
				reportPath: "/release/report.json",
				currentBranch: branch,
				headCommit: commit,
				headParentCommit: "parent-commit",
				coordinatedVersion: version,
			},
		);
		expect(result).toMatchObject({
			type: "valid",
			report: { release: { branch, commit, version }, stage: "candidates-prepared" },
		});
		expect(reports.writes).toHaveLength(1);
	});

	it("uses a stable refusal when the report is not checkpointing", async () => {
		const report = makeReport();
		const result = await recoverCheckpointingReport(
			{
				reports: new InMemoryReports({ type: "found", value: report }),
				candidateFiles: new InMemoryCandidateFiles(),
			},
			{
				reportPath: "/release/report.json",
				currentBranch: branch,
				headCommit: commit,
				headParentCommit: "parent-commit",
				coordinatedVersion: version,
			},
		);
		expect(result).toMatchObject({ type: "refused", code: "report-not-checkpointing" });
	});

	it("uses a stable refusal when the recovered report cannot be written", async () => {
		const checkpointingReport: ReleaseTransactionReport = {
			...makeReport(),
			release: { branch, commit: "parent-commit", version },
			stage: "checkpointing",
		};
		const result = await recoverCheckpointingReport(
			{
				reports: {
					async read() {
						return { type: "found" as const, value: checkpointingReport };
					},
					async writeAtomic() {
						return {
							ok: false as const,
							error: { code: "report-write-failed", message: "injected" },
						};
					},
				},
				candidateFiles: new InMemoryCandidateFiles(),
			},
			{
				reportPath: "/release/report.json",
				currentBranch: branch,
				headCommit: commit,
				headParentCommit: "parent-commit",
				coordinatedVersion: version,
			},
		);
		expect(result).toMatchObject({ type: "refused", code: "recovered-report-write-failed" });
	});

	it.each([
		["branch", { currentBranch: "other", headParentCommit: "parent-commit" }, "wrong-branch"],
		["parent", { currentBranch: branch, headParentCommit: "other" }, "wrong-parent-commit"],
	] as const)("refuses checkpoint recovery on a %s mismatch", async (_label, identity, code) => {
		const checkpointingReport: ReleaseTransactionReport = {
			...makeReport(),
			release: { branch, commit: "parent-commit", version },
			stage: "checkpointing",
		};
		const reports = new InMemoryReports({ type: "found", value: checkpointingReport });
		const result = await recoverCheckpointingReport(
			{ reports, candidateFiles: new InMemoryCandidateFiles() },
			{
				reportPath: "/release/report.json",
				...identity,
				headCommit: commit,
				coordinatedVersion: version,
			},
		);
		expect(result).toMatchObject({ type: "refused", code });
		expect(reports.writes).toEqual([]);
	});

	it("accepts an exact report and frozen candidate set", async () => {
		const report = makeReport();
		const result = await validate(report);
		expect(result).toEqual({ type: "valid", report });
	});

	it.each([
		["wrong branch", { release: { branch: "other", commit, version } }, "wrong-branch"],
		["wrong HEAD", { release: { branch, commit: "different", version } }, "wrong-commit"],
		[
			"wrong coordinated version",
			{ release: { branch, commit, version: "9.9.9" } },
			"wrong-version",
		],
		["wrong inventory", { inventory: [...publicPublishOrder].reverse() }, "wrong-inventory"],
	] as const)("refuses %s", async (_label, patch, expectedCode) => {
		const result = await validate({ ...makeReport(), ...patch });
		expect(result.type).toBe("refused");
		if (result.type === "refused") expect(result.code).toBe(expectedCode);
	});

	it.each([
		["missing", { type: "missing" } as const, "candidate-missing"],
		[
			"hash-mismatched",
			{ type: "hash-mismatch", actualIntegrity: "sha512-other", actualShasum: "other" } as const,
			"candidate-hash-mismatch",
		],
	] as const)(
		"refuses a %s frozen candidate without packing again",
		async (_label, state, expectedCode) => {
			const report = makeReport();
			const npmCandidates = new InMemoryNpmCandidates();
			const result = await validateReleaseResume(
				{
					reports: new InMemoryReports({ type: "found", value: report }),
					candidateFiles: new InMemoryCandidateFiles(new Map([[publicPublishOrder[0]!, state]])),
				},
				{
					reportPath: "/release/report.json",
					currentBranch: branch,
					headCommit: commit,
					coordinatedVersion: version,
				},
			);
			expect(result.type).toBe("refused");
			if (result.type === "refused") expect(result.code).toBe(expectedCode);
			expect(npmCandidates.packCalls).toEqual([]);
		},
	);
});

async function validate(report: ReleaseTransactionReport) {
	return await validateReleaseResume(
		{
			reports: new InMemoryReports({ type: "found", value: report }),
			candidateFiles: new InMemoryCandidateFiles(),
		},
		{
			reportPath: "/release/report.json",
			currentBranch: branch,
			headCommit: commit,
			coordinatedVersion: version,
		},
	);
}

function makeReport(): ReleaseTransactionReport {
	return buildReleaseReport({
		version,
		branch,
		commit,
		inventory: publicPublishOrder,
		candidates: publicPublishOrder.map(makeCandidate),
	});
}

function makeCandidate(name: string, order: number): ReleaseCandidate {
	return buildReleaseCandidate({
		name,
		version,
		order,
		tarballPath: `/workspace/ts/dist/releases/${version}/${name.replaceAll("/", "-")}.tgz`,
	});
}

function rootsInReverseOrder(): QualifiedPublishRoot[] {
	return [...publicPublishOrder].reverse().map((name) => ({ name, path: `/qualified/${name}` }));
}

function copyReport(report: ReleaseTransactionReport): ReleaseTransactionReport {
	return {
		...report,
		release: { ...report.release },
		inventory: [...report.inventory],
		candidates: report.candidates.map((candidate) => ({ ...candidate })),
		completedWrites: [...report.completedWrites],
		pendingWrite: report.pendingWrite,
	};
}
