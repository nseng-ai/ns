import type {
	CandidatePublicationClassification,
	ExecuteReleaseContext,
	ExecuteReleaseOptions,
	ExecuteReleaseResult,
	OptionalResult,
	RegistryPackageMetadata,
	RegistryClassification,
	ReleaseCandidate,
	ReleaseExecutionPlan,
	ReleaseFailure,
	ReleaseTransactionReport,
} from "./contracts.ts";

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
