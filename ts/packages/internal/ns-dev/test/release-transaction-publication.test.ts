import { describe, expect, it } from "vitest";

import { publicPublishOrder } from "../../../../scripts/public-package-set.mjs";
import {
	executeReleasePublication,
	type NpmRegistryGateway,
	type OperationResult,
	type OptionalResult,
	type RegistryPackageMetadata,
	type ReleaseCandidate,
	type ReleaseCommandGateway,
	type ReleaseConfirmationGateway,
	type ReleaseDelay,
	type ReleaseReportStore,
	type ReleaseTransactionReport,
} from "../../../../scripts/release-transaction-core.ts";

const version = "1.2.3";
const reportPath = "/release/report.json";

class InMemoryRegistry implements NpmRegistryGateway {
	readonly #packages = new Map<string, OptionalResult<RegistryPackageMetadata>>();
	readonly reads: string[] = [];

	constructor(initial: ReadonlyMap<string, OptionalResult<RegistryPackageMetadata>> = new Map()) {
		for (const [name, result] of initial) this.#packages.set(name, result);
	}

	async readPackageMetadata(name: string, requestedVersion: string) {
		this.reads.push(`${name}@${requestedVersion}`);
		return this.#packages.get(name) ?? { type: "missing" as const };
	}

	publish(candidate: ReleaseCandidate): void {
		this.#packages.set(candidate.name, {
			type: "found",
			value: { integrity: candidate.integrity, shasum: candidate.shasum },
		});
	}

	markMissing(name: string): void {
		this.#packages.set(name, { type: "missing" });
	}
}

class InMemoryCommands implements ReleaseCommandGateway {
	readonly publishedPaths: string[] = [];
	readonly verifyCalls: Array<{ version: string; candidateReportPath: string }> = [];
	readonly #registry: InMemoryRegistry;
	readonly #candidateByPath: ReadonlyMap<string, ReleaseCandidate>;
	readonly #failPublishPath: string | undefined;
	#verificationFailures: number;

	constructor(
		registry: InMemoryRegistry,
		candidates: readonly ReleaseCandidate[],
		options: { failPublishPath?: string; verificationFailures?: number } = {},
	) {
		this.#registry = registry;
		this.#candidateByPath = new Map(
			candidates.map((candidate) => [candidate.tarballPath, candidate]),
		);
		this.#failPublishPath = options.failPublishPath;
		this.#verificationFailures = options.verificationFailures ?? 0;
	}

	async qualify(): Promise<OperationResult> {
		return { ok: true };
	}

	async publishTarball(tarballPath: string): Promise<OperationResult> {
		this.publishedPaths.push(tarballPath);
		if (tarballPath === this.#failPublishPath) {
			return { ok: false, error: { code: "publish-failed", message: "npm failed" } };
		}
		const candidate = this.#candidateByPath.get(tarballPath);
		if (candidate === undefined) throw new Error(`Unexpected tarball: ${tarballPath}`);
		this.#registry.publish(candidate);
		return { ok: true };
	}

	async verify(options: { readonly version: string; readonly candidateReportPath: string }) {
		this.verifyCalls.push({ ...options });
		if (this.#verificationFailures > 0) {
			this.#verificationFailures -= 1;
			return { ok: false as const, error: { code: "not-propagated", message: "wait" } };
		}
		return { ok: true as const };
	}
}

class InMemoryConfirmation implements ReleaseConfirmationGateway {
	readonly versions: string[] = [];
	readonly #answer: boolean;

	constructor(answer = true) {
		this.#answer = answer;
	}

	async confirmPublish(requestedVersion: string) {
		this.versions.push(requestedVersion);
		return { ok: true as const, value: this.#answer };
	}
}

class InMemoryReports implements ReleaseReportStore {
	readonly writes: ReleaseTransactionReport[] = [];
	#report: ReleaseTransactionReport;
	readonly #failWriteNumber: number | undefined;
	#writesAttempted = 0;

	constructor(report: ReleaseTransactionReport, failWriteNumber?: number) {
		this.#report = copyReport(report);
		this.#failWriteNumber = failWriteNumber;
	}

	async read(): Promise<OptionalResult<ReleaseTransactionReport>> {
		return { type: "found", value: copyReport(this.#report) };
	}

	async writeAtomic(_path: string, report: ReleaseTransactionReport): Promise<OperationResult> {
		this.#writesAttempted += 1;
		if (this.#writesAttempted === this.#failWriteNumber) {
			return { ok: false, error: { code: "report-write-failed", message: "injected" } };
		}
		this.#report = copyReport(report);
		this.writes.push(copyReport(report));
		return { ok: true };
	}
}

class InMemoryDelay implements ReleaseDelay {
	readonly waits: number[] = [];

	async wait(delayMs: number): Promise<void> {
		this.waits.push(delayMs);
	}
}

describe("transactional npm publication", () => {
	it("publishes every fresh frozen tarball in canonical order and records every stage", async () => {
		const harness = makeHarness();
		const result = await run(harness);

		expect(result.type).toBe("verified");
		expect(result.plan.releaseCommit).toBe("release-commit");
		expect(result.plan.classifications.map((entry) => entry.classification.type)).toEqual(
			publicPublishOrder.map(() => "missing"),
		);
		expect(harness.confirmation.versions).toEqual([version]);
		expect(harness.commands.publishedPaths).toEqual(
			makeReport().candidates.map((item) => item.tarballPath),
		);
		expect(harness.commands.publishedPaths.every((path) => path.endsWith(".tgz"))).toBe(true);
		expect(harness.commands.publishedPaths.some((path) => path.includes("/qualified/"))).toBe(
			false,
		);
		expect(harness.reports.writes.map((report) => report.stage)).toEqual([
			...publicPublishOrder.flatMap(() => ["publishing", "publishing"]),
			"published",
			"verified",
		]);
		expect(harness.reports.writes.at(-1)?.completedWrites).toEqual(publicPublishOrder);
	});

	it("declines once with zero npm or report writes", async () => {
		const harness = makeHarness({ confirmation: false });
		const result = await run(harness);
		expect(result).toMatchObject({ type: "refused", error: { code: "publish-declined" } });
		expect(harness.confirmation.versions).toEqual([version]);
		expect(harness.commands.publishedPaths).toEqual([]);
		expect(harness.reports.writes).toEqual([]);
	});

	it("stops an ambiguous failed npm write without republishing it", async () => {
		const report = makeReport();
		const registry = new InMemoryRegistry();
		const reports = new InMemoryReports(report);
		const secondCandidate = report.candidates[1];
		if (secondCandidate === undefined) throw new Error("Test requires at least two candidates");
		const first = makeHarness({
			report,
			registry,
			reports,
			failPublishPath: secondCandidate.tarballPath,
		});
		const failed = await run(first);
		expect(failed.type).toBe("refused");
		expect(reports.writes).toHaveLength(3);
		expect(reports.writes[1]?.completedWrites).toEqual([publicPublishOrder[0]]);
		const resumedReport = reports.writes[2]!;
		expect(resumedReport.pendingWrite).toBe(publicPublishOrder[1]);

		const resumed = makeHarness({ report: resumedReport, registry, reports });
		const result = await run(resumed);
		expect(result).toMatchObject({
			type: "refused",
			error: { code: "pending-write-ambiguous" },
		});
		expect(resumed.commands.publishedPaths).toEqual([]);
	});

	it("recovers an exact pending npm write after the completion-report write fails", async () => {
		const report = makeReport();
		const registry = new InMemoryRegistry();
		const reports = new InMemoryReports(report, 2);
		const first = makeHarness({ report, registry, reports });
		const failed = await run(first);
		expect(failed).toMatchObject({
			type: "refused",
			error: { code: "report-write-failed" },
			report: { pendingWrite: publicPublishOrder[0] },
		});

		const pendingReport = reports.writes[0]!;
		const resumed = makeHarness({ report: pendingReport, registry });
		const result = await run(resumed);
		expect(result.type).toBe("verified");
		expect(resumed.commands.publishedPaths).toEqual(
			pendingReport.candidates.slice(1).map((candidate) => candidate.tarballPath),
		);
	});

	it("does not republish a pending npm write when registry readback is missing", async () => {
		const report = makeReport();
		const registry = new InMemoryRegistry();
		const reports = new InMemoryReports(report, 2);
		const first = makeHarness({ report, registry, reports });
		await run(first);
		registry.markMissing(publicPublishOrder[0]!);
		const pendingReport = reports.writes[0]!;
		const resumed = makeHarness({ report: pendingReport, registry });
		const result = await run(resumed);
		expect(result).toMatchObject({
			type: "refused",
			error: { code: "pending-write-ambiguous" },
		});
		expect(resumed.commands.publishedPaths).toEqual([]);
	});

	it.each([
		[
			"hash mismatch",
			{ type: "found", value: { integrity: "sha512-other", shasum: "other" } } as const,
			"published-package-hash-mismatch",
		],
		[
			"registry error",
			{ type: "error", error: { code: "registry-down", message: "unavailable" } } as const,
			"registry-down",
		],
	] as const)(
		"classifies all candidates and refuses %s before writes",
		async (_label, state, code) => {
			const registry = new InMemoryRegistry(new Map([[publicPublishOrder[0]!, state]]));
			const harness = makeHarness({ registry });
			const result = await run(harness);
			expect(result).toMatchObject({ type: "refused", error: { code } });
			expect(registry.reads).toHaveLength(publicPublishOrder.length);
			expect(harness.confirmation.versions).toEqual([]);
			expect(harness.commands.publishedPaths).toEqual([]);
			expect(harness.reports.writes).toEqual([]);
		},
	);

	it("verifies an all-already-exact published report without confirmation or republishing", async () => {
		const report = { ...makeReport(), stage: "published" as const };
		const registry = exactRegistry(report);
		const harness = makeHarness({ report, registry });
		const result = await run(harness);
		expect(result.type).toBe("verified");
		expect(result.plan.tarballWritePlan).toEqual([]);
		expect(harness.confirmation.versions).toEqual([]);
		expect(harness.commands.publishedPaths).toEqual([]);
		expect(harness.reports.writes.map((item) => item.stage)).toEqual(["verified"]);
	});

	it("does not republish completed writes while registry readback is still propagating", async () => {
		const baseReport = makeReport();
		const report = {
			...baseReport,
			completedWrites: [...publicPublishOrder],
			stage: "published" as const,
		};
		const harness = makeHarness({ report });
		const result = await run(harness);

		expect(result.type).toBe("verified");
		expect(result.plan.classifications.map((entry) => entry.classification.type)).toEqual(
			publicPublishOrder.map(() => "missing"),
		);
		expect(result.plan.tarballWritePlan).toEqual([]);
		expect(harness.confirmation.versions).toEqual([]);
		expect(harness.commands.publishedPaths).toEqual([]);
		expect(harness.reports.writes.map((item) => item.stage)).toEqual(["verified"]);
	});

	it("retries candidate-aware strict verification through registry propagation", async () => {
		const report = { ...makeReport(), stage: "published" as const };
		const harness = makeHarness({
			report,
			registry: exactRegistry(report),
			verificationFailures: 2,
		});
		const result = await run(harness, [10, 20, 30]);
		expect(result.type).toBe("verified");
		expect(harness.commands.verifyCalls).toEqual([
			{ version, candidateReportPath: reportPath },
			{ version, candidateReportPath: reportPath },
			{ version, candidateReportPath: reportPath },
		]);
		expect(harness.delay.waits).toEqual([10, 20]);
	});
});

interface Harness {
	readonly report: ReleaseTransactionReport;
	readonly registry: InMemoryRegistry;
	readonly commands: InMemoryCommands;
	readonly confirmation: InMemoryConfirmation;
	readonly reports: InMemoryReports;
	readonly delay: InMemoryDelay;
}

function makeHarness(
	options: {
		readonly report?: ReleaseTransactionReport;
		readonly registry?: InMemoryRegistry;
		readonly reports?: InMemoryReports;
		readonly confirmation?: boolean;
		readonly failPublishPath?: string;
		readonly verificationFailures?: number;
	} = {},
): Harness {
	const report = options.report ?? makeReport();
	const registry = options.registry ?? new InMemoryRegistry();
	return {
		report,
		registry,
		commands: new InMemoryCommands(registry, report.candidates, {
			...(options.failPublishPath === undefined
				? {}
				: { failPublishPath: options.failPublishPath }),
			...(options.verificationFailures === undefined
				? {}
				: { verificationFailures: options.verificationFailures }),
		}),
		confirmation: new InMemoryConfirmation(options.confirmation),
		reports: options.reports ?? new InMemoryReports(report),
		delay: new InMemoryDelay(),
	};
}

async function run(harness: Harness, verificationDelaysMs: readonly number[] = []) {
	return await executeReleasePublication(
		{
			registry: harness.registry,
			commands: harness.commands,
			confirmation: harness.confirmation,
			reports: harness.reports,
			delay: harness.delay,
		},
		{ report: harness.report, reportPath, verificationDelaysMs },
	);
}

function exactRegistry(report: ReleaseTransactionReport): InMemoryRegistry {
	return new InMemoryRegistry(
		new Map(
			report.candidates.map((candidate) => [
				candidate.name,
				{
					type: "found" as const,
					value: { integrity: candidate.integrity, shasum: candidate.shasum },
				},
			]),
		),
	);
}

function makeReport(): ReleaseTransactionReport {
	return {
		schemaVersion: 1,
		release: { branch: "release/1.2.3", commit: "release-commit", version },
		inventory: [...publicPublishOrder],
		candidates: publicPublishOrder.map((name, order) => ({
			name,
			version,
			tarballPath: `/release/${order}-${name.replaceAll("/", "-")}.tgz`,
			integrity: `sha512-${name}`,
			shasum: `sha1-${name}`,
			order,
		})),
		completedWrites: [],
		pendingWrite: null,
		stage: "candidates-prepared",
	};
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
