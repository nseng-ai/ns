import { resolve } from "node:path";

import {
	intendedPublicPackages,
	publicPublishOrder,
	workspaceRoot,
} from "./public-package-set.mjs";

export const releaseTransactionStages = [
	"preparing-candidates",
	"candidates-prepared",
	"checkpointing",
	"publishing",
	"published",
	"verified",
] as const;

export type ReleaseTransactionStage = (typeof releaseTransactionStages)[number];

export interface ReleaseIdentity {
	readonly branch: string;
	readonly commit: string;
	readonly version: string;
}

export interface QualifiedPublishRoot {
	readonly name: string;
	readonly path: string;
}

export interface ReleaseCandidate {
	readonly name: string;
	readonly version: string;
	readonly tarballPath: string;
	readonly integrity: string;
	readonly shasum: string;
	readonly order: number;
}

export interface ReleaseTransactionReport {
	readonly schemaVersion: 1;
	readonly release: ReleaseIdentity;
	readonly inventory: readonly string[];
	readonly candidates: readonly ReleaseCandidate[];
	readonly completedWrites: readonly string[];
	readonly pendingWrite: string | null;
	readonly stage: ReleaseTransactionStage;
}

export interface ReleaseFailure {
	readonly code: string;
	readonly message: string;
}

export type OperationResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: ReleaseFailure };
export type ValueResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: ReleaseFailure };
export type OptionalResult<T> =
	| { readonly type: "found"; readonly value: T }
	| { readonly type: "missing" }
	| { readonly type: "error"; readonly error: ReleaseFailure };

export interface NpmCandidateGateway {
	pack(options: {
		readonly publishRoot: string;
		readonly packDestination: string;
	}): Promise<
		ValueResult<Omit<ReleaseCandidate, "order" | "tarballPath"> & { readonly tarballPath: string }>
	>;
}

export interface ReleaseReportStore {
	read(reportPath: string): Promise<OptionalResult<ReleaseTransactionReport>>;
	writeAtomic(reportPath: string, report: ReleaseTransactionReport): Promise<OperationResult>;
}

export type CandidateFileState =
	| { readonly type: "exact" }
	| { readonly type: "missing" }
	| {
			readonly type: "hash-mismatch";
			readonly actualIntegrity: string;
			readonly actualShasum: string;
	  }
	| { readonly type: "error"; readonly error: ReleaseFailure };

export interface CandidateFileGateway {
	classify(candidate: ReleaseCandidate): Promise<CandidateFileState>;
}

export interface RegistryPackageMetadata {
	readonly integrity: string;
	readonly shasum: string;
}

export interface NpmRegistryGateway {
	readPackageMetadata(
		name: string,
		version: string,
	): Promise<OptionalResult<RegistryPackageMetadata>>;
}

export interface ReleaseConfirmationGateway {
	confirmPublish(version: string): Promise<ValueResult<boolean>>;
}

export interface ReleaseCommandGateway {
	qualify(version: string): Promise<OperationResult>;
	publishTarball(tarballPath: string): Promise<OperationResult>;
	verify(options: {
		readonly version: string;
		readonly candidateReportPath: string;
	}): Promise<OperationResult>;
}

export interface FreshReleaseState {
	readonly currentBranch: string;
	readonly headCommit: string;
	readonly trunkBranch: string;
	readonly isGraphiteTracked: boolean;
	readonly isWorktreeClean: boolean;
	readonly releaseBranchExists: boolean;
	readonly sourceManifestPaths: readonly string[];
}

export interface ReleaseCheckpoint {
	readonly branch: string;
	readonly commit: string;
	readonly isWorktreeClean: boolean;
}

export interface FreshReleaseGateway {
	inspectFreshState(releaseBranch: string): Promise<ValueResult<FreshReleaseState>>;
	bumpCoordinatedVersion(version: string): Promise<OperationResult>;
	qualifyPublicPackages(version: string): Promise<ValueResult<readonly QualifiedPublishRoot[]>>;
	listTrackedChanges(): Promise<ValueResult<readonly string[]>>;
	stageReleaseFiles(paths: readonly string[]): Promise<OperationResult>;
	createReleaseCheckpoint(options: {
		readonly branch: string;
		readonly message: string;
	}): Promise<ValueResult<ReleaseCheckpoint>>;
	inspectCheckpoint(): Promise<ValueResult<ReleaseCheckpoint>>;
}

export interface FreshReleasePlan {
	readonly version: string;
	readonly releaseBranch: string;
	readonly stages: readonly string[];
	readonly packages: readonly string[];
}

export type PlanFreshReleaseResult =
	| { readonly type: "planned"; readonly plan: FreshReleasePlan }
	| { readonly type: "refused"; readonly error: ReleaseFailure };

/** Runs the complete read-only preflight and returns the deterministic release plan. */
export async function planFreshRelease(
	release: FreshReleaseGateway,
	version: string,
): Promise<PlanFreshReleaseResult> {
	const versionResult = validateConcreteNpmVersion(version);
	if (!versionResult.ok) return { type: "refused", error: versionResult.error };
	const releaseBranch = releaseBranchName(version);
	const inspected = await release.inspectFreshState(releaseBranch);
	if (!inspected.ok) return { type: "refused", error: inspected.error };
	const preflightFailure = validateFreshState(inspected.value);
	if (preflightFailure !== undefined) return { type: "refused", error: preflightFailure };
	return {
		type: "planned",
		plan: {
			version,
			releaseBranch,
			stages: [
				"preflight",
				"bump-coordinated-version",
				"qualify-public-package-set",
				"freeze-candidates",
				"graphite-checkpoint",
				"classify-registry",
				"confirm-publish",
				"publish-tarballs",
				"verify-registry",
			],
			packages: orderedReleaseInventory(),
		},
	};
}

export interface StartFreshReleaseContext {
	readonly release: FreshReleaseGateway;
	readonly npmCandidates: NpmCandidateGateway;
	readonly reports: ReleaseReportStore;
}

export interface StartFreshReleaseOptions {
	readonly version: string;
	readonly reportPath: string;
	readonly releaseDirectory?: string;
}

export type StartFreshReleaseResult =
	| { readonly type: "checkpointed"; readonly report: ReleaseTransactionReport }
	| { readonly type: "refused"; readonly error: ReleaseFailure };

export interface ReleaseDelay {
	wait(delayMs: number): Promise<void>;
}

export interface PrepareCandidatesContext {
	readonly npmCandidates: NpmCandidateGateway;
	readonly reports: ReleaseReportStore;
}

export interface PrepareCandidatesOptions {
	readonly identity: ReleaseIdentity;
	readonly publishRoots: readonly QualifiedPublishRoot[];
	readonly reportPath: string;
	readonly releaseDirectory?: string;
}

export type PrepareCandidatesResult =
	| { readonly type: "prepared"; readonly report: ReleaseTransactionReport }
	| {
			readonly type: "refused";
			readonly error: ReleaseFailure;
			readonly report: ReleaseTransactionReport;
	  };

export function orderedReleaseInventory(): readonly string[] {
	assertInventory(publicPublishOrder, intendedPublicPackages);
	return [...publicPublishOrder];
}

/** Derives the one release branch name used by preflight and Graphite checkpoint creation. */
export function releaseBranchName(version: string): string {
	const sanitizedVersion = version.replaceAll(/[^0-9A-Za-z._-]/g, "-");
	return `transactional-npm-release/v${sanitizedVersion}`;
}

/**
 * Runs the mutating half of a fresh release through a dedicated Graphite checkpoint.
 * Failures deliberately leave prior bump, qualification, candidate, and Graphite effects intact.
 */
export async function startFreshRelease(
	context: StartFreshReleaseContext,
	options: StartFreshReleaseOptions,
): Promise<StartFreshReleaseResult> {
	const versionResult = validateConcreteNpmVersion(options.version);
	if (!versionResult.ok) return { type: "refused", error: versionResult.error };
	const branch = releaseBranchName(options.version);
	const inspected = await context.release.inspectFreshState(branch);
	if (!inspected.ok) return { type: "refused", error: inspected.error };
	const preflightFailure = validateFreshState(inspected.value);
	if (preflightFailure !== undefined) return { type: "refused", error: preflightFailure };

	const expectedPaths = [...inspected.value.sourceManifestPaths, "ts/pnpm-lock.yaml"].sort();
	const bump = await context.release.bumpCoordinatedVersion(options.version);
	if (!bump.ok) return { type: "refused", error: bump.error };
	const qualified = await context.release.qualifyPublicPackages(options.version);
	if (!qualified.ok) return { type: "refused", error: qualified.error };

	const prepared = await prepareFrozenCandidates(
		{ npmCandidates: context.npmCandidates, reports: context.reports },
		{
			identity: {
				branch: inspected.value.currentBranch,
				commit: inspected.value.headCommit,
				version: options.version,
			},
			publishRoots: qualified.value,
			reportPath: options.reportPath,
			...(options.releaseDirectory === undefined
				? {}
				: { releaseDirectory: options.releaseDirectory }),
		},
	);
	if (prepared.type === "refused") return { type: "refused", error: prepared.error };

	const changes = await context.release.listTrackedChanges();
	if (!changes.ok) return { type: "refused", error: changes.error };
	const changeFailure = validateExpectedChanges(changes.value, expectedPaths);
	if (changeFailure !== undefined) return { type: "refused", error: changeFailure };
	const staged = await context.release.stageReleaseFiles(expectedPaths);
	if (!staged.ok) return { type: "refused", error: staged.error };

	const checkpointingReport: ReleaseTransactionReport = {
		...prepared.report,
		release: { branch, commit: inspected.value.headCommit, version: options.version },
		stage: "checkpointing",
	};
	const checkpointingWrite = await context.reports.writeAtomic(
		options.reportPath,
		checkpointingReport,
	);
	if (!checkpointingWrite.ok) return { type: "refused", error: checkpointingWrite.error };

	const checkpoint = await context.release.createReleaseCheckpoint({
		branch,
		message: `Release public packages at ${options.version}`,
	});
	if (!checkpoint.ok) return { type: "refused", error: checkpoint.error };
	const checkpointFailure = validateCheckpoint(
		checkpoint.value,
		branch,
		inspected.value.headCommit,
	);
	if (checkpointFailure !== undefined) return { type: "refused", error: checkpointFailure };

	const persistedReport: ReleaseTransactionReport = {
		...checkpointingReport,
		release: { branch, commit: checkpoint.value.commit, version: options.version },
		stage: "candidates-prepared",
	};
	const persisted = await context.reports.writeAtomic(options.reportPath, persistedReport);
	if (!persisted.ok) return { type: "refused", error: persisted.error };
	const finalState = await context.release.inspectCheckpoint();
	if (!finalState.ok) return { type: "refused", error: finalState.error };
	const finalFailure = validateCheckpoint(finalState.value, branch, inspected.value.headCommit);
	if (finalFailure !== undefined) return { type: "refused", error: finalFailure };
	if (finalState.value.commit !== checkpoint.value.commit) {
		return {
			type: "refused",
			error: {
				code: "release-checkpoint-changed",
				message: "Release checkpoint identity changed while persisting the report",
			},
		};
	}
	return { type: "checkpointed", report: persistedReport };
}

export async function prepareFrozenCandidates(
	context: PrepareCandidatesContext,
	options: PrepareCandidatesOptions,
): Promise<PrepareCandidatesResult> {
	const inventory = orderedReleaseInventory();
	const rootsResult = orderPublishRoots(options.publishRoots, inventory);
	const initialReport: ReleaseTransactionReport = {
		schemaVersion: 1,
		release: options.identity,
		inventory,
		candidates: [],
		completedWrites: [],
		pendingWrite: null,
		stage: "preparing-candidates",
	};
	if (!rootsResult.ok) return { type: "refused", error: rootsResult.error, report: initialReport };

	const initialWrite = await context.reports.writeAtomic(options.reportPath, initialReport);
	if (!initialWrite.ok)
		return { type: "refused", error: initialWrite.error, report: initialReport };

	const packDestination =
		options.releaseDirectory ??
		resolve(workspaceRoot, "dist", "releases", options.identity.version);
	let report = initialReport;
	for (const [order, root] of rootsResult.value.entries()) {
		const packed = await context.npmCandidates.pack({ publishRoot: root.path, packDestination });
		if (!packed.ok) return { type: "refused", error: packed.error, report };
		if (packed.value.name !== root.name || packed.value.version !== options.identity.version) {
			return {
				type: "refused",
				error: {
					code: "candidate-identity-mismatch",
					message: `npm pack returned ${packed.value.name}@${packed.value.version}; expected ${root.name}@${options.identity.version}`,
				},
				report,
			};
		}
		const candidate: ReleaseCandidate = { ...packed.value, order };
		const candidateReport = { ...report, candidates: [...report.candidates, candidate] };
		const candidateWrite = await context.reports.writeAtomic(options.reportPath, candidateReport);
		if (!candidateWrite.ok) return { type: "refused", error: candidateWrite.error, report };
		report = candidateReport;
	}

	const completedReport: ReleaseTransactionReport = { ...report, stage: "candidates-prepared" };
	const finalWrite = await context.reports.writeAtomic(options.reportPath, completedReport);
	if (!finalWrite.ok) return { type: "refused", error: finalWrite.error, report };
	return { type: "prepared", report: completedReport };
}

export type ResumeRefusalCode =
	| "report-missing"
	| "report-read-error"
	| "wrong-branch"
	| "wrong-commit"
	| "wrong-parent-commit"
	| "wrong-version"
	| "wrong-inventory"
	| "candidate-inventory-mismatch"
	| "candidate-missing"
	| "candidate-hash-mismatch"
	| "candidate-read-error";

export type ResumeValidationResult =
	| { readonly type: "valid"; readonly report: ReleaseTransactionReport }
	| { readonly type: "refused"; readonly code: ResumeRefusalCode; readonly message: string };

export interface ResumeReleaseState {
	readonly currentBranch: string;
	readonly headCommit: string;
	readonly headParentCommit: string;
	readonly isWorktreeClean: boolean;
	readonly coordinatedVersion: string;
}

export interface ResumeReleaseGateway {
	inspectResumeState(): Promise<ValueResult<ResumeReleaseState>>;
}

export interface ValidateResumeOptions {
	readonly reportPath: string;
	readonly currentBranch: string;
	readonly headCommit: string;
	readonly coordinatedVersion: string;
}

export interface RecoverCheckpointingOptions extends ValidateResumeOptions {
	readonly headParentCommit: string;
}

export async function validateReleaseResume(
	context: { readonly reports: ReleaseReportStore; readonly candidateFiles: CandidateFileGateway },
	options: ValidateResumeOptions,
): Promise<ResumeValidationResult> {
	const loaded = await context.reports.read(options.reportPath);
	if (loaded.type === "missing")
		return refuse("report-missing", `Release report is missing: ${options.reportPath}`);
	if (loaded.type === "error") return refuse("report-read-error", loaded.error.message);
	return await validateReportContentsAndCandidates(context, loaded.value, options);
}

async function validateReportContentsAndCandidates(
	context: { readonly candidateFiles: CandidateFileGateway },
	report: ReleaseTransactionReport,
	options: Omit<ValidateResumeOptions, "reportPath">,
): Promise<ResumeValidationResult> {
	const metadataResult = validateResumeMetadata(report, options);
	if (metadataResult.type === "refused") return metadataResult;

	for (const candidate of report.candidates) {
		const state = await context.candidateFiles.classify(candidate);
		if (state.type === "missing")
			return refuse("candidate-missing", `Frozen candidate is missing: ${candidate.tarballPath}`);
		if (state.type === "hash-mismatch") {
			return refuse(
				"candidate-hash-mismatch",
				`Frozen candidate hashes changed: ${candidate.tarballPath}`,
			);
		}
		if (state.type === "error") return refuse("candidate-read-error", state.error.message);
	}
	return { type: "valid", report };
}

/** Adopts only the uniquely provable Graphite checkpoint left after a report-write failure. */
export async function recoverCheckpointingReport(
	context: { readonly reports: ReleaseReportStore; readonly candidateFiles: CandidateFileGateway },
	options: RecoverCheckpointingOptions,
): Promise<ResumeValidationResult> {
	const loaded = await context.reports.read(options.reportPath);
	if (loaded.type === "missing")
		return refuse("report-missing", `Release report is missing: ${options.reportPath}`);
	if (loaded.type === "error") return refuse("report-read-error", loaded.error.message);
	const report = loaded.value;
	if (report.stage !== "checkpointing") {
		return refuse("wrong-commit", "Release report is not awaiting Graphite checkpoint recovery");
	}
	if (report.release.branch !== options.currentBranch) {
		return refuse(
			"wrong-branch",
			`Report branch ${report.release.branch} does not match current branch ${options.currentBranch}`,
		);
	}
	if (report.release.commit !== options.headParentCommit) {
		return refuse(
			"wrong-parent-commit",
			`Report parent commit ${report.release.commit} does not match HEAD parent ${options.headParentCommit}`,
		);
	}
	const candidateValidation = await validateReportContentsAndCandidates(context, report, {
		...options,
		headCommit: report.release.commit,
	});
	if (candidateValidation.type === "refused") return candidateValidation;
	const recoveredReport: ReleaseTransactionReport = {
		...report,
		release: { ...report.release, commit: options.headCommit },
		stage: "candidates-prepared",
	};
	const persisted = await context.reports.writeAtomic(options.reportPath, recoveredReport);
	if (!persisted.ok) return refuse("report-read-error", persisted.error.message);
	return { type: "valid", report: recoveredReport };
}

export function validateResumeMetadata(
	report: ReleaseTransactionReport,
	options: Omit<ValidateResumeOptions, "reportPath">,
): ResumeValidationResult {
	if (report.release.branch !== options.currentBranch) {
		return refuse(
			"wrong-branch",
			`Report branch ${report.release.branch} does not match current branch ${options.currentBranch}`,
		);
	}
	if (report.release.commit !== options.headCommit) {
		return refuse(
			"wrong-commit",
			`Report commit ${report.release.commit} does not match HEAD ${options.headCommit}`,
		);
	}
	if (report.release.version !== options.coordinatedVersion) {
		return refuse(
			"wrong-version",
			`Report version ${report.release.version} does not match coordinated version ${options.coordinatedVersion}`,
		);
	}
	const inventory = orderedReleaseInventory();
	if (!sameOrderedValues(report.inventory, inventory)) {
		return refuse(
			"wrong-inventory",
			"Report package inventory does not match the ordered public package inventory",
		);
	}
	if (
		report.candidates.length !== inventory.length ||
		report.candidates.some(
			(candidate, order) =>
				candidate.name !== inventory[order] ||
				candidate.order !== order ||
				candidate.version !== report.release.version,
		)
	) {
		return refuse(
			"candidate-inventory-mismatch",
			"Report candidates do not exactly match the ordered package inventory",
		);
	}
	const completedWrites = new Set(report.completedWrites);
	if (
		completedWrites.size !== report.completedWrites.length ||
		report.completedWrites.some((name) => !inventory.includes(name)) ||
		(report.pendingWrite !== null &&
			(!inventory.includes(report.pendingWrite) || completedWrites.has(report.pendingWrite)))
	) {
		return refuse(
			"candidate-inventory-mismatch",
			"Report pending and completed writes do not match the package inventory",
		);
	}
	return { type: "valid", report };
}

export type RegistryClassification =
	| { readonly type: "missing" }
	| { readonly type: "published-exact" }
	| { readonly type: "published-mismatch"; readonly actual: RegistryPackageMetadata }
	| { readonly type: "registry-error"; readonly error: ReleaseFailure };

export interface CandidatePublicationClassification {
	readonly candidate: ReleaseCandidate;
	readonly classification: RegistryClassification;
}

export interface ReleaseExecutionPlan {
	readonly releaseCommit: string;
	readonly candidates: readonly ReleaseCandidate[];
	readonly classifications: readonly CandidatePublicationClassification[];
	readonly tarballWritePlan: readonly string[];
}

export interface ExecuteReleaseContext {
	readonly registry: NpmRegistryGateway;
	readonly confirmation: ReleaseConfirmationGateway;
	readonly commands: ReleaseCommandGateway;
	readonly reports: ReleaseReportStore;
	readonly delay: ReleaseDelay;
}

export interface ExecuteReleaseOptions {
	readonly report: ReleaseTransactionReport;
	readonly reportPath: string;
	readonly verificationDelaysMs: readonly number[];
}

export type ExecuteReleaseResult =
	| {
			readonly type: "verified";
			readonly plan: ReleaseExecutionPlan;
			readonly report: ReleaseTransactionReport;
	  }
	| {
			readonly type: "refused";
			readonly plan: ReleaseExecutionPlan;
			readonly error: ReleaseFailure;
			readonly report: ReleaseTransactionReport;
	  };

/**
 * Classifies the complete frozen set before any write, then publishes only missing tarballs.
 * Registry hashes, rather than report bookkeeping, are the resume source of truth.
 */
export async function executeReleasePublication(
	context: ExecuteReleaseContext,
	options: ExecuteReleaseOptions,
): Promise<ExecuteReleaseResult> {
	const classifications: CandidatePublicationClassification[] = [];
	for (const candidate of options.report.candidates) {
		const registryResult = await context.registry.readPackageMetadata(
			candidate.name,
			candidate.version,
		);
		classifications.push({
			candidate: { ...candidate },
			classification: classifyRegistryPackage(candidate, registryResult),
		});
	}
	const completedWrites = new Set(options.report.completedWrites);
	const pendingCandidate =
		options.report.pendingWrite === null
			? undefined
			: classifications.find((entry) => entry.candidate.name === options.report.pendingWrite);
	const tarballWritePlan = classifications
		.filter(
			(entry) =>
				entry.classification.type === "missing" && !completedWrites.has(entry.candidate.name),
		)
		.map((entry) => entry.candidate.tarballPath);
	const plan: ReleaseExecutionPlan = {
		releaseCommit: options.report.release.commit,
		candidates: options.report.candidates.map((candidate) => ({ ...candidate })),
		classifications,
		tarballWritePlan,
	};
	if (options.report.pendingWrite !== null) {
		if (pendingCandidate === undefined) {
			return refusedExecution(
				plan,
				options.report,
				"pending-write-invalid",
				`Pending package is not in the frozen inventory: ${options.report.pendingWrite}`,
			);
		}
		if (pendingCandidate.classification.type !== "published-exact") {
			return refusedExecution(
				plan,
				options.report,
				"pending-write-ambiguous",
				`Pending npm write ${pendingCandidate.candidate.name}@${pendingCandidate.candidate.version} is not exact in the registry; refusing to republish`,
			);
		}
	}
	const unsafeClassification = classifications.find(
		(entry) =>
			entry.classification.type === "published-mismatch" ||
			entry.classification.type === "registry-error",
	);
	if (unsafeClassification !== undefined) {
		const classification = unsafeClassification.classification;
		return {
			type: "refused",
			plan,
			error:
				classification.type === "registry-error"
					? classification.error
					: {
							code: "published-package-hash-mismatch",
							message: `Registry hashes do not match frozen candidate ${unsafeClassification.candidate.name}@${unsafeClassification.candidate.version}`,
						},
			report: options.report,
		};
	}
	if (tarballWritePlan.some((tarballPath) => !tarballPath.endsWith(".tgz"))) {
		return refusedExecution(
			plan,
			options.report,
			"invalid-publish-tarball",
			"The release write plan contains a non-.tgz candidate path",
		);
	}

	if (tarballWritePlan.length > 0) {
		const confirmation = await context.confirmation.confirmPublish(options.report.release.version);
		if (!confirmation.ok) {
			return { type: "refused", plan, error: confirmation.error, report: options.report };
		}
		if (!confirmation.value) {
			return refusedExecution(
				plan,
				options.report,
				"publish-declined",
				"Publish confirmation did not match; no registry writes performed",
			);
		}
	}

	let report = options.report;
	if (report.pendingWrite !== null) {
		const recoveredPendingReport: ReleaseTransactionReport = {
			...report,
			completedWrites: [...new Set([...report.completedWrites, report.pendingWrite])],
			pendingWrite: null,
			stage: "publishing",
		};
		const persisted = await context.reports.writeAtomic(options.reportPath, recoveredPendingReport);
		if (!persisted.ok) return { type: "refused", plan, error: persisted.error, report };
		completedWrites.add(report.pendingWrite);
		report = recoveredPendingReport;
	}
	for (const entry of classifications) {
		if (entry.classification.type !== "missing" || completedWrites.has(entry.candidate.name))
			continue;
		const pendingReport: ReleaseTransactionReport = {
			...report,
			pendingWrite: entry.candidate.name,
			stage: "publishing",
		};
		const pendingPersisted = await context.reports.writeAtomic(options.reportPath, pendingReport);
		if (!pendingPersisted.ok)
			return { type: "refused", plan, error: pendingPersisted.error, report };
		report = pendingReport;
		const published = await context.commands.publishTarball(entry.candidate.tarballPath);
		if (!published.ok) return { type: "refused", plan, error: published.error, report };
		const writeCompletedReport: ReleaseTransactionReport = {
			...report,
			completedWrites: [...new Set([...report.completedWrites, entry.candidate.name])],
			pendingWrite: null,
			stage: "publishing",
		};
		const persisted = await context.reports.writeAtomic(options.reportPath, writeCompletedReport);
		if (!persisted.ok) return { type: "refused", plan, error: persisted.error, report };
		report = writeCompletedReport;
	}
	if (report.stage !== "published" && report.stage !== "verified") {
		const publishedReport: ReleaseTransactionReport = { ...report, stage: "published" };
		const persisted = await context.reports.writeAtomic(options.reportPath, publishedReport);
		if (!persisted.ok) return { type: "refused", plan, error: persisted.error, report };
		report = publishedReport;
	}

	let verificationFailure: ReleaseFailure | undefined;
	for (let attempt = 0; attempt <= options.verificationDelaysMs.length; attempt += 1) {
		const verified = await context.commands.verify({
			version: report.release.version,
			candidateReportPath: options.reportPath,
		});
		if (verified.ok) {
			const verifiedReport: ReleaseTransactionReport = { ...report, stage: "verified" };
			const persisted = await context.reports.writeAtomic(options.reportPath, verifiedReport);
			if (!persisted.ok) return { type: "refused", plan, error: persisted.error, report };
			return { type: "verified", plan, report: verifiedReport };
		}
		verificationFailure = verified.error;
		const delayMs = options.verificationDelaysMs[attempt];
		if (delayMs !== undefined) await context.delay.wait(delayMs);
	}
	if (verificationFailure === undefined) throw new Error("Verification loop made no attempt");
	return { type: "refused", plan, error: verificationFailure, report };
}

function refusedExecution(
	plan: ReleaseExecutionPlan,
	report: ReleaseTransactionReport,
	code: string,
	message: string,
): ExecuteReleaseResult {
	return { type: "refused", plan, error: { code, message }, report };
}

export function classifyRegistryPackage(
	candidate: ReleaseCandidate,
	registryResult: OptionalResult<RegistryPackageMetadata>,
): RegistryClassification {
	if (registryResult.type === "missing") return { type: "missing" };
	if (registryResult.type === "error")
		return { type: "registry-error", error: registryResult.error };
	if (
		registryResult.value.integrity === candidate.integrity &&
		registryResult.value.shasum === candidate.shasum
	) {
		return { type: "published-exact" };
	}
	return { type: "published-mismatch", actual: registryResult.value };
}

function orderPublishRoots(
	publishRoots: readonly QualifiedPublishRoot[],
	inventory: readonly string[],
): ValueResult<readonly QualifiedPublishRoot[]> {
	const byName = new Map(publishRoots.map((root) => [root.name, root]));
	if (
		byName.size !== publishRoots.length ||
		!sameOrderedValues([...byName.keys()].sort(), [...inventory].sort())
	) {
		return {
			ok: false,
			error: {
				code: "publish-root-inventory-mismatch",
				message: "Qualified publish roots do not match the public package inventory",
			},
		};
	}
	return { ok: true, value: inventory.map((name) => requiredRoot(byName, name)) };
}

function requiredRoot(
	byName: ReadonlyMap<string, QualifiedPublishRoot>,
	name: string,
): QualifiedPublishRoot {
	const root = byName.get(name);
	if (root === undefined)
		throw new Error(`Missing qualified publish root after inventory validation: ${name}`);
	return root;
}

function assertInventory(order: readonly string[], intended: readonly string[]): void {
	if (
		new Set(order).size !== order.length ||
		!sameOrderedValues([...order].sort(), [...intended].sort())
	) {
		throw new Error(
			"Public publish order does not exactly match the intended public package inventory",
		);
	}
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateConcreteNpmVersion(version: string): OperationResult {
	const semverPattern =
		/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
	if (version.trim() === version && semverPattern.test(version)) return { ok: true };
	return {
		ok: false,
		error: {
			code: "invalid-release-version",
			message: `Release version must be a concrete npm semver, got: ${version}`,
		},
	};
}

function validateFreshState(state: FreshReleaseState): ReleaseFailure | undefined {
	if (!state.isWorktreeClean) {
		return {
			code: "release-worktree-dirty",
			message: "A fresh release requires an initially clean worktree",
		};
	}
	if (state.currentBranch === state.trunkBranch) {
		return {
			code: "release-on-trunk",
			message: `A release cannot start from resolved Graphite trunk ${state.trunkBranch}`,
		};
	}
	if (!state.isGraphiteTracked) {
		return {
			code: "release-branch-untracked",
			message: `Current branch ${state.currentBranch} is not tracked by Graphite`,
		};
	}
	if (state.releaseBranchExists) {
		return {
			code: "release-branch-collision",
			message: "The deterministic release branch already exists",
		};
	}
	if (
		state.sourceManifestPaths.length !== intendedPublicPackages.length ||
		new Set(state.sourceManifestPaths).size !== state.sourceManifestPaths.length
	) {
		return {
			code: "release-manifest-inventory-mismatch",
			message: "Canonical source manifests do not match the intended public package inventory",
		};
	}
	return undefined;
}

function validateExpectedChanges(
	actualPaths: readonly string[],
	expectedPaths: readonly string[],
): ReleaseFailure | undefined {
	const actual = [...new Set(actualPaths)].sort();
	const expected = [...new Set(expectedPaths)].sort();
	if (sameOrderedValues(actual, expected)) return undefined;
	const actualSet = new Set(actual);
	const expectedSet = new Set(expected);
	const missing = expected.filter((path) => !actualSet.has(path));
	const unexpected = actual.filter((path) => !expectedSet.has(path));
	return {
		code: "release-change-set-mismatch",
		message: `Release tracked changes are not exact. Missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}`,
	};
}

function validateCheckpoint(
	checkpoint: ReleaseCheckpoint,
	expectedBranch: string,
	previousCommit: string,
): ReleaseFailure | undefined {
	if (checkpoint.branch !== expectedBranch || checkpoint.commit === previousCommit) {
		return {
			code: "release-checkpoint-identity-mismatch",
			message: "Graphite did not create the requested dedicated release branch and commit",
		};
	}
	if (!checkpoint.isWorktreeClean) {
		return {
			code: "release-checkpoint-dirty",
			message: "Release worktree is not clean after the Graphite checkpoint",
		};
	}
	return undefined;
}

function refuse(code: ResumeRefusalCode, message: string): ResumeValidationResult {
	return { type: "refused", code, message };
}
