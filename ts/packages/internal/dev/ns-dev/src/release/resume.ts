import { intendedPublicPackages, publicPublishOrder } from "../public-packages/package-set.ts";

import type {
	CandidateFileGateway,
	RecoverCheckpointingOptions,
	ReleaseReportStore,
	ReleaseTransactionReport,
	ResumeRefusalCode,
	ResumeValidationResult,
	ValidateResumeOptions,
} from "./contracts.ts";

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
		return refuse(
			"report-not-checkpointing",
			"Release report is not awaiting Graphite checkpoint recovery",
		);
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
	if (!persisted.ok) return refuse("recovered-report-write-failed", persisted.error.message);
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
	const inventory = orderedResumeInventory();
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

function orderedResumeInventory(): readonly string[] {
	if (
		new Set(publicPublishOrder).size !== publicPublishOrder.length ||
		!sameOrderedValues([...publicPublishOrder].sort(), [...intendedPublicPackages].sort())
	) {
		throw new Error(
			"Public publish order does not exactly match the intended public package inventory",
		);
	}
	return [...publicPublishOrder];
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function refuse(code: ResumeRefusalCode, message: string): ResumeValidationResult {
	return { type: "refused", code, message };
}
