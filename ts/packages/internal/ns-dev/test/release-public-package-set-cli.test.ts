import { describe, expect, it } from "vitest";

import { publicPublishOrder } from "../src/public-packages/package-set.ts";
import type {
	FreshReleaseGateway,
	OperationResult,
	OptionalResult,
	ReleaseCandidate,
	ReleaseFailure,
	ReleaseReportStore,
	ReleaseTransactionReport,
} from "../src/release/contracts.ts";
import { releaseBranchName } from "../src/release/fresh.ts";
import { runNsDevCli } from "../src/cli.ts";
import {
	releaseCliResultSchema,
	type ReleaseCliContext,
} from "../src/release-public-package-set-cli.ts";
import { buildReleaseCandidate, buildReleaseReport } from "./release-transaction-builders.ts";

const version = "1.2.3";
const releaseBranch = releaseBranchName(version);
const releaseCommit = "release-commit";

class InMemoryReports implements ReleaseReportStore {
	#report: ReleaseTransactionReport | undefined;
	readonly writes: ReleaseTransactionReport[] = [];

	constructor(report?: ReleaseTransactionReport) {
		this.#report = report;
	}

	async read(): Promise<OptionalResult<ReleaseTransactionReport>> {
		return this.#report === undefined
			? { type: "missing" }
			: { type: "found", value: this.#report };
	}

	async writeAtomic(_path: string, report: ReleaseTransactionReport): Promise<OperationResult> {
		this.#report = report;
		this.writes.push(report);
		return { ok: true, value: undefined };
	}
}

class InMemoryFreshRelease implements FreshReleaseGateway {
	readonly operations: string[] = [];
	private readonly inspectFailure: ReleaseFailure | undefined;

	constructor(inspectFailure?: ReleaseFailure) {
		this.inspectFailure = inspectFailure;
	}

	async inspectFreshState(branch: string) {
		this.operations.push(`inspect:${branch}`);
		if (this.inspectFailure !== undefined)
			return { ok: false as const, error: this.inspectFailure };
		return {
			ok: true as const,
			value: {
				currentBranch: "feature/source",
				headCommit: "source-commit",
				trunkBranch: "main",
				isGraphiteTracked: true,
				isWorktreeClean: true,
				releaseBranchExists: false,
				sourceManifestPaths: publicPublishOrder.map(
					(_name, index) => `ts/packages/package-${index}/package.json`,
				),
			},
		};
	}

	async bumpCoordinatedVersion(requestedVersion: string): Promise<OperationResult> {
		this.operations.push(`bump:${requestedVersion}`);
		return { ok: true, value: undefined };
	}

	async qualifyPublicPackages(requestedVersion: string) {
		this.operations.push(`qualify:${requestedVersion}`);
		return {
			ok: true as const,
			value: publicPublishOrder.map((name) => ({ name, path: `/qualified/${name}` })),
		};
	}

	async listTrackedChanges() {
		return {
			ok: true as const,
			value: [
				...publicPublishOrder.map((_name, index) => `ts/packages/package-${index}/package.json`),
				"ts/pnpm-lock.yaml",
			],
		};
	}

	async stageReleaseFiles(): Promise<OperationResult> {
		this.operations.push("stage");
		return { ok: true, value: undefined };
	}

	async createReleaseCheckpoint() {
		this.operations.push("checkpoint");
		return {
			ok: true as const,
			value: { branch: releaseBranch, commit: releaseCommit, isWorktreeClean: true },
		};
	}

	async inspectCheckpoint() {
		return {
			ok: true as const,
			value: { branch: releaseBranch, commit: releaseCommit, isWorktreeClean: true },
		};
	}
}

function makeReport(options: { branch?: string; commit?: string } = {}): ReleaseTransactionReport {
	return buildReleaseReport({
		version,
		branch: options.branch ?? releaseBranch,
		commit: options.commit ?? releaseCommit,
		inventory: publicPublishOrder,
		candidates: publicPublishOrder.map((name, order) => candidate(name, order)),
	});
}

function candidate(name: string, order: number): ReleaseCandidate {
	return buildReleaseCandidate({ name, version, order, tarballPath: `/release/${order}.tgz` });
}

function createHarness(
	options: {
		report?: ReleaseTransactionReport;
		isResumeClean?: boolean;
		candidateState?: "exact" | "missing";
		inspectFailure?: ReleaseFailure;
	} = {},
) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const release = new InMemoryFreshRelease(options.inspectFailure);
	const reports = new InMemoryReports(options.report);
	const published: string[] = [];
	const registryReads: string[] = [];
	const context: ReleaseCliContext = {
		release,
		resume: {
			async inspectResumeState() {
				return {
					ok: true,
					value: {
						currentBranch: releaseBranch,
						headCommit: releaseCommit,
						headParentCommit: "source-commit",
						isWorktreeClean: options.isResumeClean ?? true,
						coordinatedVersion: version,
					},
				};
			},
		},
		npmCandidates: {
			async pack(request) {
				const name = request.publishRoot.replace("/qualified/", "");
				const order = publicPublishOrder.indexOf(name);
				return { ok: true, value: candidate(name, order) };
			},
		},
		reports,
		candidateFiles: {
			async classify() {
				return { type: options.candidateState ?? "exact" };
			},
		},
		registry: {
			async readPackageMetadata(name) {
				registryReads.push(name);
				return { type: "missing" };
			},
		},
		confirmation: {
			async confirmPublish() {
				return { ok: true, value: true };
			},
		},
		commands: {
			async publishTarball(path) {
				published.push(path);
				return { ok: true, value: undefined };
			},
			async verify() {
				return { ok: true, value: undefined };
			},
		},
		delay: { async wait() {} },
		reportPathForVersion: (requestedVersion) => `/releases/${requestedVersion}/report.json`,
		releaseDirectoryForVersion: (requestedVersion) => `/releases/${requestedVersion}`,
		verificationDelaysMs: [],
	};
	return {
		context,
		release,
		reports,
		published,
		registryReads,
		stdout,
		stderr,
		run: async (args: readonly string[]) =>
			await runNsDevCli(["release-public-package-set", ...args], {
				cwd: "/repo",
				env: { PATH: "/fake/bin" },
				release: context,
				stdout: (text: string) => stdout.push(text),
				stderr: (text: string) => stderr.push(text),
			}),
	};
}

describe("transactional release CLI adapter", () => {
	it("prints help without touching any gateway", async () => {
		const harness = createHarness();
		expect(await harness.run(["--help"])).toBe(0);
		expect(harness.stdout.join("")).toContain("--plan");
		expect(harness.release.operations).toEqual([]);
		expect(harness.registryReads).toEqual([]);
	});

	it.each([[["-h"], "Usage:"]] as const)(
		"supports the %s command metadata surface",
		async (args, expected) => {
			const harness = createHarness();
			expect(await harness.run(args)).toBe(0);
			expect(harness.stdout.join("")).toContain(expected);
			expect(harness.release.operations).toEqual([]);
		},
	);

	it("accepts canonical report evidence through the CLI result schema while remaining strict", () => {
		const report = makeReport();
		const evidence = {
			version,
			mode: "resume",
			reportPath: "/releases/1.2.3/report.json",
			releaseCommit: report.release.commit,
			candidates: report.candidates,
			classifications: [],
			writes: report.completedWrites,
			finalStatus: "verified",
		};
		expect(releaseCliResultSchema.safeParse(evidence).success).toBe(true);
		expect(releaseCliResultSchema.safeParse({ ...evidence, extra: true }).success).toBe(false);
		expect(
			releaseCliResultSchema.safeParse({
				...evidence,
				candidates: [{ ...report.candidates[0], extra: true }],
			}).success,
		).toBe(false);
	});

	it("publishes the machine envelope schema", async () => {
		const harness = createHarness();
		expect(await harness.run([version, "--json-schema"])).toBe(0);
		const document = JSON.parse(harness.stdout.join(""));
		expect(document.machineEnvelopeJsonSchema).toMatchObject({
			oneOf: expect.any(Array),
		});
		expect(harness.release.operations).toEqual([]);
	});

	it("prints a read-only plan after preflight without writes or registry access", async () => {
		const harness = createHarness();
		expect(await harness.run(["--plan", version, "--format", "json"])).toBe(0);
		const output = JSON.parse(harness.stdout.join(""));
		expect(output).toMatchObject({
			status: "ok",
			data: { finalStatus: "planned", version, releaseBranch },
		});
		expect(output.data.packages).toEqual(publicPublishOrder);
		expect(harness.release.operations).toEqual([`inspect:${releaseBranch}`]);
		expect(harness.reports.writes).toEqual([]);
		expect(harness.registryReads).toEqual([]);
		expect(harness.published).toEqual([]);
	});

	it("preserves structured release failure details in the machine envelope", async () => {
		const inspectFailure = {
			code: "release-command-failed",
			message: "Could not inspect the release source.",
			displayCommand: "gt trunk --no-interactive",
			details: { resultType: "spawn-failed", spawnError: "spawn gt ENOENT" },
		} satisfies ReleaseFailure;
		const harness = createHarness({ inspectFailure });

		expect(await harness.run(["--plan", version, "--format", "json"])).toBe(2);
		expect(JSON.parse(harness.stdout.join(""))).toMatchObject({
			status: "failure",
			errorType: inspectFailure.code,
			message: inspectFailure.message,
			data: {
				error: inspectFailure,
				finalStatus: "refused",
				writes: [],
			},
		});
		expect(harness.reports.writes).toEqual([]);
		expect(harness.registryReads).toEqual([]);
		expect(harness.published).toEqual([]);
	});

	it("routes a fresh flow through bump, qualification, checkpoint, and publication evidence", async () => {
		const harness = createHarness();
		expect(await harness.run([version, "--format", "json"])).toBe(0);
		expect(harness.release.operations).toEqual([
			`inspect:${releaseBranch}`,
			`bump:${version}`,
			`qualify:${version}`,
			"stage",
			"checkpoint",
		]);
		expect(harness.published).toHaveLength(publicPublishOrder.length);
		const evidence = JSON.parse(harness.stdout.join(""));
		expect(evidence).toMatchObject({
			status: "ok",
			data: {
				version,
				mode: "fresh",
				releaseCommit,
				finalStatus: "verified",
			},
		});
		expect(evidence.data.candidates).toHaveLength(publicPublishOrder.length);
		expect(evidence.data.classifications).toHaveLength(publicPublishOrder.length);
		expect(evidence.data.writes).toEqual(publicPublishOrder);
	});

	it("automatically adopts a proven checkpointing report and continues", async () => {
		const report = {
			...makeReport(),
			release: { branch: releaseBranch, commit: "source-commit", version },
			stage: "checkpointing" as const,
		};
		const harness = createHarness({ report });
		expect(await harness.run([version, "--format", "json"])).toBe(0);
		expect(harness.release.operations).toEqual([]);
		expect(harness.reports.writes[0]).toMatchObject({
			release: { branch: releaseBranch, commit: releaseCommit, version },
			stage: "candidates-prepared",
		});
		expect(harness.published).toHaveLength(publicPublishOrder.length);
	});

	it("routes an exact report directly to publication without fresh-flow effects", async () => {
		const harness = createHarness({ report: makeReport() });
		expect(await harness.run([version, "--format", "json"])).toBe(0);
		expect(harness.release.operations).toEqual([]);
		expect(harness.published).toHaveLength(publicPublishOrder.length);
		expect(JSON.parse(harness.stdout.join(""))).toMatchObject({
			status: "ok",
			data: { mode: "resume", finalStatus: "verified" },
		});
	});

	it.each([
		["dirty identity", makeReport(), false, "exact", "release-worktree-dirty"],
		["wrong report identity", makeReport({ commit: "other" }), true, "exact", "wrong-commit"],
		["missing frozen candidate", makeReport(), true, "missing", "candidate-missing"],
	] as const)(
		"refuses %s before registry or npm writes",
		async (_label, report, isClean, candidateState, code) => {
			const harness = createHarness({ report, isResumeClean: isClean, candidateState });
			expect(await harness.run([version, "--format", "json"])).toBe(2);
			expect(JSON.parse(harness.stdout.join(""))).toMatchObject({
				status: "failure",
				errorType: code,
				data: { error: { code } },
			});
			expect(harness.registryReads).toEqual([]);
			expect(harness.published).toEqual([]);
		},
	);
});
