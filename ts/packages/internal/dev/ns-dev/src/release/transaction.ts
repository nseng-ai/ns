import type {
	CandidateFileGateway,
	CandidatePublicationClassification,
	FreshReleaseGateway,
	NpmCandidateGateway,
	NpmRegistryGateway,
	ReleaseCandidate,
	ReleaseCommandGateway,
	ReleaseConfirmationGateway,
	ReleaseDelay,
	ReleaseFailure,
	ReleaseProgressReporter,
	ReleaseReportStore,
	ReleaseTransactionReport,
	ResumeReleaseGateway,
} from "./contracts.ts";
import { startFreshRelease } from "./fresh.ts";
import { executeReleasePublication } from "./publication.ts";
import { recoverCheckpointingReport, validateReleaseResume } from "./resume.ts";

export interface RunReleaseTransactionContext {
	readonly release: FreshReleaseGateway;
	readonly resume: ResumeReleaseGateway;
	readonly npmCandidates: NpmCandidateGateway;
	readonly reports: ReleaseReportStore;
	readonly candidateFiles: CandidateFileGateway;
	readonly registry: NpmRegistryGateway;
	readonly confirmation: ReleaseConfirmationGateway;
	readonly commands: ReleaseCommandGateway;
	readonly delay: ReleaseDelay;
	readonly reportPathForVersion: (version: string) => string;
	readonly releaseDirectoryForVersion: (version: string) => string;
	readonly verificationDelaysMs: readonly number[];
	readonly onProgress?: ReleaseProgressReporter;
}

export interface ReleaseTransactionEvidence {
	readonly version: string;
	readonly mode: "fresh" | "resume";
	readonly reportPath: string;
	readonly releaseCommit: string | null;
	readonly candidates: readonly ReleaseCandidate[];
	readonly classifications: readonly CandidatePublicationClassification[];
	readonly writes: readonly string[];
	readonly finalStatus: "verified" | "refused";
}

export type RunReleaseTransactionResult =
	| { readonly type: "verified"; readonly evidence: ReleaseTransactionEvidence }
	| {
			readonly type: "refused";
			readonly evidence: ReleaseTransactionEvidence;
			readonly error: ReleaseFailure;
	  };

export async function runReleaseTransaction(
	context: RunReleaseTransactionContext,
	version: string,
): Promise<RunReleaseTransactionResult> {
	const reportPath = context.reportPathForVersion(version);
	context.onProgress?.(`Loading release state for ${version}...`);
	const loaded = await context.reports.read(reportPath);
	let mode: "fresh" | "resume";
	let report: ReleaseTransactionReport;
	if (loaded.type === "error") {
		return refused(emptyEvidence(version, "resume", reportPath), loaded.error);
	}
	if (loaded.type === "found") {
		mode = "resume";
		context.onProgress?.(
			`Resuming release from stage ${loaded.value.stage}; validating checkpoint and candidates...`,
		);
		const evidence = evidenceFromReport(version, mode, reportPath, loaded.value);
		if (loaded.value.release.version !== version) {
			return refused(evidence, {
				code: "wrong-requested-version",
				message: `Report version ${loaded.value.release.version} does not match requested version ${version}`,
			});
		}
		const state = await context.resume.inspectResumeState();
		if (!state.ok) return refused(evidence, state.error);
		if (!state.value.isWorktreeClean) {
			return refused(evidence, {
				code: "release-worktree-dirty",
				message: "Resuming a release requires a clean worktree",
			});
		}
		const validationOptions = {
			reportPath,
			currentBranch: state.value.currentBranch,
			headCommit: state.value.headCommit,
			coordinatedVersion: state.value.coordinatedVersion,
		};
		const validated =
			loaded.value.stage === "checkpointing"
				? await recoverCheckpointingReport(
						{ reports: context.reports, candidateFiles: context.candidateFiles },
						{ ...validationOptions, headParentCommit: state.value.headParentCommit },
					)
				: await validateReleaseResume(
						{ reports: context.reports, candidateFiles: context.candidateFiles },
						validationOptions,
					);
		if (validated.type === "refused") {
			return refused(evidence, { code: validated.code, message: validated.message });
		}
		report = validated.report;
	} else {
		mode = "fresh";
		context.onProgress?.("No existing release report found; starting a fresh release.");
		const started = await startFreshRelease(
			{
				release: context.release,
				npmCandidates: context.npmCandidates,
				reports: context.reports,
				...(context.onProgress === undefined ? {} : { onProgress: context.onProgress }),
			},
			{
				version,
				reportPath,
				releaseDirectory: context.releaseDirectoryForVersion(version),
			},
		);
		if (started.type === "refused") {
			return refused(emptyEvidence(version, mode, reportPath), started.error);
		}
		report = started.report;
	}

	const executed = await executeReleasePublication(
		{
			registry: context.registry,
			confirmation: context.confirmation,
			commands: context.commands,
			reports: context.reports,
			delay: context.delay,
			...(context.onProgress === undefined ? {} : { onProgress: context.onProgress }),
		},
		{ report, reportPath, verificationDelaysMs: context.verificationDelaysMs },
	);
	const evidence: ReleaseTransactionEvidence = {
		version,
		mode,
		reportPath,
		releaseCommit: report.release.commit,
		candidates: executed.plan.candidates.map((candidate) => ({ ...candidate })),
		classifications: executed.plan.classifications.map((entry) => ({
			candidate: { ...entry.candidate },
			classification: entry.classification,
		})),
		writes: [...executed.report.completedWrites],
		finalStatus: executed.type === "verified" ? "verified" : "refused",
	};
	return executed.type === "verified"
		? { type: "verified", evidence }
		: refused(evidence, executed.error);
}

function evidenceFromReport(
	version: string,
	mode: "fresh" | "resume",
	reportPath: string,
	report: ReleaseTransactionReport,
): ReleaseTransactionEvidence {
	return {
		version,
		mode,
		reportPath,
		releaseCommit: report.release.commit,
		candidates: report.candidates.map((candidate) => ({ ...candidate })),
		classifications: [],
		writes: [...report.completedWrites],
		finalStatus: report.stage === "verified" ? "verified" : "refused",
	};
}

function emptyEvidence(
	version: string,
	mode: "fresh" | "resume",
	reportPath: string,
): ReleaseTransactionEvidence {
	return {
		version,
		mode,
		reportPath,
		releaseCommit: null,
		candidates: [],
		classifications: [],
		writes: [],
		finalStatus: "refused",
	};
}

function refused(
	evidence: ReleaseTransactionEvidence,
	error: ReleaseFailure,
): RunReleaseTransactionResult {
	return { type: "refused", evidence: { ...evidence, finalStatus: "refused" }, error };
}
